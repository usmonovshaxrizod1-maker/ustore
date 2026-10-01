-- ROUND16: seller-controlled product visibility for storefront users.
-- Hidden products stay in admin catalog/inventory and can be re-enabled instantly.

alter table public.products
  add column if not exists is_visible boolean not null default true;

-- Existing rows are visible by default. Kept explicit for databases where the
-- column may have been added manually without a backfill.
update public.products set is_visible = true where is_visible is null;

create index if not exists products_shop_visible_idx
  on public.products(shop_id, is_visible)
  where status <> 'DELETED';
