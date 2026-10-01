-- Repairs installations where 029 was marked applied without running its SQL.
-- Existing selections and all other shop settings remain untouched.
begin;
alter table public.shop_settings
  add column if not exists featured_category_ids jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
commit;
