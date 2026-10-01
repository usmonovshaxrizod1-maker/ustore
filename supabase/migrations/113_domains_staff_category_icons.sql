-- Phase 01/02: per-member permission overrides and packaged category icons.
-- All changes are additive; existing category images and role assignments remain.
begin;

create table if not exists public.shop_staff_permission_overrides (
  shop_id uuid not null,
  telegram_user_id bigint not null,
  permission text not null,
  enabled boolean not null,
  changed_by bigint not null,
  updated_at timestamptz not null default now(),
  primary key (shop_id, telegram_user_id, permission),
  foreign key (shop_id, telegram_user_id)
    references public.shop_memberships(shop_id, telegram_user_id) on delete cascade
);
create index if not exists shop_staff_permission_overrides_member_idx
  on public.shop_staff_permission_overrides(shop_id, telegram_user_id);
alter table public.shop_staff_permission_overrides enable row level security;
revoke all on public.shop_staff_permission_overrides from anon, authenticated;
grant all on public.shop_staff_permission_overrides to service_role;

alter table public.categories add column if not exists icon_id text;
alter table public.categories add column if not exists icon_color text not null default 'brand';
alter table public.categories add constraint categories_icon_id_safe_check
  check (icon_id is null or icon_id ~ '^[a-z][a-z0-9_]{1,63}$');
alter table public.categories add constraint categories_icon_color_check
  check (icon_color in ('brand','blue','green','rose','amber','slate'));

-- Owner and a system MANAGER always manage domains. Other active employees
-- need domains.manage, either through a role or an explicit per-member grant.
-- Explicit employee OFF overrides a role grant, except for a MANAGER.
create or replace function public.ustore_can_manage_domains(p_shop_id uuid,p_tg_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.shop_memberships m join public.shops s on s.id=m.shop_id
    where m.shop_id=p_shop_id and m.telegram_user_id::text=p_tg_id
      and m.status='ACTIVE' and s.status='ACTIVE'
      and (m.role='OWNER' or (m.role='STAFF' and (
        exists(select 1 from public.membership_roles mr join public.roles r
          on r.shop_id=mr.shop_id and r.id=mr.role_id
          where mr.shop_id=m.shop_id and mr.telegram_user_id=m.telegram_user_id
            and r.key='MANAGER' and r.is_system)
        or coalesce((select o.enabled from public.shop_staff_permission_overrides o
          where o.shop_id=m.shop_id and o.telegram_user_id=m.telegram_user_id
            and o.permission='domains.manage'),
          exists(select 1 from public.membership_roles mr join public.role_permissions rp
            on rp.shop_id=mr.shop_id and rp.role_id=mr.role_id
            where mr.shop_id=m.shop_id and mr.telegram_user_id=m.telegram_user_id
              and rp.permission='domains.manage'))
      ))))
  );
$$;
revoke all on function public.ustore_can_manage_domains(uuid,text) from public,anon,authenticated;
grant execute on function public.ustore_can_manage_domains(uuid,text) to service_role;
commit;
