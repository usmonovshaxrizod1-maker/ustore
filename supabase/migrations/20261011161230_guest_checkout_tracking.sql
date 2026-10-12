begin;
alter table public.orders alter column tg_id drop not null;
alter table public.orders add column is_guest boolean not null default false;
alter table public.orders add column guest_tracking_code text;
alter table public.promotion_redemptions alter column tg_id drop not null;
alter table public.orders add constraint orders_guest_identity_check check ((is_guest and tg_id is null and account_id is null and guest_tracking_code ~ '^[0-9]{10}$' and guest_tracking_code is not null) or (not is_guest and tg_id is not null and guest_tracking_code is null));
create unique index orders_guest_tracking_code_unique on public.orders(guest_tracking_code) where guest_tracking_code is not null;

create or replace function public.ustore_set_guest_checkout(p_shop_id uuid,p_config jsonb) returns void language plpgsql security invoker set search_path=public as $$
begin
  if (p_config->>'enabled')::boolean and coalesce(p_config->>'phone','') !~ '^\+998[0-9]{9}$' then raise exception 'guest_contact_phone_required'; end if;
  update shop_settings set fulfillment_config=jsonb_set(coalesce(fulfillment_config,'{}'::jsonb),'{checkout}',p_config,true) where shop_id=p_shop_id;
  if not found then raise exception 'shop_settings_not_found'; end if;
end $$;
revoke all on function public.ustore_set_guest_checkout(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ustore_set_guest_checkout(uuid,jsonb) to service_role;

create table public.guest_request_limits(shop_id uuid not null references public.shops(id) on delete cascade,key text not null,window_start timestamptz not null,requests integer not null default 0,primary key(shop_id,key,window_start));
alter table public.guest_request_limits enable row level security;
revoke all on public.guest_request_limits from public,anon,authenticated;
grant all on public.guest_request_limits to service_role;
create index guest_request_limits_expiry on public.guest_request_limits(window_start);
create or replace function public.ustore_guest_rate_limit(p_shop_id uuid,p_key text,p_kind text) returns boolean language plpgsql security invoker set search_path=public as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now())/600)*600); n integer; g integer;
begin
  if p_kind not in ('CREATE','TRACK','PREVIEW') or p_key !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from guest_request_limits where window_start < now()-interval '1 hour';
  insert into guest_request_limits(shop_id,key,window_start,requests) values(p_shop_id,p_kind||':GLOBAL',w,1)
    on conflict(shop_id,key,window_start) do update set requests=guest_request_limits.requests+1 returning requests into g;
  insert into guest_request_limits(shop_id,key,window_start,requests) values(p_shop_id,p_kind||':'||p_key,w,1)
    on conflict(shop_id,key,window_start) do update set requests=guest_request_limits.requests+1 returning requests into n;
  return n<=case when p_kind='CREATE' then 5 else 30 end and g<=case when p_kind='CREATE' then 300 else 1000 end;
end $$;
revoke all on function public.ustore_guest_rate_limit(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ustore_guest_rate_limit(uuid,text,text) to service_role;

create or replace function public.ustore_place_guest_base(
  p_shop_id uuid,
  p_tg_id text,
  p_user_name text,
  p_phone text,
  p_region text,
  p_district text,
  p_address text,
  p_pay_method text,
  p_items jsonb, p_tracking_code text
) returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_size text;
  v_color text;
  v_price numeric;
  v_name text;
  v_sku text;
  v_img text;
  v_current_variants jsonb;
  v_current_stock int;
  v_matched_idx int;
  v_matched_qty int;
  v_matched_sku text;
  v_new_variants jsonb;
  v_new_stock int;
  v_total numeric := 0;
  v_enriched jsonb := '[]'::jsonb;
  v_order_id bigint;
  v_created_at timestamptz;
  v_movement_id bigint;
  v_movement_ids bigint[] := array[]::bigint[];
begin
  if p_tg_id is not null or p_tracking_code !~ '^[0-9]{10}$' then raise exception 'invalid_guest_principal'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_qty        := (v_item->>'qty')::int;
    v_size       := nullif(v_item->>'size', '');
    v_color      := nullif(v_item->>'color', '');
    -- Reset every per-item working variable explicitly: a SELECT ... INTO
    -- that matches zero rows does NOT clear the target in PL/pgSQL, so
    -- without this a later iteration could silently reuse a PREVIOUS
    -- iteration's matched-variant values.
    v_current_variants := null; v_current_stock := null;
    v_matched_idx := null; v_matched_qty := null; v_matched_sku := null;
    v_new_variants := null; v_new_stock := null;
    v_price := null; v_name := null; v_sku := null; v_img := null;

    if v_product_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid_qty:%', coalesce(v_item->>'product_id', '?');
    end if;

    select variants, stock into v_current_variants, v_current_stock
      from public.products
     where id = v_product_id and shop_id = p_shop_id and status <> 'DELETED'
       for update;

    if not found then
      raise exception 'insufficient_stock:%', v_product_id;
    end if;

    if v_current_variants is not null and jsonb_array_length(v_current_variants) > 0 then
      -- Identity match mirrors variantIdentity() in the old frontend/backend:
      -- case/diacritic-insensitive compare of (size, color).
      select idx - 1, (elem->>'qty')::int, elem->>'sku'
        into v_matched_idx, v_matched_qty, v_matched_sku
        from jsonb_array_elements(v_current_variants) with ordinality as t(elem, idx)
       where lower(trim(coalesce(elem->>'size',''))) = lower(trim(coalesce(v_size,'')))
         and lower(trim(coalesce(elem->>'color',''))) = lower(trim(coalesce(v_color,'')))
       limit 1;

      if v_matched_idx is null then
        raise exception 'invalid_variant:%', v_product_id;
      end if;
      if v_matched_qty < v_qty then
        raise exception 'insufficient_stock:%', v_product_id;
      end if;

      v_new_variants := jsonb_set(
        v_current_variants, array[v_matched_idx::text, 'qty'], to_jsonb(v_matched_qty - v_qty)
      );
      select coalesce(sum((elem->>'qty')::int), 0) into v_new_stock from jsonb_array_elements(v_new_variants) elem;

      update public.products
         set variants = v_new_variants,
             stock = v_new_stock,
             sold_count = sold_count + v_qty,
             status = case when v_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end
       where id = v_product_id and shop_id = p_shop_id
      returning price, name, sku, img into v_price, v_name, v_sku, v_img;
      v_sku := coalesce(v_matched_sku, v_sku);

      -- 062-migratsiya: agar shu variant o'z narxini belgilagan bo'lsa
      -- (products.variants[idx].price), buyurtma shu narxda hisoblanadi —
      -- aks holda yuqoridagi RETURNING price (mahsulotning asosiy narxi)
      -- o'zgarishsiz qoladi, xuddi bugungidek.
      v_price := coalesce(
        nullif(v_current_variants -> v_matched_idx ->> 'price', '')::numeric,
        v_price
      );

      insert into public.stock_movements (shop_id, product_id, variant_sku, prior_stock, delta, new_stock, operation_type, admin_tg_id)
      values (p_shop_id, v_product_id, v_matched_sku, v_matched_qty, -v_qty, v_new_stock, 'BUYURTMA', null)
      returning id into v_movement_id;
      v_movement_ids := v_movement_ids || v_movement_id;
    else
      if v_current_stock < v_qty then
        raise exception 'insufficient_stock:%', v_product_id;
      end if;
      v_new_stock := v_current_stock - v_qty;
      update public.products
         set stock = v_new_stock,
             sold_count = sold_count + v_qty,
             status = case when v_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end
       where id = v_product_id and shop_id = p_shop_id
      returning price, name, sku, img into v_price, v_name, v_sku, v_img;

      insert into public.stock_movements (shop_id, product_id, variant_sku, prior_stock, delta, new_stock, operation_type, admin_tg_id)
      values (p_shop_id, v_product_id, null, v_current_stock, -v_qty, v_new_stock, 'BUYURTMA', null)
      returning id into v_movement_id;
      v_movement_ids := v_movement_ids || v_movement_id;
    end if;

    v_total := v_total + (v_price * v_qty);
    v_enriched := v_enriched || jsonb_build_object(
      'product_id', v_product_id, 'name', v_name, 'sku', v_sku,
      'img', v_img, 'price', v_price, 'qty', v_qty, 'size', v_size, 'color', v_color
    );
  end loop;


  insert into public.orders (shop_id, tg_id, user_name, phone, region, district, address, pay_method, items, total_price, subtotal, status, is_guest, guest_tracking_code)
  values (p_shop_id, p_tg_id, p_user_name, p_phone, p_region, p_district, p_address, p_pay_method, v_enriched, v_total, v_total, 'NEW', true, p_tracking_code)
  returning id, created_at into v_order_id, v_created_at;

  update public.stock_movements set order_id = v_order_id
   where shop_id = p_shop_id and id = any(v_movement_ids);

  return jsonb_build_object(
    'id', v_order_id, 'createdAt', v_created_at, 'items', v_enriched,
    'subtotal', v_total, 'totalPrice', v_total, 'status', 'NEW', 'tgId', p_tg_id
  );
end;
$$;


revoke all on function public.ustore_place_guest_base(uuid,text,text,text,text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.ustore_place_guest_base(uuid,text,text,text,text,text,text,text,jsonb,text) to service_role;

create or replace function public.ustore_place_guest_order(
  p_shop_id uuid, p_tg_id text, p_user_name text, p_phone text,
  p_region text, p_district text, p_address text, p_pay_method text,
  p_items jsonb, p_checkout_key uuid, p_tracking_code text
) returns jsonb
language plpgsql
as $$
declare
  v_existing public.orders;
  v_result jsonb;
  v_request jsonb;
  v_line jsonb;
  v_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_index bigint;
  v_price numeric;
  v_qty integer;
  v_order_id bigint;
  v_gift_snapshot jsonb := null;
begin
  select * into v_existing from public.orders
   where shop_id = p_shop_id and checkout_key = p_checkout_key;
  if found then
    return jsonb_build_object(
      'id', v_existing.id, 'createdAt', v_existing.created_at,
      'items', v_existing.items, 'subtotal', v_existing.subtotal,
      'totalPrice', v_existing.total_price, 'status', v_existing.status,
      'tgId', v_existing.tg_id, 'replayed', true
    );
  end if;

  begin
    v_result := public.ustore_place_guest_base(
      p_shop_id, p_tg_id, p_user_name, p_phone, p_region,
      p_district, p_address, p_pay_method, p_items, p_tracking_code
    );
    v_order_id := (v_result->>'id')::bigint;

    for v_request, v_index in
      select value, ordinality from jsonb_array_elements(p_items) with ordinality
    loop
      v_line := v_result->'items'->((v_index - 1)::integer);
      if v_request ? 'price_override' then
        v_price := (v_request->>'price_override')::numeric;
        if v_price < 0 then raise exception 'invalid_price_override'; end if;
        v_line := jsonb_set(v_line, '{price}', to_jsonb(v_price), true);
      end if;
      if v_request ? 'line_id' then
        v_line := v_line || jsonb_build_object('lineId', v_request->>'line_id');
      end if;
      if v_request ? 'source_type' then
        v_line := v_line || jsonb_build_object(
          'sourceType', v_request->>'source_type',
          'sourceId', nullif(v_request->>'source_id',''),
          'sourceName', nullif(v_request->>'source_name','')
        );
        if v_request->>'source_type' = 'GIFT' then
          v_line := v_line || jsonb_build_object(
            'isGift', true,
            'giftRuleId', v_request->>'source_id',
            'giftRuleName', v_request->>'source_name'
          );
          v_gift_snapshot := jsonb_build_object(
            'ruleId', v_request->>'source_id',
            'ruleName', v_request->>'source_name',
            'productId', v_line->>'product_id',
            'productName', v_line->>'name',
            'quantity', (v_line->>'qty')::integer
          );
        elsif v_request->>'source_type' = 'BUNDLE' then
          v_line := v_line || jsonb_build_object(
            'bundleId', v_request->>'source_id',
            'bundleName', v_request->>'source_name'
          );
        end if;
      end if;
      v_price := coalesce((v_line->>'price')::numeric, 0);
      v_qty := coalesce((v_line->>'qty')::integer, 0);
      v_total := v_total + v_price * v_qty;
      v_items := v_items || jsonb_build_array(v_line);
    end loop;

    update public.orders set
      checkout_key = p_checkout_key,
      items = v_items,
      subtotal = v_total,
      total_price = v_total,
      gift_snapshot = coalesce(v_gift_snapshot, gift_snapshot)
    where id = v_order_id and shop_id = p_shop_id;

    return v_result || jsonb_build_object(
      'items', v_items, 'subtotal', v_total, 'totalPrice', v_total,
      'replayed', false
    );
  exception when unique_violation then
    select * into v_existing from public.orders
     where shop_id = p_shop_id and checkout_key = p_checkout_key;
    if not found then raise; end if;
    return jsonb_build_object(
      'id', v_existing.id, 'createdAt', v_existing.created_at,
      'items', v_existing.items, 'subtotal', v_existing.subtotal,
      'totalPrice', v_existing.total_price, 'status', v_existing.status,
      'tgId', v_existing.tg_id, 'replayed', true
    );
  end;
end;
$$;
revoke all on function public.ustore_place_guest_order(uuid,text,text,text,text,text,text,text,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.ustore_place_guest_order(uuid,text,text,text,text,text,text,text,jsonb,uuid,text) to service_role;


create or replace function public.ustore_create_checkout_order(
  p_shop_id uuid,p_tg_id text,p_user_name text,p_phone text,p_region text,
  p_district text,p_address text,p_pay_method text,p_items jsonb,p_checkout_key uuid,
  p_receipt_path text,p_delivery_snapshot jsonb,p_payment_snapshot jsonb,p_quote jsonb default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_existing public.orders; v_created jsonb; v_id bigint; v_subtotal numeric; v_discount numeric; v_fee numeric; v_free jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':' || p_checkout_key::text,0));
  select * into v_existing from public.orders where shop_id=p_shop_id and checkout_key=p_checkout_key;
  if found then
    if v_existing.tg_id is distinct from p_tg_id then raise exception 'checkout_key_conflict'; end if;
    if v_existing.status='CANCELLED' then raise exception 'checkout_key_cancelled'; end if;
    return jsonb_build_object('id',v_existing.id,'subtotal',v_existing.subtotal,'replayed',true,'receiptPath',v_existing.payment_receipt_path);
  end if;
  if coalesce((p_payment_snapshot->>'receiptRequired')::boolean,false) and p_receipt_path is null then raise exception 'receipt_required'; end if;
  if p_receipt_path is not null then
    if p_receipt_path not like 'shops/' || p_shop_id::text || '/receipts/' || p_checkout_key::text || '/%' then raise exception 'invalid_receipt_path'; end if;
    if not exists(select 1 from storage.objects where bucket_id='payment-receipts' and name=p_receipt_path and (metadata->>'size')::bigint>0) then raise exception 'receipt_storage_verify_failed'; end if;
  end if;
  if p_tg_id is null then
    if not coalesce((p_quote->>'isGuest')::boolean,false) then raise exception 'invalid_guest_principal'; end if;
    if not exists(select 1 from public.shop_settings where shop_id=p_shop_id and fulfillment_config->'checkout'->>'enabled'='true' and fulfillment_config->'checkout'->>'phone' ~ '^\+998[0-9]{9}$') then raise exception 'guest_checkout_disabled'; end if;
    if not exists(select 1 from public.shops where id=p_shop_id and status='ACTIVE') then raise exception 'shop_unavailable'; end if;
    v_created := public.ustore_place_guest_order(p_shop_id,null,p_user_name,p_phone,p_region,p_district,p_address,p_pay_method,p_items,p_checkout_key,p_quote->>'guestTrackingCode');
  else
    v_created := public.place_order(p_shop_id,p_tg_id,p_user_name,p_phone,p_region,p_district,p_address,p_pay_method,p_items,p_checkout_key);
  end if;
  v_id := (v_created->>'id')::bigint;
  v_subtotal := (v_created->>'subtotal')::numeric;
  if p_quote is not null and abs(v_subtotal-(p_quote->>'expectedSubtotal')::numeric)>0.01 then raise exception 'quote_changed'; end if;
  v_discount := least(v_subtotal,greatest(0,coalesce((p_quote->>'totalDiscount')::numeric,0)));
  v_fee := greatest(0,coalesce((p_quote->>'deliveryFee')::numeric,0));
  select fulfillment_config->'delivery'->'free' into v_free from public.shop_settings where shop_id=p_shop_id;
  if p_delivery_snapshot->>'kind'='FREE' and coalesce((v_free->>'minimumEnabled')::boolean,false) and v_subtotal-v_discount<=coalesce((v_free->>'minimumSubtotal')::numeric,0) then raise exception 'free_delivery_minimum_not_met'; end if;
  update public.orders set
    subtotal=v_subtotal,delivery_fee=v_fee,total_price=v_subtotal-v_discount+v_fee,payable_total=v_subtotal-v_discount+v_fee,
    promo_code=p_quote->>'promoCode',promo_discount=coalesce((p_quote->>'promoDiscount')::numeric,0),
    tier_discount=coalesce((p_quote->>'tierDiscount')::numeric,0),vip_discount=coalesce((p_quote->>'vipDiscount')::numeric,0),
    discount_source=p_quote->>'discountSource',tier_id=nullif(p_quote->>'tierId','')::uuid,tier_snapshot=p_quote->'tierSnapshot',
    delivery_snapshot=p_delivery_snapshot,payment_snapshot=p_payment_snapshot,
    payment_receipt_path=p_receipt_path,
    payment_receipt_uploaded_at=case when p_receipt_path is null then null else now() end,
    receipt_review_status=case when p_receipt_path is null then receipt_review_status else 'PENDING' end,
    shipment=jsonb_build_object('status','READY','kind',p_delivery_snapshot->>'kind','providerId',p_delivery_snapshot->>'providerId')
    where shop_id=p_shop_id and id=v_id;
  if nullif(p_quote->>'promotionId','') is not null and (p_quote->>'promoDiscount')::numeric>0 then
    insert into public.promotion_redemptions(shop_id,promotion_id,order_id,tg_id,discount_amount) values(p_shop_id,(p_quote->>'promotionId')::uuid,v_id,p_tg_id,(p_quote->>'promoDiscount')::numeric);
  end if;
  if nullif(p_quote->>'customerDiscountId','') is not null and (p_quote->>'vipDiscount')::numeric>0 then
    insert into public.customer_discount_usages(shop_id,customer_discount_id,order_id,tg_id,discount_amount) values(p_shop_id,(p_quote->>'customerDiscountId')::uuid,v_id,p_tg_id,(p_quote->>'vipDiscount')::numeric);
  end if;
  return v_created || jsonb_build_object('receiptPath',p_receipt_path);
end $$;
revoke all on function public.ustore_create_checkout_order(uuid,text,text,text,text,text,text,text,jsonb,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ustore_create_checkout_order(uuid,text,text,text,text,text,text,text,jsonb,uuid,text,jsonb,jsonb,jsonb) to service_role;

-- Nullable guest ownership must never pass an authenticated customer guard.
create or replace function public.update_order_status(
  p_shop_id uuid, p_order_id bigint, p_new_status text,
  p_requester_tg_id text, p_is_admin boolean, p_cancel_reason text
) returns public.orders
language plpgsql
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_variant_sku text;
  v_current_variants jsonb;
  v_current_stock int;
  v_matched_idx int;
  v_variant_prior_qty int;
  v_variant_new_qty int;
  v_new_variants jsonb;
  v_new_stock int;
begin
  if p_new_status not in ('PROCESSING','DELIVERED','CANCELLED') then
    raise exception 'invalid_transition:%', p_new_status;
  end if;

  select * into v_order from public.orders
   where id = p_order_id and shop_id = p_shop_id for update;
  if not found then raise exception 'order_not_found:%', p_order_id; end if;
  if not p_is_admin and (v_order.tg_id is null or v_order.tg_id is distinct from p_requester_tg_id) then raise exception 'forbidden:not_owner'; end if;
  if v_order.status = p_new_status then return v_order; end if;
  if v_order.status in ('DELIVERED','CANCELLED') then
    raise exception 'terminal_status:%', v_order.status;
  end if;

  if not p_is_admin then
    if v_order.tg_id is null or v_order.tg_id is distinct from p_requester_tg_id then raise exception 'forbidden:not_owner'; end if;
    if p_new_status = 'DELIVERED' and v_order.status <> 'PROCESSING' then
      raise exception 'invalid_transition:customer_delivery';
    elsif p_new_status not in ('DELIVERED','CANCELLED') then
      raise exception 'forbidden:customer_status';
    end if;
  else
    if v_order.status = 'NEW' and p_new_status not in ('PROCESSING','CANCELLED') then
      raise exception 'invalid_transition:new';
    elsif v_order.status = 'PROCESSING' and p_new_status not in ('DELIVERED','CANCELLED') then
      raise exception 'invalid_transition:processing';
    end if;
  end if;

  if p_new_status = 'CANCELLED' then
    for v_item in select * from jsonb_array_elements(v_order.items) loop
      v_product_id := nullif(v_item->>'product_id','')::uuid;
      v_qty := (v_item->>'qty')::int;
      v_current_variants := null; v_current_stock := null; v_matched_idx := null;
      v_new_variants := null; v_new_stock := null; v_variant_sku := null;
      v_variant_prior_qty := null; v_variant_new_qty := null;
      if v_product_id is null or v_qty is null then continue; end if;

      select variants, stock into v_current_variants, v_current_stock
        from public.products where id = v_product_id and shop_id = p_shop_id for update;
      if not found then continue; end if;

      if v_current_variants is not null and jsonb_array_length(v_current_variants) > 0 then
        select idx - 1 into v_matched_idx
          from jsonb_array_elements(v_current_variants) with ordinality as t(elem, idx)
         where lower(trim(coalesce(elem->>'size',''))) = lower(trim(coalesce(v_item->>'size','')))
           and lower(trim(coalesce(elem->>'color',''))) = lower(trim(coalesce(v_item->>'color','')))
         limit 1;
        if v_matched_idx is not null then
          v_variant_prior_qty := (v_current_variants->v_matched_idx->>'qty')::int;
          v_variant_new_qty := v_variant_prior_qty + v_qty;
          v_new_variants := jsonb_set(v_current_variants, array[v_matched_idx::text,'qty'], to_jsonb(v_variant_new_qty));
          select coalesce(sum((elem->>'qty')::int), 0) into v_new_stock from jsonb_array_elements(v_new_variants) elem;
          v_variant_sku := v_current_variants->v_matched_idx->>'sku';
          update public.products set variants = v_new_variants, stock = v_new_stock,
                 sold_count = greatest(0, sold_count - v_qty),
                 status = case when v_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end
           where id = v_product_id and shop_id = p_shop_id;
        end if;
      else
        v_new_stock := v_current_stock + v_qty;
        update public.products set stock = v_new_stock,
               sold_count = greatest(0, sold_count - v_qty), status = 'ACTIVE'
         where id = v_product_id and shop_id = p_shop_id;
      end if;

      insert into public.stock_movements
        (shop_id, product_id, variant_sku, prior_stock, delta, new_stock, operation_type, admin_tg_id, order_id)
      values
        (p_shop_id, v_product_id, v_variant_sku,
         coalesce(v_variant_prior_qty, v_current_stock, 0), v_qty,
         coalesce(v_variant_new_qty, v_new_stock, 0), 'BUYURTMA', null, p_order_id);
    end loop;

    update public.orders set
      status = 'CANCELLED', cancel_reason = p_cancel_reason, cancelled_by = p_requester_tg_id,
      payment_due_at = null,
      payment_status = case
        when payment_status = 'PAID' then 'REFUND_PENDING'
        when payment_status = 'REFUNDED' then 'REFUNDED'
        else 'CANCELLED' end,
      active_payment_provider = case when payment_status = 'PENDING' then null else active_payment_provider end,
      active_payment_reference = case when payment_status = 'PENDING' then null else active_payment_reference end
    where id = p_order_id and shop_id = p_shop_id returning * into v_order;
    delete from public.promotion_redemptions where shop_id = p_shop_id and order_id = p_order_id;
    delete from public.customer_discount_usages where shop_id = p_shop_id and order_id = p_order_id;
    delete from public.automatic_gift_usages where shop_id = p_shop_id and order_id = p_order_id;
  elsif p_new_status = 'DELIVERED' then
    update public.orders set
      status = 'DELIVERED', delivered_at = coalesce(delivered_at, now()), payment_due_at = null,
      payment_status = case
        when payment_status = 'PENDING' and pay_method not in ('CLICK','PAYME','UZUM') then 'PAID'
        else payment_status end,
      paid_at = case
        when payment_status = 'PENDING' and pay_method not in ('CLICK','PAYME','UZUM') then coalesce(paid_at, now())
        else paid_at end
    where id = p_order_id and shop_id = p_shop_id returning * into v_order;
  else
    update public.orders set status = 'PROCESSING'
     where id = p_order_id and shop_id = p_shop_id returning * into v_order;
  end if;
  return v_order;
end;
$$;
revoke all on function public.update_order_status(uuid,bigint,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.update_order_status(uuid,bigint,text,text,boolean,text) to service_role;


ALTER TABLE public.automatic_gift_usages ALTER COLUMN tg_id DROP NOT NULL;
COMMIT;
