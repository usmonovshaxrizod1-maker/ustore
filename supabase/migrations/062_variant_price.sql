-- ============================================================================
-- USTORE GREENFIELD — 062: PER-VARIANT PRICE
-- ============================================================================
-- POLISH ROUND: a variant (e.g. "256GB / Qora") can now optionally carry its
-- own price inside the existing products.variants jsonb array (no schema
-- change needed there — see cleanVariants()/VariantInput in shop-api). When
-- a variant does NOT specify a price, the product's own base price is used
-- — EXACTLY today's behavior, unchanged.
--
-- This requires re-defining place_order() because it is the ONLY place that
-- decides what a customer is actually charged per line item (server-side,
-- never trusted from the client). Per this session's standing rule, an
-- EXISTING migration is never edited — this is a full `create or replace`
-- of the function, copied verbatim from 007_tenant_rpcs.sql with exactly
-- one addition (the variant-price override, clearly marked below). No other
-- behavior changes: stock decrement, sold_count, stock_movements, order
-- insert, gift/bundle handling (unaffected — those are computed in shop-api
-- from products.price directly, not from this RPC) all stay identical.

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

revoke all on function public.place_order(uuid, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.place_order(uuid, text, text, text, text, text, text, text, jsonb) to service_role;

commit;
