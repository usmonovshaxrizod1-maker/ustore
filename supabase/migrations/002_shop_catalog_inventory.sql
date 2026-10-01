-- ============================================================================
-- USTORE GREENFIELD — 002: SHOP CATALOG & INVENTORY (tenant-owned)
-- ============================================================================
-- categories, products, SKU allocation, price history, Excel-import support
-- tables, and the trash (soft-delete) system. Every table here carries
-- shop_id, and every cross-table reference between two shop-owned tables uses
-- a COMPOSITE foreign key on (shop_id, id) so the database itself refuses a
-- row that points at another shop's data — not just application code.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A) CATEGORIES
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  name_ru text,
  parent_id uuid,
  img text,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  translation_status text,
  translation_hash text,
  created_at timestamptz not null default now(),
  -- Self-referencing FK is composite so a category's parent MUST be in the
  -- same shop — the DB rejects cross-tenant category trees outright.
  unique (shop_id, id),
  foreign key (shop_id, parent_id) references public.categories(shop_id, id) on delete restrict
);

create index if not exists categories_shop_id_idx on public.categories(shop_id);
create index if not exists categories_shop_parent_idx on public.categories(shop_id, parent_id);
create index if not exists categories_shop_active_idx on public.categories(shop_id) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- B) PRODUCTS
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sku text not null,
  name text not null,
  name_ru text,
  description text,
  description_ru text,
  price numeric(14,2) not null,
  old_price numeric(14,2),
  stock integer not null default 0,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'OUT_OF_STOCK', 'DELETED')),
  category_id uuid,
  img text,
  sizes jsonb,
  variants jsonb,
  sold_count integer not null default 0,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  import_batch_id uuid,
  translation_status text default 'PENDING'
    check (translation_status is null or translation_status in ('PENDING', 'FRESH', 'FAILED')),
  translation_hash text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  -- 12-band: SKU global emas, faqat shop ichida unique.
  unique (shop_id, sku),
  foreign key (shop_id, category_id) references public.categories(shop_id, id) on delete set null
);

create index if not exists products_shop_id_idx on public.products(shop_id);
create index if not exists products_shop_category_idx on public.products(shop_id, category_id);
create index if not exists products_shop_status_idx on public.products(shop_id, status);
create index if not exists products_shop_sort_idx on public.products(shop_id, sort_order);

-- ----------------------------------------------------------------------------
-- C) SKU ALLOCATION
-- ----------------------------------------------------------------------------
-- allocate_global_skus() (006_tenant_rpcs.sql) uses ONLY sku_counters — this
-- matches the currently-live app-api behavior exactly (verified: no code path
-- calls a per-category counter/free-pool function today). sku_free_pool is
-- still created here because it's on your required table list and existed in
-- the old schema, but it is intentionally NOT wired into any RPC in this
-- round — see the final report for why (nothing in the audited source
-- actually reads or writes it today, so wiring it up would be new,
-- unrequested behavior, not a ported one).
create table if not exists public.sku_counters (
  shop_id uuid not null references public.shops(id) on delete cascade,
  scope text not null,
  counter integer not null default 0,
  primary key (shop_id, scope)
);

create table if not exists public.sku_free_pool (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_id uuid,
  suffix_number integer not null,
  freed_at timestamptz not null default now(),
  foreign key (shop_id, category_id) references public.categories(shop_id, id) on delete cascade
);

create index if not exists sku_free_pool_shop_idx on public.sku_free_pool(shop_id);

-- ----------------------------------------------------------------------------
-- D) PRODUCT PRICE HISTORY (append-only)
-- ----------------------------------------------------------------------------
create table if not exists public.product_price_history (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null,
  old_price numeric(14,2),
  new_price numeric(14,2) not null,
  changed_at timestamptz not null default now(),
  changed_by text,
  foreign key (shop_id, product_id) references public.products(shop_id, id) on delete cascade
);

create index if not exists product_price_history_shop_product_idx on public.product_price_history(shop_id, product_id);

-- ----------------------------------------------------------------------------
-- E) EXCEL IMPORT SUPPORT
-- ----------------------------------------------------------------------------
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  admin_tg_id text not null,
  file_name text,
  file_hash text,
  total_rows integer not null,
  imported_rows integer not null default 0,
  error_rows integer not null default 0,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'ROLLED_BACK')),
  created_category_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (shop_id, id)
);

create index if not exists import_batches_shop_admin_idx on public.import_batches(shop_id, admin_tg_id);

-- products.import_batch_id (column already declared above) can only get its
-- FK now, since import_batches did not exist yet when products was created.
alter table public.products
  drop constraint if exists products_shop_import_batch_fkey;
alter table public.products
  add constraint products_shop_import_batch_fkey
  foreign key (shop_id, import_batch_id) references public.import_batches(shop_id, id) on delete set null;

create table if not exists public.category_aliases (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  parent_category_id uuid,
  alias_normalized text not null,
  target_category_id uuid not null,
  created_by_tg_id text,
  created_at timestamptz not null default now(),
  foreign key (shop_id, parent_category_id) references public.categories(shop_id, id) on delete cascade,
  foreign key (shop_id, target_category_id) references public.categories(shop_id, id) on delete cascade
);

-- "root level" alias (no parent) vs. "under a specific parent" need separate
-- uniqueness handling because SQL UNIQUE treats every NULL as distinct.
create unique index if not exists category_aliases_with_parent_uq
  on public.category_aliases(shop_id, parent_category_id, alias_normalized)
  where parent_category_id is not null;
create unique index if not exists category_aliases_root_uq
  on public.category_aliases(shop_id, alias_normalized)
  where parent_category_id is null;

-- ----------------------------------------------------------------------------
-- F) TRASH (soft-delete batches)
-- ----------------------------------------------------------------------------
create table if not exists public.trash_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind text not null check (kind in ('CATEGORY', 'PRODUCT')),
  root_category_id uuid,
  -- IDs saqlanadi jsonb text-array sifatida (real FK emas) — batafsili sabab:
  -- bitta batch bir nechta o'nlab/yuzlab product/category ID'ni o'z ichiga
  -- olishi mumkin, va ular vaqtinchalik "deleted_at to'ldirilgan" holatda
  -- turadi (haqiqiy DELETE emas) — restore/purge RPC'lari shu ID'larni jsonb
  -- massividan o'qib, HAR BIRINI alohida shop_id bilan tekshiradi.
  category_ids jsonb not null default '[]'::jsonb,
  product_ids jsonb not null default '[]'::jsonb,
  deleted_at timestamptz not null default now(),
  deleted_by text not null,
  restored_at timestamptz,
  purged_at timestamptz,
  unique (shop_id, id),
  foreign key (shop_id, root_category_id) references public.categories(shop_id, id) on delete set null
);

create index if not exists trash_batches_shop_pending_idx
  on public.trash_batches(shop_id) where restored_at is null and purged_at is null;

create table if not exists public.trash_batch_items (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  batch_id uuid not null,
  product_id uuid not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'RESTORED', 'PURGED')),
  acted_at timestamptz,
  acted_by text,
  unique (shop_id, batch_id, product_id),
  foreign key (shop_id, batch_id) references public.trash_batches(shop_id, id) on delete cascade
);

create index if not exists trash_batch_items_shop_batch_idx on public.trash_batch_items(shop_id, batch_id);

-- ----------------------------------------------------------------------------
-- G) RLS — enable, no permissive policies (see 001's note on the RLS model)
-- ----------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sku_counters enable row level security;
alter table public.sku_free_pool enable row level security;
alter table public.product_price_history enable row level security;
alter table public.import_batches enable row level security;
alter table public.category_aliases enable row level security;
alter table public.trash_batches enable row level security;
alter table public.trash_batch_items enable row level security;

commit;
