-- ============================================================================
-- USTORE GREENFIELD — 065: RETURN POLICY + VARIANT RESTOCK NOTIFICATIONS
-- ============================================================================
-- 1) Seller-managed return window/instructions, counted from delivered_at.
-- 2) Back-in-stock subscriptions can target a whole product OR one exact SKU.
-- ============================================================================
begin;

alter table public.shop_settings
  add column if not exists return_window_days integer not null default 7 check (return_window_days between 1 and 365),
  add column if not exists return_policy_text text;

alter table public.orders
  add column if not exists delivered_at timestamptz;

-- Legacy delivered orders do not have the original transition timestamp.
-- created_at is a conservative fallback: it avoids accidentally reopening
-- an old return window after this migration.
update public.orders
set delivered_at = created_at
where status = 'DELIVERED' and delivered_at is null;

alter table public.stock_notifications
  add column if not exists variant_sku text;

-- Old product-only unique rule cannot distinguish two exact variants.
drop index if exists public.stock_notifications_unique_active;
create unique index if not exists stock_notifications_unique_active_v2
  on public.stock_notifications(shop_id, tg_id, product_id, coalesce(variant_sku, ''))
  where notified_at is null;

create index if not exists stock_notifications_pending_variant_idx
  on public.stock_notifications(shop_id, product_id, variant_sku)
  where notified_at is null;

commit;
