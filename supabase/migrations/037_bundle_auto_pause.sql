-- Bundle campaigns pause automatically when a component becomes unavailable
-- or its live price differs from the price accepted by the seller.
begin;

alter table public.bundles
  add column if not exists pause_reason jsonb,
  add column if not exists paused_at timestamptz;

commit;
