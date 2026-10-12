begin;

create or replace function public.place_order(
  p_shop_id uuid,
  p_tg_id text,
  p_user_name text,
  p_phone text,
  p_region text,
  p_district text,
  p_address text,
  p_pay_method text,
  p_items jsonb
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

  insert into public.app_users (shop_id, tg_id)
  values (p_shop_id, p_tg_id)
  on conflict (shop_id, tg_id) do nothing;

  insert into public.orders (shop_id, tg_id, user_name, phone, region, district, address, pay_method, items, total_price, subtotal, status)
  values (p_shop_id, p_tg_id, p_user_name, p_phone, p_region, p_district, p_address, p_pay_method, v_enriched, v_total, v_total, 'NEW')
  returning id, created_at into v_order_id, v_created_at;

  update public.stock_movements set order_id = v_order_id
   where shop_id = p_shop_id and id = any(v_movement_ids);

  return jsonb_build_object(
    'id', v_order_id, 'createdAt', v_created_at, 'items', v_enriched,
    'subtotal', v_total, 'totalPrice', v_total, 'status', 'NEW', 'tgId', p_tg_id
  );
end;
$$;


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
  v_created := public.place_order(p_shop_id,p_tg_id,p_user_name,p_phone,p_region,p_district,p_address,p_pay_method,p_items,p_checkout_key);
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
commit;
