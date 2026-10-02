-- ============================================================================
-- USTORE — 010: PHASE 3 SHOP SETTINGS (incremental, additive only)
-- ============================================================================
-- Does NOT touch 001-009. Adds two shop-specific settings columns used by
-- Phase 3 fixes:
--   - work_hours: free-text "Ish vaqti" field (e.g. "09:00-22:00" or
--     "Du-Yak 09:00-22:00"), admin-entered, no fixed structure required.
--   - low_stock_threshold: replaces the previously hardcoded
--     DASHBOARD_LOW_STOCK_THRESHOLD=5 in shop-api with a per-shop value the
--     admin can change themselves. Defaults to 5 to preserve current
--     behavior for every existing shop until they change it.
-- Both are plain columns on the existing shop_settings singleton-per-shop
-- table (005_shop_settings_design.sql) — no new table needed, existing rows
-- keep working via the DEFAULT/NULL fallback, tenant isolation is inherited
-- from shop_settings' existing shop_id primary key / RLS.
-- ============================================================================

begin;

alter table public.shop_settings
  add column if not exists work_hours text;

alter table public.shop_settings
  add column if not exists low_stock_threshold integer not null default 5;

commit;
