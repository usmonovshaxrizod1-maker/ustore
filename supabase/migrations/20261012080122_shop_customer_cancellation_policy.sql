begin;
-- Existing shops keep cancellation enabled and their chosen cutoff unchanged.
alter table public.shop_settings add column if not exists customer_cancellation_enabled boolean not null default true;

create or replace function public.update_order_status(
  p_shop_id uuid, p_order_id bigint, p_new_status text,
  p_requester_tg_id text, p_is_admin boolean, p_cancel_reason text
) returns public.orders
language plpgsql security invoker set search_path=public
as $$
declare
  v_order public.orders;
  v_customer_cancellation_enabled boolean;
  v_customer_cancel_cutoff text;
  v_shipment_status text;
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
  if not p_is_admin and p_new_status='CANCELLED' then
    select customer_cancellation_enabled,customer_cancel_cutoff into v_customer_cancellation_enabled,v_customer_cancel_cutoff
      from public.shop_settings where shop_id=p_shop_id for share;
    if coalesce(v_customer_cancellation_enabled,true)=false then raise exception 'customer_cancellation_disabled'; end if;
    v_customer_cancel_cutoff:=coalesce(v_customer_cancel_cutoff,'BEFORE_SHIPPED');
    v_shipment_status:=coalesce(v_order.shipment->>'status','READY');
    if v_order.status not in ('NEW','PROCESSING') or v_shipment_status='DELIVERED' or not (
      (v_customer_cancel_cutoff='NEW_ONLY' and v_order.status='NEW') or
      (v_customer_cancel_cutoff='BEFORE_SHIPPED' and v_shipment_status not in ('IN_TRANSIT','HANDED_TO_CARRIER')) or
      v_customer_cancel_cutoff='ANY_NON_TERMINAL'
    ) then raise exception 'cancel_not_allowed_at_this_stage'; end if;
  end if;
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


commit;
