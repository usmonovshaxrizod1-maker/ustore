-- Storefront seller/business details used by the public "Sotuvchi haqida" page.
-- These are optional and shop-scoped; existing contact fields remain authoritative
-- for customer-facing phone/address/social data.
begin;
alter table public.shop_settings
  add column if not exists seller_legal_name text,
  add column if not exists seller_tax_id text,
  add column if not exists seller_registration_number text,
  add column if not exists seller_legal_address text,
  add column if not exists seller_bank_details text;
commit;
