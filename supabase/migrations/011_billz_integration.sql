-- ============================================================================
-- USTORE — 011: BILLZ (billz.ai) INTEGRATION, PHASE 0 (foundation only)
-- ============================================================================
-- Does NOT touch 001-010. Purely additive.
--
-- This is Phase 0 of a multi-phase Billz POS/ERP integration:
--   Phase 0 (this file): schema + platform-controlled access gate.
--   Phase 1 (this round, no schema): connect account (secret_token entry,
--     encrypted storage via the existing bot-token-crypto.ts module, auto
--     refresh, Billz shop/cashbox/payment-type selection).
--   Phase 2+ (future, separate migrations when actually needed): catalog
--     browse/import staging table, product<->Billz linkage columns,
--     automated stock sync, order push. Deliberately NOT created yet —
--     no unused schema for functionality that doesn't exist.
--
-- shop_id is the only tenant boundary here, same as every other table in
-- this project — Shop A's Billz connection is invisible to Shop B by
-- construction (shop_id foreign key + every access path scoped through
-- resolveShopContext()'s server-resolved shopId, never a client-supplied
-- one).
-- ============================================================================

begin;

-- Platform-controlled access gate: only the PLATFORM super admin (via
-- platform-api, never the shop's own admin) can grant/revoke a shop's
-- ability to even see the Billz feature at all. This is a controlled/beta
-- rollout switch, not a shop-configurable setting.
alter table public.shops
  add column if not exists billz_access_granted boolean not null default false,
  add column if not exists billz_access_granted_at timestamptz,
  add column if not exists billz_access_granted_by text;

-- One row per shop (singleton, same pattern as design_settings/shop_settings).
-- Token material is ALWAYS stored encrypted (AES-GCM via the existing
-- _shared/bot-token-crypto.ts encryptBotToken/decryptBotToken — those
-- functions are already generic over any plaintext string, not bot-token
-- specific despite the name; reused as-is here, no new crypto code).
create table if not exists public.billz_connections (
  shop_id uuid primary key references public.shops(id) on delete cascade,

  secret_token_ciphertext text,
  secret_token_iv text,
  access_token_ciphertext text,
  access_token_iv text,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  access_token_expires_at timestamptz,

  -- Which Billz shop/cashbox/payment-type a future UStorE->Billz sale push
  -- (a later phase) would be attributed to. Cached *_name columns exist so
  -- the settings UI can show a human label without an extra Billz API call.
  billz_shop_id text,
  billz_shop_name text,
  billz_cashbox_id text,
  billz_cashbox_name text,
  billz_payment_type_id text,
  billz_payment_type_name text,

  status text not null default 'DISCONNECTED'
    check (status in ('DISCONNECTED', 'CONNECTED', 'ERROR')),
  last_error text,

  -- Bookkeeping columns for future (Phase 4) sync passes — unused by
  -- Phase 0/1 code, included now so the schema doesn't need a second
  -- migration just to add timestamp columns to an existing singleton row.
  last_stock_sync_at timestamptz,
  last_deletion_scan_at timestamptz,
  last_updated_cursor timestamptz,

  updated_at timestamptz not null default now()
);

drop trigger if exists trg_billz_connections_updated_at on public.billz_connections;
create trigger trg_billz_connections_updated_at
  before update on public.billz_connections
  for each row execute function public.ustore_set_updated_at();

alter table public.billz_connections enable row level security;

commit;
