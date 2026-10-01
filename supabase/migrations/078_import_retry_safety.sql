-- USTORE GREENFIELD — 078: identify each Excel row inside an import batch.
begin;
alter table public.products add column if not exists import_row_number integer;
create unique index if not exists products_import_batch_row_unique
  on public.products(shop_id,import_batch_id,import_row_number)
  where import_batch_id is not null and import_row_number is not null;
commit;
