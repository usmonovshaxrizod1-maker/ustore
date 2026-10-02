-- Optional storefront information reuses the existing shop legal document table.
-- Privacy and Terms remain the only documents requiring recorded consent.
begin;
alter table public.shop_settings
  add column if not exists about text,
  add column if not exists email text,
  add column if not exists youtube text,
  add column if not exists tiktok text;
alter table public.shop_legal_documents drop constraint if exists shop_legal_documents_doc_type_check;
alter table public.shop_legal_documents add constraint shop_legal_documents_doc_type_check
  check (doc_type in ('PRIVACY','TERMS','OFFER','RETURNS','DELIVERY','PAYMENT','WARRANTY'));
commit;
