-- ============================================================================
-- USTORE — 014: BILLZ (billz.ai) INTEGRATION, PHASE 5 (UStorE -> Billz sale push)
-- ============================================================================
-- Does NOT touch 001-013. Purely additive: one traceability column.
--
-- No fiscal receipt is requested (skip_ofd: true on the payment call — the
-- user explicitly said Billz only needs to know something sold, a real
-- fiscal cheque is not required), so GET /v2/order-epos-log is never called
-- either. The push itself happens in the background (EdgeRuntime.waitUntil,
-- same pattern as translateProductInBackground) — a Billz outage must never
-- fail or slow down a customer's checkout.
-- ============================================================================

begin;

alter table public.orders add column if not exists billz_order_id text;

commit;
