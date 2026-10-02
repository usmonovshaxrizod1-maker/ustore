-- UStorE: do'kon lifecycle — katta qayta ko'rib chiqish spec'i bo'yicha
-- sxema qo'shimchalari (barchasi ADDITIVE, mavjud qatorlarga zarar
-- yetkazmaydi):
--
--   A) shops.status'ga 'TERMINATING' qiymati qo'shiladi — bu FAQAT
--      terminate/purge jarayoni davomida (bir necha soniya) ishlatiladigan
--      VAQTINCHALIK "write-lock" holati (resolveShopContext() ALLAQACHON
--      har qanday status!=='ACTIVE'ni bloklaydi, shuning uchun bu qiymat
--      qo'shilishi bilanoq, kodni o'zgartirmasdan, yangi yozuvlar
--      bloklanadi). Muvaffaqiyatli purge yakunida shop qatorining o'zi
--      butunlay o'chadi (ustore_purge_shop_completely, 070-migratsiya) —
--      shuning uchun bu qiymat "doimiy holat" emas, faqat oraliq bosqich.
--   B) platform_lifecycle_settings.retention_days standart qiymati
--      30dan 60ga o'zgaradi — FAQAT hali qo'lda o'zgartirilmagan (hamon
--      eski standart 30da qolgan) qatorlar uchun backfill qilinadi;
--      agar admin buni ataylab boshqa qiymatga o'zgartirgan bo'lsa,
--      tegilmaydi.
--   C) platform_admin_tasks — "muzlatish muddati tugadi, admin qarori
--      kerak" turidagi vazifalar uchun YANGI, kichik jadval. Bitta
--      qisman UNIQUE indeks (shop_id, type) WHERE resolved_at IS NULL —
--      bir xil do'kon uchun bir vaqtda faqat BITTA hal qilinmagan vazifa
--      bo'lishi mumkinligini baza darajasida kafolatlaydi (scheduler
--      necha marta ishlasa ham, duplicate vazifa yaratib bo'lmaydi —
--      shu UNIQUE indeksga urilib xato beradi, chaqiruvchi buni jim
--      yutadi).
begin;

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.shops'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if con_name is not null then
    execute format('alter table public.shops drop constraint %I', con_name);
  end if;
end $$;

alter table public.shops
  add constraint shops_status_check
  check (status in ('PROVISIONING', 'ACTIVE', 'DISABLED', 'FROZEN', 'TERMINATED', 'TERMINATING'));

alter table public.platform_lifecycle_settings
  alter column retention_days set default 60;

update public.platform_lifecycle_settings
set retention_days = 60
where retention_days = 30;

create table if not exists public.platform_admin_tasks (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('FREEZE_EXPIRED')),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_action text check (resolved_action in ('TERMINATED', 'EXTENDED')),
  resolved_by text
);
create unique index if not exists platform_admin_tasks_open_unique
  on public.platform_admin_tasks(shop_id, type)
  where resolved_at is null;
create index if not exists platform_admin_tasks_open_idx
  on public.platform_admin_tasks(type, created_at)
  where resolved_at is null;
alter table public.platform_admin_tasks enable row level security;

commit;
