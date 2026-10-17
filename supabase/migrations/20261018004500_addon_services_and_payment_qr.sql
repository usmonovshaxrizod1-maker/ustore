-- Addon services for existing shops and payment QR storage
begin;

-- 1. Extend subscription_requests.kind check to allow ADDON_SERVICE
alter table public.subscription_requests drop constraint if exists subscription_requests_kind_check;
alter table public.subscription_requests add constraint subscription_requests_kind_check check (kind in ('NEW_SHOP', 'UPGRADE', 'ADDON_SERVICE'));

alter table public.subscription_requests drop constraint if exists subscription_requests_kind_shop_check;
alter table public.subscription_requests add constraint subscription_requests_kind_shop_check check (
  (kind = 'NEW_SHOP' and shop_id is null) or (kind in ('UPGRADE', 'ADDON_SERVICE') and shop_id is not null)
);

-- 2. Add QR storage path to platform_payment_methods
alter table public.platform_payment_methods add column if not exists qr_storage_path text;

commit;
