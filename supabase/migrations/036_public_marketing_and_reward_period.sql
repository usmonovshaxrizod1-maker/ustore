-- Public marketing catalogue + time-bounded coupon rewards.
-- NULL keeps the existing "all-time purchases" behaviour.
begin;

alter table public.reward_rules
  add column if not exists period_days integer
  check (period_days is null or period_days between 1 and 3650);

commit;
