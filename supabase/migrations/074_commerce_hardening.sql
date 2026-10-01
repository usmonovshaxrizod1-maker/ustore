-- USTORE GREENFIELD — 074: checkout/payment/order consistency hardening.
-- CLICK and Payme protocol payloads are unchanged. This migration only
-- makes our own reservation, payment and order state changes atomic.
begin;

alter table public.orders
  add column if not exists checkout_key uuid,
  add column if not exists payment_status text not null default 'PENDING',
  add column if not exists payment_due_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists active_payment_provider text,
  add column if not exists active_payment_reference text,
  add column if not exists billz_sync_status text not null default 'PENDING',
  add column if not exists billz_sync_error text,
  add column if not exists billz_sync_attempts integer not null default 0,
  add column if not exists billz_synced_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_status_check') then
    alter table public.orders add constraint orders_payment_status_check
      check (payment_status in ('PENDING','PAID','CANCELLED','REFUND_PENDING','REFUNDED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_billz_sync_status_check') then
    alter table public.orders add constraint orders_billz_sync_status_check
      check (billz_sync_status in ('PENDING','PROCESSING','SYNCED','SKIPPED','FAILED','MANUAL_REQUIRED'));
  end if;
end $$;

update public.orders set payment_status = case
  when status = 'DELIVERED' then 'PAID'
  when status = 'CANCELLED' then 'CANCELLED'
  else 'PENDING' end
where payment_status is null or payment_status = 'PENDING';

create unique index if not exists orders_checkout_key_unique
  on public.orders(shop_id, checkout_key) where checkout_key is not null;
create index if not exists orders_unpaid_expiry_idx
  on public.orders(payment_due_at) where payment_status = 'PENDING' and status = 'NEW';
create index if not exists orders_billz_pending_idx
  on public.orders(shop_id, billz_sync_status, paid_at)
  where payment_status = 'PAID' and billz_order_id is null;

create or replace function public.ustore_set_order_payment_deadline()
returns trigger language plpgsql as $$
begin
  if new.pay_method in ('CLICK','PAYME') and new.payment_due_at is null then
    -- Payme's documented waiting window is 12 hours. UStorE uses the same
    -- reservation window for both acquiring methods as its own stock policy.
    new.payment_due_at := now() + interval '12 hours';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_orders_payment_deadline on public.orders;
create trigger trg_orders_payment_deadline before insert on public.orders
for each row execute function public.ustore_set_order_payment_deadline();

-- Idempotent overload. The original 9-argument place_order remains intact;
-- this wrapper runs it inside the same transaction, records the stable
-- checkout key, and applies gift/bundle line prices before commit.
create or replace function public.place_order(
  p_shop_id uuid, p_tg_id text, p_user_name text, p_phone text,
  p_region text, p_district text, p_address text, p_pay_method text,
  p_items jsonb, p_checkout_key uuid
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
    v_result := public.place_order(
      p_shop_id, p_tg_id, p_user_name, p_phone, p_region,
      p_district, p_address, p_pay_method, p_items
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
revoke all on function public.place_order(uuid,text,text,text,text,text,text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.place_order(uuid,text,text,text,text,text,text,text,jsonb,uuid) to service_role;

create or replace function public.ustore_claim_click_payment()
returns trigger language plpgsql as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where shop_id = new.shop_id and id = new.order_id for update;
  if not found or v_order.status <> 'NEW' or v_order.payment_status <> 'PENDING' then
    raise exception 'order_not_payable';
  end if;
  if v_order.active_payment_provider is not null then raise exception 'payment_attempt_already_active'; end if;
  if abs(v_order.payable_total - new.amount) > 0.01 then raise exception 'payment_amount_mismatch'; end if;
  update public.orders set active_payment_provider = 'CLICK', active_payment_reference = new.click_trans_id::text
   where shop_id = new.shop_id and id = new.order_id;
  return new;
end;
$$;
drop trigger if exists trg_click_claim_order on public.click_transactions;
create trigger trg_click_claim_order before insert on public.click_transactions
for each row execute function public.ustore_claim_click_payment();

create or replace function public.ustore_apply_click_payment()
returns trigger language plpgsql as $$
begin
  if old.state is distinct from new.state and new.state = 'CONFIRMED' then
    update public.orders set
      payment_status = 'PAID', paid_at = coalesce(paid_at, now()), payment_due_at = null,
      status = case when status = 'NEW' then 'PROCESSING' else status end,
      payment_snapshot = coalesce(payment_snapshot,'{}'::jsonb) || jsonb_build_object(
        'receiptStatus','AUTO_CONFIRMED','clickConfirmedAt',now()
      )
    where shop_id = new.shop_id and id = new.order_id
      and active_payment_provider = 'CLICK' and active_payment_reference = new.click_trans_id::text;
    if not found then raise exception 'payment_order_state_conflict'; end if;
  elsif old.state is distinct from new.state and new.state = 'CANCELLED' then
    update public.orders set active_payment_provider = null, active_payment_reference = null
     where shop_id = new.shop_id and id = new.order_id and payment_status = 'PENDING'
       and active_payment_provider = 'CLICK' and active_payment_reference = new.click_trans_id::text;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_click_apply_payment on public.click_transactions;
create trigger trg_click_apply_payment after update of state on public.click_transactions
for each row execute function public.ustore_apply_click_payment();

create or replace function public.ustore_claim_payme_payment()
returns trigger language plpgsql as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where shop_id = new.shop_id and id = new.order_id for update;
  if not found or v_order.status <> 'NEW' or v_order.payment_status <> 'PENDING' then
    raise exception 'order_not_payable';
  end if;
  if v_order.active_payment_provider is not null then raise exception 'payment_attempt_already_active'; end if;
  if abs(v_order.payable_total - new.amount) > 0.01 then raise exception 'payment_amount_mismatch'; end if;
  update public.orders set active_payment_provider = 'PAYME', active_payment_reference = new.payme_transaction_id
   where shop_id = new.shop_id and id = new.order_id;
  return new;
end;
$$;
drop trigger if exists trg_payme_claim_order on public.payme_transactions;
create trigger trg_payme_claim_order before insert on public.payme_transactions
for each row execute function public.ustore_claim_payme_payment();

create or replace function public.ustore_apply_payme_payment()
returns trigger language plpgsql as $$
declare v_order public.orders;
begin
  if old.state is distinct from new.state and new.state = 2 then
    update public.orders set
      payment_status = 'PAID', paid_at = coalesce(paid_at, now()), payment_due_at = null,
      status = case when status = 'NEW' then 'PROCESSING' else status end,
      payment_snapshot = coalesce(payment_snapshot,'{}'::jsonb) || jsonb_build_object(
        'receiptStatus','AUTO_CONFIRMED','paymeConfirmedAt',now()
      )
    where shop_id = new.shop_id and id = new.order_id
      and active_payment_provider = 'PAYME' and active_payment_reference = new.payme_transaction_id;
    if not found then raise exception 'payment_order_state_conflict'; end if;
  elsif old.state is distinct from new.state and new.state = -1 then
    update public.orders set active_payment_provider = null, active_payment_reference = null
     where shop_id = new.shop_id and id = new.order_id and payment_status = 'PENDING'
       and active_payment_provider = 'PAYME' and active_payment_reference = new.payme_transaction_id;
  elsif old.state is distinct from new.state and new.state = -2 then
    update public.orders set payment_status = 'REFUNDED', refunded_at = now(), payment_due_at = null
     where shop_id = new.shop_id and id = new.order_id and payment_status in ('PAID','REFUND_PENDING');
    select * into v_order from public.orders where shop_id = new.shop_id and id = new.order_id;
    if found and v_order.status not in ('DELIVERED','CANCELLED') then
      perform public.update_order_status(new.shop_id, new.order_id, 'CANCELLED', 'PAYME_WEBHOOK', true, 'Payme orqali bekor qilindi');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_payme_apply_payment on public.payme_transactions;
create trigger trg_payme_apply_payment after update of state on public.payme_transactions
for each row execute function public.ustore_apply_payme_payment();

commit;
