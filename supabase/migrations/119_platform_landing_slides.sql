-- Task 2: shared public landing carousel for PLATFORM Web and Mini App.
begin;
create table if not exists public.platform_landing_slides (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  sort_order integer not null default 0 check (sort_order between 0 and 9),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_landing_slides_sort_idx on public.platform_landing_slides(sort_order, created_at);
alter table public.platform_landing_slides enable row level security;
-- No anon/authenticated table or storage write policies. The Edge Function,
-- authenticated as central PLATFORM Super Admin, writes with service role.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('platform-landing','platform-landing',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Enforce the global cap, including concurrent requests.
create or replace function public.ustore_platform_landing_limit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(11920261009);
 if (select count(*) from public.platform_landing_slides) >= 10 then
   raise exception 'landing_slides_limit_reached' using errcode = '23514';
 end if;
 return new;
end;
$$;
drop trigger if exists platform_landing_max_ten on public.platform_landing_slides;
create trigger platform_landing_max_ten before insert on public.platform_landing_slides
for each row execute function public.ustore_platform_landing_limit();
commit;
