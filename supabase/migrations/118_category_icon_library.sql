-- Task 17: platform-managed category SVG icon registry.
create table if not exists public.category_icon_library (
  id text primary key,
  group_key text not null default 'custom',
  name_uz text not null,
  name_ru text,
  name_en text,
  search_terms text[] not null default '{}',
  svg_body text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_icon_library_id_format check (id ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint category_icon_library_group_format check (group_key ~ '^[a-z][a-z0-9_]{0,31}$'),
  constraint category_icon_library_svg_size check (char_length(svg_body) between 20 and 20000)
);

create index if not exists category_icon_library_active_group_idx
  on public.category_icon_library (is_active, group_key, sort_order, id);

alter table public.category_icon_library enable row level security;
-- No client policies: only service-role Edge Functions may mutate/read this registry.
