-- USTORE WEB 095 — Astra-5c authoritative web commerce/idempotency hardening.
-- Additive migration. Existing Telegram order flow remains compatible.
begin;

alter table public.cart_logs
  add column if not exists selected_promo_code text;

alter table public.orders
  add column if not exists order_source text not null default 'TELEGRAM',
  add column if not exists web_checkout_finalized_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_order_source_check') then
    alter table public.orders add constraint orders_order_source_check
      check (order_source in ('TELEGRAM','WEB'));
  end if;
end $$;

-- 091 added account_id to the other user-owned marketing rows, but the
-- historical personal-discount usage table was created later in a separate
-- migration path. Keep the mapping additive and backfill it here before the
-- web checkout transaction writes new usage rows.
alter table if exists public.customer_discount_usages
  add column if not exists account_id uuid references public.accounts(id) on delete set null;
update public.customer_discount_usages x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;

create table if not exists public.web_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id bigint not null references public.orders(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  idempotency_key text not null,
  method text not null,
  status text not null default 'PROCESSING',
  provider_reference text,
  redirect_url text,
  response jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, account_id, idempotency_key)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'web_payment_attempts_status_check') then
    alter table public.web_payment_attempts add constraint web_payment_attempts_status_check
      check (status in ('PROCESSING','PENDING','PAID','FAILED'));
  end if;
end $$;

create index if not exists web_payment_attempts_order_idx
  on public.web_payment_attempts(shop_id, order_id, created_at desc);
-- Different browser retries may accidentally mint different keys. Only one
-- live payment start for the same order+method may have an external side
-- effect at a time; FAILED attempts are intentionally excluded so a later
-- explicit retry can start a fresh attempt.
create unique index if not exists web_payment_attempts_live_order_method_unique
  on public.web_payment_attempts(shop_id, order_id, method)
  where status in ('PROCESSING','PENDING','PAID');

alter table public.web_payment_attempts enable row level security;

-- One DB transaction for WEB order creation. public.place_order already owns
-- the row locks/variant checks/stock decrement and checkout-key uniqueness.
-- Calling it from this wrapper keeps those invariants for web+Telegram while
-- putting quote-drift validation, snapshots and promo-limit redemption in the
-- SAME transaction. Any exception rolls the order and stock reservation back.
create or replace function public.ustore_create_web_order(
  p_shop_id uuid,
  p_account_id uuid,
  p_tg_id text,
  p_user_name text,
  p_phone text,
  p_region text,
  p_district text,
  p_address text,
  p_pay_method text,
  p_items jsonb,
  p_checkout_key uuid,
  p_expected_subtotal numeric,
  p_snapshot jsonb,
  p_promotion_id uuid default null,
  p_customer_discount_id uuid default null,
  p_gift_rule_id uuid default null,
  p_gift_product_id uuid default null,
  p_gift_quantity integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.orders;
  v_created jsonb;
  v_order public.orders;
  v_order_id bigint;
  v_actual_subtotal numeric;
  v_promo_discount numeric := greatest(0, coalesce((p_snapshot->>'promoDiscount')::numeric, 0));
  v_vip_discount numeric := greatest(0, coalesce((p_snapshot->>'vipDiscount')::numeric, 0));
begin
  select * into v_existing from public.orders
   where shop_id = p_shop_id and checkout_key = p_checkout_key
   for update;
  if found then
    if v_existing.tg_id is distinct from p_tg_id then raise exception 'checkout_key_conflict'; end if;
    if v_existing.account_id is not null and v_existing.account_id is distinct from p_account_id then
      raise exception 'checkout_key_conflict';
    end if;
    if v_existing.order_source <> 'WEB' or v_existing.web_checkout_finalized_at is null then
      raise exception 'checkout_key_incomplete';
    end if;
    return jsonb_build_object('order', to_jsonb(v_existing), 'replayed', true);
  end if;

  v_created := public.place_order(
    p_shop_id,p_tg_id,p_user_name,p_phone,p_region,p_district,p_address,
    p_pay_method,p_items,p_checkout_key
  );
  v_order_id := (v_created->>'id')::bigint;
  if v_order_id is null then raise exception 'invalid_place_order_response'; end if;

  -- Two concurrent requests with the SAME checkout key can both miss the
  -- first lookup above. public.place_order serializes them through the unique
  -- checkout-key index; the loser returns replayed=true after the winner has
  -- committed. Do not run redemption/finalization side effects a second time.
  if coalesce((v_created->>'replayed')::boolean, false) then
    select * into v_order from public.orders
     where shop_id = p_shop_id and id = v_order_id
     for update;
    if not found then raise exception 'order_not_found'; end if;
    if v_order.tg_id is distinct from p_tg_id then raise exception 'checkout_key_conflict'; end if;
    if v_order.account_id is null or v_order.account_id is distinct from p_account_id then
      raise exception 'checkout_key_conflict';
    end if;
    if v_order.order_source <> 'WEB' or v_order.web_checkout_finalized_at is null then
      raise exception 'checkout_key_incomplete';
    end if;
    return jsonb_build_object('order', to_jsonb(v_order), 'replayed', true);
  end if;

  select * into v_order from public.orders
   where shop_id = p_shop_id and id = v_order_id
   for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.tg_id is distinct from p_tg_id then raise exception 'order_owner_conflict'; end if;
  if v_order.account_id is not null and v_order.account_id is distinct from p_account_id then
    raise exception 'order_owner_conflict';
  end if;

  v_actual_subtotal := coalesce(v_order.subtotal, v_order.total_price, 0);
  if p_expected_subtotal is null or abs(v_actual_subtotal - p_expected_subtotal) > 0.01 then
    raise exception 'quote_changed';
  end if;

  update public.orders set
    account_id = p_account_id,
    order_source = 'WEB',
    subtotal = v_actual_subtotal,
    delivery_fee = greatest(0, coalesce((p_snapshot->>'deliveryFee')::numeric, 0)),
    payable_total = greatest(0, coalesce((p_snapshot->>'payableTotal')::numeric, v_actual_subtotal)),
    total_price = greatest(0, coalesce((p_snapshot->>'payableTotal')::numeric, v_actual_subtotal)),
    delivery_snapshot = p_snapshot->'deliverySnapshot',
    payment_snapshot = p_snapshot->'paymentSnapshot',
    shipment = p_snapshot->'shipment',
    promo_code = nullif(p_snapshot->>'promoCode',''),
    promo_discount = v_promo_discount,
    tier_discount = greatest(0, coalesce((p_snapshot->>'tierDiscount')::numeric, 0)),
    vip_discount = v_vip_discount,
    tier_id = nullif(p_snapshot->>'tierId','')::uuid,
    tier_snapshot = p_snapshot->'tierSnapshot',
    discount_source = nullif(p_snapshot->>'discountSource',''),
    gift_snapshot = p_snapshot->'giftSnapshot',
    web_checkout_finalized_at = now()
  where shop_id = p_shop_id and id = v_order_id;

  -- Migration 077's BEFORE INSERT trigger takes a row lock on promotions and
  -- serializes usage_limit/per_customer_limit. If the limit was consumed by a
  -- concurrent Telegram/web checkout, this INSERT raises and THIS ENTIRE
  -- transaction (including stock decrement) rolls back.
  if p_promotion_id is not null and v_promo_discount > 0 then
    insert into public.promotion_redemptions(
      shop_id,promotion_id,order_id,tg_id,account_id,discount_amount
    ) values (
      p_shop_id,p_promotion_id,v_order_id,p_tg_id,p_account_id,v_promo_discount
    );
  end if;

  if p_customer_discount_id is not null and v_vip_discount > 0 then
    insert into public.customer_discount_usages(
      shop_id,customer_discount_id,order_id,tg_id,account_id,discount_amount
    ) values (
      p_shop_id,p_customer_discount_id,v_order_id,p_tg_id,p_account_id,v_vip_discount
    );
  end if;

  if p_gift_rule_id is not null and p_gift_product_id is not null and coalesce(p_gift_quantity,0) > 0 then
    insert into public.automatic_gift_usages(
      shop_id,rule_id,order_id,tg_id,gift_product_id,gift_quantity
    ) values (
      p_shop_id,p_gift_rule_id,v_order_id,p_tg_id,p_gift_product_id,p_gift_quantity
    ) on conflict (shop_id,rule_id,order_id) do nothing;
  end if;

  select * into v_order from public.orders where shop_id = p_shop_id and id = v_order_id;
  return jsonb_build_object('order', to_jsonb(v_order), 'replayed', false);
end;
$$;

revoke all on function public.ustore_create_web_order(uuid,uuid,text,text,text,text,text,text,text,jsonb,uuid,numeric,jsonb,uuid,uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.ustore_create_web_order(uuid,uuid,text,text,text,text,text,text,text,jsonb,uuid,numeric,jsonb,uuid,uuid,uuid,uuid,integer) to service_role;

commit;
