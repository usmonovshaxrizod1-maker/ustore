-- ============================================================================
-- USTORE GREENFIELD — 025: CUSTOMER "QABUL QILDIM" (DELIVERY CONFIRMATION)
-- ============================================================================
-- Online Do'kon Improvements round, item 5 ("Qabul qilish tasdig'i").
-- update_order_status(...) previously let a non-admin caller move an order
-- ONLY to CANCELLED. This re-creates the SAME function (identical signature,
-- so no drop needed) adding exactly one more allowed customer transition:
-- the order's OWNER can mark their own order DELIVERED, but only while it is
-- still PROCESSING (i.e. actually confirmed/being fulfilled) — a customer
-- can never jump a NEW/unconfirmed order straight to DELIVERED. Everything
-- else (admin path, CANCELLED path, stock restore, terminal-status guard)
-- is byte-for-byte unchanged from 007_tenant_rpcs.sql.
-- ============================================================================

begin;

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
    if p_new_status = 'DELIVERED' then
      if v_order.status <> 'PROCESSING' then
        raise exception 'forbidden:customer_status';
      end if;
    elsif p_new_status <> 'CANCELLED' then
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

commit;
