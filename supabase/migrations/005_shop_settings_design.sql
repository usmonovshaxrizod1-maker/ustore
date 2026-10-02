-- ============================================================================
-- USTORE GREENFIELD — 005: SHOP SETTINGS & DESIGN (per-shop singleton)
-- ============================================================================
-- 9-band: the old schema had exactly ONE shop_settings row for the whole
-- database (id integer default 1, CHECK id=1). That pattern is retired here.
-- Every shop now gets its own settings row, keyed directly by shop_id as the
-- primary key — still exactly one row per shop (a real singleton), just
-- scoped per tenant instead of per database.
--
-- Note: the old schema also carried a `contact_note` column (added ad hoc,
-- never through a tracked migration). It is NOT recreated here — a full
-- read-through of the current app-api/index.ts found no action that reads or
-- writes it (boot's shop_settings select list and set_shop_contact's payload
-- both omit it), so it is dead weight, not a live feature. Flagged explicitly
-- in the final report rather than silently carried forward or silently
-- guessed at.
-- ============================================================================

begin;

create table if not exists public.shop_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  name text,
  logo_url text,
  address text,
  address_ru text,
  coordinates text,
  phone text,
  phone_2 text,
  phone_3 text,
  instagram text,
  telegram text,
  facebook text,
  start_message text,
  product_limit integer,
  fulfillment_config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.design_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  theme_id text not null default 'minimal',
  colors jsonb not null default '{}'::jsonb,
  updated_at timestamptz,
  updated_by text
);

drop trigger if exists trg_shop_settings_updated_at on public.shop_settings;
create trigger trg_shop_settings_updated_at
  before update on public.shop_settings
  for each row execute function public.ustore_set_updated_at();

alter table public.shop_settings enable row level security;
alter table public.design_settings enable row level security;

commit;
