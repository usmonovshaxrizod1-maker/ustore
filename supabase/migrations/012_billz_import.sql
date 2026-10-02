-- ============================================================================
-- USTORE — 012: BILLZ (billz.ai) INTEGRATION, PHASE 2 (manual catalog import)
-- ============================================================================
-- Does NOT touch 001-011. Purely additive: a single link column.
--
-- Deliberately minimal, simpler than originally sketched in the Phase 0
-- planning notes: since the import flow was refined to pull price
-- immediately (not deferred) and skip images entirely, and since the
-- "not yet imported" browse list can be computed live (Billz's product
-- list already fits comfortably in one paginated call per category, and
-- has no per-shop caching requirement), no separate staging table is
-- needed — "already imported" is simply "a products row already carries
-- this billz_product_id (or one of its variants does)".
--
-- Variant-level linkage does NOT need a new column: the existing
-- `products.variants` jsonb array (002_shop_catalog_inventory.sql) gets one
-- new OPTIONAL key per element, `billzProductId` — existing rows simply
-- don't have it, which correctly means "not Billz-linked". No migration
-- needed for that (jsonb has no schema to alter).
-- ============================================================================

begin;

alter table public.products add column if not exists billz_product_id text;

create index if not exists products_shop_billz_product_idx
  on public.products(shop_id, billz_product_id)
  where billz_product_id is not null;

commit;
