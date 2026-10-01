-- ============================================================================
-- USTORE GREENFIELD — 007: TENANT-AWARE RPC FUNCTIONS
-- ============================================================================
-- IMPORTANT PROVENANCE NOTE (read before touching these functions):
--
-- Every function below takes p_shop_id as its FIRST parameter and every
-- query inside is filtered/written with that shop_id — no RPC here can read
-- or write another shop's row, even if called with a forged/wrong id for
-- everything else.
--
-- Fidelity to the OLD FITCORE database:
--   - allocate_global_skus and place_order's SKU-allocation shape are
--     faithful adaptations of what was actually found in source (SQL-1/
--     SQL-8), just made shop-scoped.
--   - place_order's OVERALL shape (validate cart, decrement stock, insert
--     order) is adapted from the place_order found in SQL-8-YAKUNIY.sql —
--     BUT that source only ever matched cart items by `size` against a
--     `sizes` jsonb column. The CURRENT app-api/index.ts (create_order
--     handler, audited line-by-line) sends `size` AND `color` and the whole
--     rest of the codebase (products.variants, computeStockState,
--     record_stock_in, etc.) has clearly moved to a `variants` jsonb column
--     (size+color+qty+sku) as primary, with `sizes` kept only as a derived
--     legacy mirror. That means the REAL place_order running in production
--     today must already have been updated past the SQL-8 version — but
--     that updated version exists in NO file this audit could find, in any
--     of the three rounds of work on this project. This function is
--     therefore a RECONSTRUCTION built strictly from place_order's call-site
--     contract (params, returned shape, error strings) and from how every
--     OTHER part of the codebase already treats `variants`/stock/sold_count
--     — not a verbatim port. Test it before trusting it in production.
--   - update_order_status, set_stock_by_sku, get_users_summary_fast, and
--     the four ustore_*_trash_* functions have NO source anywhere in any
--     audited file across all three work rounds on this project (only
--     their call sites — parameters, return shape, exact error-message
--     substrings the caller checks for — were ever visible). These are
--     FULL RECONSTRUCTIONS from usage, done deliberately rather than
--     skipped, per your instruction not to leave a dependency unresolved —
--     but they are new code, not ported code. Review/test them explicitly
--     before relying on them with real money moving through orders.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A) SKU ALLOCATION
-- ----------------------------------------------------------------------------
-- Matches the CURRENT app-api behavior exactly: a single incrementing
-- counter per shop (scope 'global'), no per-category suffixing, no
-- free-pool recycling (see 002_shop_catalog_inventory.sql's note on why
-- sku_free_pool is provisioned but not read here).
create or replace function public.allocate_global_skus(p_shop_id uuid, p_count integer)
returns table (sku text)
language plpgsql
as $$
declare
  v_start integer;
begin
  if p_count is null or p_count <= 0 then
    return;
  end if;

  insert into public.sku_counters (shop_id, scope, counter)
  values (p_shop_id, 'global', p_count)
  on conflict (shop_id, scope) do update set counter = public.sku_counters.counter + p_count
  returning counter - p_count into v_start;

  return query
    select (100000 + v_start + i)::text
    from generate_series(1, p_count) as i;
end;
$$;

revoke all on function public.allocate_global_skus(uuid, integer) from public, anon, authenticated;
grant execute on function public.allocate_global_skus(uuid, integer) to service_role;

-- ----------------------------------------------------------------------------
-- B) PLACE_ORDER — validates cart, decrements stock (variants-aware),
--    increments sold_count, logs a BUYURTMA stock_movement, inserts orders.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- C) UPDATE_ORDER_STATUS — admin transitions + customer self-cancel.
-- ----------------------------------------------------------------------------
-- Transition rules (reconstructed from the two error strings the caller
-- actually checks for — "terminal_status"/"invalid_transition" and
-- "forbidden" — plus the fact that a non-admin caller is only ever the
-- order's own customer cancelling their own order):
--   NEW/PROCESSING -> DELIVERED   (admin only)
--   NEW/PROCESSING -> CANCELLED   (admin, or the order's own customer)
--   DELIVERED, CANCELLED are terminal — no further transition, from anyone.
--   NEW -> PROCESSING              (admin only)
create or replace function public.update_order_status(
  p_shop_id uuid,
  p_order_id bigint,
  p_new_status text,
  p_requester_tg_id text,
  p_is_admin boolean,
  p_cancel_reason text
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
  v_new_variants jsonb;
  v_new_stock int;
begin
  if p_new_status not in ('NEW','PROCESSING','DELIVERED','CANCELLED') then
    raise exception 'invalid_transition:%', p_new_status;
  end if;

  select * into v_order from public.orders where id = p_order_id and shop_id = p_shop_id for update;
  if not found then
    raise exception 'order_not_found:%', p_order_id;
  end if;

  if not p_is_admin then
    if v_order.tg_id <> p_requester_tg_id then
      raise exception 'forbidden:not_owner';
    end if;
    if p_new_status <> 'CANCELLED' then
      raise exception 'forbidden:customer_status';
    end if;
  end if;

  if v_order.status in ('DELIVERED','CANCELLED') then
    raise exception 'terminal_status:%', v_order.status;
  end if;

  if p_new_status = 'CANCELLED' then
    -- Restock every line item, mirroring place_order's decrement in reverse.
    for v_item in select * from jsonb_array_elements(v_order.items) loop
      v_product_id := nullif(v_item->>'product_id','')::uuid;
      v_qty := (v_item->>'qty')::int;
      -- Reset per-item state: a non-matching SELECT ... INTO does NOT clear
      -- its target in PL/pgSQL, so without this a later item could silently
      -- reuse a PREVIOUS item's matched-variant index/stock values.
      v_current_variants := null; v_current_stock := null; v_matched_idx := null;
      v_new_variants := null; v_new_stock := null; v_variant_sku := null; v_variant_prior_qty := null;
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
          v_new_variants := jsonb_set(v_current_variants, array[v_matched_idx::text,'qty'],
            to_jsonb(v_variant_prior_qty + v_qty));
          select coalesce(sum((elem->>'qty')::int), 0) into v_new_stock from jsonb_array_elements(v_new_variants) elem;
          v_variant_sku := v_current_variants->v_matched_idx->>'sku';
          update public.products set variants = v_new_variants, stock = v_new_stock,
                 sold_count = greatest(0, sold_count - v_qty),
                 status = case when v_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end
           where id = v_product_id and shop_id = p_shop_id;
        end if;
      else
        v_new_stock := v_current_stock + v_qty;
        v_variant_sku := null;
        update public.products set stock = v_new_stock,
               sold_count = greatest(0, sold_count - v_qty),
               status = 'ACTIVE'
         where id = v_product_id and shop_id = p_shop_id;
      end if;

      insert into public.stock_movements (shop_id, product_id, variant_sku, prior_stock, delta, new_stock, operation_type, admin_tg_id, order_id)
      values (p_shop_id, v_product_id, v_variant_sku,
              coalesce(v_variant_prior_qty, v_current_stock, 0), v_qty, coalesce(v_new_stock,0), 'BUYURTMA', null, p_order_id);
    end loop;

    update public.orders
       set status = 'CANCELLED', cancel_reason = p_cancel_reason, cancelled_by = p_requester_tg_id
     where id = p_order_id and shop_id = p_shop_id
    returning * into v_order;
  else
    update public.orders set status = p_new_status
     where id = p_order_id and shop_id = p_shop_id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

revoke all on function public.update_order_status(uuid, bigint, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.update_order_status(uuid, bigint, text, text, boolean, text) to service_role;

-- ----------------------------------------------------------------------------
-- D) SET_STOCK_BY_SKU — absolute stock set, matched by product OR variant SKU.
-- ----------------------------------------------------------------------------
create or replace function public.set_stock_by_sku(p_shop_id uuid, p_sku text, p_stock integer, p_actor_tg_id text)
returns public.products
language plpgsql
as $$
declare
  v_product public.products;
  v_variant_idx int;
  v_new_variants jsonb;
  v_new_stock int;
  v_prior int;
begin
  if p_stock is null or p_stock < 0 then
    raise exception 'invalid_stock:%', p_sku;
  end if;

  select * into v_product from public.products where shop_id = p_shop_id and sku = p_sku for update;
  if found then
    v_prior := v_product.stock;
    update public.products set stock = p_stock, status = case when p_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end
     where id = v_product.id and shop_id = p_shop_id
    returning * into v_product;
    insert into public.stock_movements (shop_id, product_id, variant_sku, prior_stock, delta, new_stock, operation_type, admin_tg_id)
    values (p_shop_id, v_product.id, null, v_prior, p_stock - v_prior, p_stock, 'MANUAL', p_actor_tg_id);
    return v_product;
  end if;

  select p.* into v_product from public.products p
   where p.shop_id = p_shop_id and p.variants is not null
     and exists (select 1 from jsonb_array_elements(p.variants) elem where elem->>'sku' = p_sku)
   for update limit 1;
  if not found then
    raise exception 'sku_not_found:%', p_sku;
  end if;

  select idx - 1 into v_variant_idx
    from jsonb_array_elements(v_product.variants) with ordinality as t(elem, idx)
   where elem->>'sku' = p_sku limit 1;
  v_prior := (v_product.variants->v_variant_idx->>'qty')::int;
  v_new_variants := jsonb_set(v_product.variants, array[v_variant_idx::text,'qty'], to_jsonb(p_stock));
  select coalesce(sum((elem->>'qty')::int), 0) into v_new_stock from jsonb_array_elements(v_new_variants) elem;

  update public.products set variants = v_new_variants, stock = v_new_stock,
         status = case when v_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end
   where id = v_product.id and shop_id = p_shop_id
  returning * into v_product;

  insert into public.stock_movements (shop_id, product_id, variant_sku, prior_stock, delta, new_stock, operation_type, admin_tg_id)
  values (p_shop_id, v_product.id, p_sku, v_prior, p_stock - v_prior, p_stock, 'MANUAL', p_actor_tg_id);

  return v_product;
end;
$$;

revoke all on function public.set_stock_by_sku(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.set_stock_by_sku(uuid, text, integer, text) to service_role;

-- ----------------------------------------------------------------------------
-- E) GET_USERS_SUMMARY_FAST — one aggregate query instead of N+1 from JS.
-- ----------------------------------------------------------------------------
create or replace function public.get_users_summary_fast(p_shop_id uuid)
returns table (
  tg_id text, user_name text, phone text,
  total_orders bigint, active bigint, delivered bigint, cancelled bigint, total_spent numeric,
  is_blocked boolean, block_reason text, warned boolean, warn_reason text, last_seen_at timestamptz
)
language sql
stable
as $$
  select
    u.tg_id,
    coalesce(latest.user_name, nullif(trim(coalesce(u.profile_first_name,'') || ' ' || coalesce(u.profile_last_name,'')), ''), u.first_name, u.username) as user_name,
    coalesce(latest.phone, u.phone) as phone,
    count(o.id) as total_orders,
    count(o.id) filter (where o.status in ('NEW','PROCESSING')) as active,
    count(o.id) filter (where o.status = 'DELIVERED') as delivered,
    count(o.id) filter (where o.status = 'CANCELLED') as cancelled,
    coalesce(sum(coalesce(o.payable_total, o.total_price)) filter (where o.status <> 'CANCELLED'), 0) as total_spent,
    u.is_blocked, u.block_reason, u.warned, u.warn_reason, u.last_seen_at
  from public.app_users u
  left join public.orders o on o.shop_id = u.shop_id and o.tg_id = u.tg_id
  left join lateral (
    select oo.user_name, oo.phone from public.orders oo
     where oo.shop_id = u.shop_id and oo.tg_id = u.tg_id
     order by oo.id desc limit 1
  ) latest on true
  where u.shop_id = p_shop_id
  group by u.tg_id, u.profile_first_name, u.profile_last_name, u.first_name, u.username, u.phone,
           u.is_blocked, u.block_reason, u.warned, u.warn_reason, u.last_seen_at, latest.user_name, latest.phone;
$$;

revoke all on function public.get_users_summary_fast(uuid) from public, anon, authenticated;
grant execute on function public.get_users_summary_fast(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- F) TRASH RPCS (renamed fitcore_* -> ustore_*, all shop-scoped)
-- ----------------------------------------------------------------------------
create or replace function public.ustore_bulk_trash_products(p_shop_id uuid, p_product_ids uuid[], p_deleted_by text)
returns uuid
language plpgsql
as $$
declare
  v_batch_id uuid;
  v_now timestamptz := now();
begin
  update public.products set status = 'DELETED', deleted_at = v_now
   where shop_id = p_shop_id and id = any(p_product_ids) and status <> 'DELETED';

  insert into public.trash_batches (shop_id, kind, product_ids, deleted_by, deleted_at)
  values (p_shop_id, 'PRODUCT', to_jsonb(p_product_ids), p_deleted_by, v_now)
  returning id into v_batch_id;

  insert into public.trash_batch_items (shop_id, batch_id, product_id, status)
  select p_shop_id, v_batch_id, x, 'PENDING' from unnest(p_product_ids) as x;

  return v_batch_id;
end;
$$;

create or replace function public.ustore_purge_trash_batch(p_shop_id uuid, p_batch_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_batch public.trash_batches;
  v_image_urls jsonb;
  v_product_count int;
  v_category_count int;
begin
  select * into v_batch from public.trash_batches where shop_id = p_shop_id and id = p_batch_id for update;
  if not found then
    raise exception 'trash_batch_not_found:%', p_batch_id;
  end if;
  if v_batch.restored_at is not null or v_batch.purged_at is not null then
    raise exception 'batch_not_purgeable:%', p_batch_id;
  end if;

  select coalesce(jsonb_agg(img) filter (where img is not null), '[]'::jsonb), count(*)
    into v_image_urls, v_product_count
    from public.products
   where shop_id = p_shop_id
     and id in (select (x)::uuid from jsonb_array_elements_text(v_batch.product_ids) x);

  delete from public.products
   where shop_id = p_shop_id
     and id in (select (x)::uuid from jsonb_array_elements_text(v_batch.product_ids) x);

  select count(*) into v_category_count
    from public.categories
   where shop_id = p_shop_id
     and id in (select (x)::uuid from jsonb_array_elements_text(v_batch.category_ids) x);

  delete from public.categories
   where shop_id = p_shop_id
     and id in (select (x)::uuid from jsonb_array_elements_text(v_batch.category_ids) x);

  update public.trash_batch_items set status = 'PURGED', acted_at = now()
   where shop_id = p_shop_id and batch_id = p_batch_id and status = 'PENDING';

  update public.trash_batches set purged_at = now() where shop_id = p_shop_id and id = p_batch_id;

  return jsonb_build_object('imageUrls', v_image_urls, 'productCount', v_product_count, 'categoryCount', v_category_count);
end;
$$;

create or replace function public.ustore_restore_trash_items(p_shop_id uuid, p_batch_id uuid, p_product_ids uuid[], p_actor_tg_id text)
returns jsonb
language plpgsql
as $$
declare
  v_pending_count int;
  v_restored_count int;
begin
  select count(*) into v_pending_count from public.trash_batch_items
   where shop_id = p_shop_id and batch_id = p_batch_id and product_id = any(p_product_ids) and status = 'PENDING';
  if v_pending_count <> array_length(p_product_ids, 1) then
    raise exception 'product_set_changed:%', p_batch_id;
  end if;

  update public.products p set
    status = case when coalesce(p.stock,0) > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end,
    deleted_at = null
   where p.shop_id = p_shop_id and p.id = any(p_product_ids);

  update public.trash_batch_items set status = 'RESTORED', acted_at = now(), acted_by = p_actor_tg_id
   where shop_id = p_shop_id and batch_id = p_batch_id and product_id = any(p_product_ids) and status = 'PENDING';
  get diagnostics v_restored_count = row_count;

  return jsonb_build_object('restoredCount', v_restored_count);
end;
$$;

create or replace function public.ustore_purge_trash_items(p_shop_id uuid, p_batch_id uuid, p_product_ids uuid[], p_actor_tg_id text)
returns jsonb
language plpgsql
as $$
declare
  v_pending_count int;
  v_purged_count int;
  v_image_urls jsonb;
begin
  select count(*) into v_pending_count from public.trash_batch_items
   where shop_id = p_shop_id and batch_id = p_batch_id and product_id = any(p_product_ids) and status = 'PENDING';
  if v_pending_count <> array_length(p_product_ids, 1) then
    raise exception 'product_set_changed:%', p_batch_id;
  end if;

  select coalesce(jsonb_agg(img) filter (where img is not null), '[]'::jsonb) into v_image_urls
    from public.products where shop_id = p_shop_id and id = any(p_product_ids);

  delete from public.products where shop_id = p_shop_id and id = any(p_product_ids);

  update public.trash_batch_items set status = 'PURGED', acted_at = now(), acted_by = p_actor_tg_id
   where shop_id = p_shop_id and batch_id = p_batch_id and product_id = any(p_product_ids) and status = 'PENDING';
  get diagnostics v_purged_count = row_count;

  return jsonb_build_object('purgedCount', v_purged_count, 'imageUrls', v_image_urls);
end;
$$;

revoke all on function public.ustore_bulk_trash_products(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.ustore_purge_trash_batch(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ustore_restore_trash_items(uuid, uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.ustore_purge_trash_items(uuid, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.ustore_bulk_trash_products(uuid, uuid[], text) to service_role;
grant execute on function public.ustore_purge_trash_batch(uuid, uuid) to service_role;
grant execute on function public.ustore_restore_trash_items(uuid, uuid, uuid[], text) to service_role;
grant execute on function public.ustore_purge_trash_items(uuid, uuid, uuid[], text) to service_role;

commit;
