-- ============================================================================
-- USTORE GREENFIELD — 031: XODIMLAR / GRANULAR HUQUQLAR TIZIMI (2.0 — sxema)
-- ============================================================================
-- Admin Roles & Permissions round, 2.0-bosqich. Faqat sxema — backend
-- action'lar va enforcement keyingi bosqichda.
--
-- MUHIM ARXITEKTURA QARORLARI:
--
-- 1) Owner ALOHIDA — rollar/permissions tizimi orqali modellanmaydi. Owner
--    hamon shop_memberships.role = 'OWNER' (mavjud, o'zgarmagan ustun/
--    qiymat). Bu CHECK endi 'STAFF' ni ham qabul qiladi (qo'shimcha, mavjud
--    OWNER qatorlariga tegilmaydi). Owner-only imkoniyatlar (shop o'chirish,
--    egalikni topshirish, boshqa Owner tayinlash) requirePermission()/roles
--    orqali HECH QACHON berilmaydi — alohida tekshiriladi (keyingi bosqich).
--
-- 2) roles — HAR BIR SHOP o'zining nusxasiga ega (global/shared shablon
--    emas) — mavjud loyihaning "har narsa shop_id bilan" konventsiyasiga
--    mos, va bitta shop o'z standart rolini tahrirlashi boshqa shopga
--    ta'sir qilmaydi. 8 ta standart rol har shopga LAZY (birinchi kerak
--    bo'lganda) urug'lanadi — bu migratsiya ularni HAMMA mavjud shoplarga
--    OLDINDAN yozib chiqmaydi (keyingi bosqichdagi backend funksiyasi
--    qiladi, idempotent, ON CONFLICT bilan).
--
-- 3) Bitta xodim — bir nechta rol (membership_roles, N:M). Effective
--    permissions = barcha tayinlangan rollarning permission'lari UNIONI.
--    is_primary — faqat UI uchun (bitta membership'da eng ko'pi 1 ta
--    primary — partial unique index bilan kafolatlanadi).
--
-- 4) Audit uchun YANGI jadval yaratilmaydi — mavjud admin_audit_log (004)
--    qayta ishlatiladi, faqat yangi action nomlari bilan (auditLater()
--    allaqachon bor, keyingi bosqichda shunchaki yangi actionName'lar
--    bilan chaqiriladi).
--
-- 5) add_admin/remove_admin (platforma bosh admin, mavjud shop-provisioning
--    oqimi) BUTUNLAY TEGILMAYDI — bu migratsiya ularni ishlatadigan hech
--    narsani o'zgartirmaydi.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A) shop_memberships.role — 'STAFF' qo'shiladi (faqat kengaytirish)
-- ----------------------------------------------------------------------------
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.shop_memberships'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%';
  if con_name is not null then
    execute format('alter table public.shop_memberships drop constraint %I', con_name);
  end if;
end $$;

alter table public.shop_memberships
  add constraint shop_memberships_role_check
  check (role in ('OWNER', 'STAFF'));

-- ----------------------------------------------------------------------------
-- B) ROLES — har shopning o'z rol to'plami (standart + custom)
-- ----------------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  -- Standart rollar uchun barqaror kalit (masalan 'MANAGER') — custom
  -- rollarda null. (shop_id, key) unique: bir xil standart rol bir shopga
  -- ikki marta urug'lanmaydi; key null bo'lganda (custom) bu tekshiruv
  -- ishlamaydi (SQL'da NULL != NULL), shuning uchun bir nechta custom rol muammosiz.
  key text,
  name text not null,
  description text,
  color text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (shop_id, key)
);

create index if not exists roles_shop_idx on public.roles(shop_id);

-- ----------------------------------------------------------------------------
-- C) ROLE_PERMISSIONS — bitta rolga biriktirilgan permission kalitlari
-- ----------------------------------------------------------------------------
create table if not exists public.role_permissions (
  shop_id uuid not null references public.shops(id) on delete cascade,
  role_id uuid not null,
  permission text not null,
  primary key (shop_id, role_id, permission),
  foreign key (shop_id, role_id) references public.roles(shop_id, id) on delete cascade
);

-- ----------------------------------------------------------------------------
-- D) MEMBERSHIP_ROLES — bitta xodimga bir nechta rol (N:M)
-- ----------------------------------------------------------------------------
create table if not exists public.membership_roles (
  shop_id uuid not null,
  telegram_user_id bigint not null,
  role_id uuid not null,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  assigned_by bigint,
  primary key (shop_id, telegram_user_id, role_id),
  foreign key (shop_id, telegram_user_id) references public.shop_memberships(shop_id, telegram_user_id) on delete cascade,
  foreign key (shop_id, role_id) references public.roles(shop_id, id) on delete cascade
);

create index if not exists membership_roles_member_idx on public.membership_roles(shop_id, telegram_user_id);
-- Bitta xodimda eng ko'pi bilan 1 ta "asosiy/ko'rinadigan" rol.
create unique index if not exists membership_roles_one_primary
  on public.membership_roles(shop_id, telegram_user_id) where is_primary;

-- ----------------------------------------------------------------------------
-- E) STAFF_INVITES — xavfsiz taklif oqimi (qabul qilinguncha faol emas)
-- ----------------------------------------------------------------------------
create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  telegram_user_id bigint not null,
  invited_username text,
  role_ids uuid[] not null default '{}',
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
  invited_by bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  responded_at timestamptz
);

create index if not exists staff_invites_shop_idx on public.staff_invites(shop_id);
-- Bir kishiga bitta shopda bir vaqtda faqat BITTA kutilayotgan taklif.
create unique index if not exists staff_invites_one_pending
  on public.staff_invites(shop_id, telegram_user_id) where status = 'PENDING';

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table public.staff_invites enable row level security;

commit;
