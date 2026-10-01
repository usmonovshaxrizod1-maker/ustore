-- ============================================================================
-- USTORE GREENFIELD — 045: SHAXSIY CHEGIRMA (customer_discounts) — TO'LIQ
-- MARKETING MODULIGA KENGAYTIRISH
-- ============================================================================
-- 4-paket, 10-topshiriq: mavjud "Eng yaxshi mijozlarga chegirma" (Hisobotlar
-- -> Mijozlar) tizimi saqlanadi, TEGILMAYDI — bu migratsiya faqat qo'shimcha
-- (additive) ustunlar/jadval qo'shadi, checkout hisob-kitobi bosqichma-bosqich
-- (resolveVipDiscount, shop-api) shu YANGI maydonlarni HISOBGA OLADIGAN
-- qilib kengaytiriladi (kod tarafda, alohida commit), lekin ESKI xatti-harakat
-- (min/max/limit bo'sh bo'lsa — cheklovsiz) o'zgarmaydi.
--
-- A) Yangi ustunlar — har biri NULLABLE, eski qatorlarga ta'sir qilmaydi:
--    - name — chegirma nomi (kartada ko'rsatish uchun);
--    - min_order_amount / max_order_amount — buyurtma summasi sharti;
--    - usage_limit — mijoz boshiga necha marta ishlatilishi mumkin (null =
--      cheksiz, mavjud xatti-harakat).
--    - batch_id — bitta "Yangi shaxsiy chegirma yaratish" chaqiruvida bir
--      nechta mijozga BIRDANIGA beriladigan chegirma qatorlarini BITTA
--      "kartochka/kampaniya" sifatida guruhlash uchun (10.2-band: "nechta
--      mijozga berilgan" — buni bilish uchun qatorlar guruhlanishi kerak).
--      discount_tier_groups'dagi bilan bir xil FALSAFA: checkout tomonidagi
--      resolveVipDiscount() HAR DOIM individual QATORni o'qiydi (tg_id
--      bo'yicha) — guruhlash FAQAT admin ro'yxat/detail KO'RINISHI uchun,
--      real chegirma hisob-kitobiga umuman ta'sir qilmaydi.
--
-- B) Yangi jadval — customer_discount_usages: promotion_redemptions (023)
--    bilan AYNAN bir xil shakl/falsafa — har bir haqiqiy checkout'da
--    qo'llangan shaxsiy chegirma shu yerga bitta qator sifatida yoziladi
--    (order yaratilgach, promotion_redemptions bilan bir xil joyda/naqshda).
--    Bu "Foydalanish tarixi" (10.11) va server-side usage_limit tekshiruvi
--    (10.17) uchun yagona manba.
-- ============================================================================

begin;

alter table public.customer_discounts
  add column if not exists name text,
  add column if not exists min_order_amount numeric(14,2),
  add column if not exists max_order_amount numeric(14,2),
  add column if not exists usage_limit integer check (usage_limit is null or usage_limit > 0),
  add column if not exists batch_id uuid;

create index if not exists customer_discounts_batch_idx on public.customer_discounts(shop_id, batch_id);

-- customer_discount_usages'ning composite FK'i uchun kerak (promotions'da
-- ham xuddi shunday unique(shop_id, id) allaqachon bor).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.customer_discounts'::regclass and contype = 'u'
       and pg_get_constraintdef(oid) ilike '%shop_id%' and pg_get_constraintdef(oid) ilike '%id%'
  ) then
    alter table public.customer_discounts add constraint customer_discounts_shop_id_id_key unique (shop_id, id);
  end if;
end $$;

create table if not exists public.customer_discount_usages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_discount_id uuid not null,
  order_id bigint not null,
  tg_id text not null,
  discount_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  foreign key (shop_id, customer_discount_id) references public.customer_discounts(shop_id, id) on delete cascade,
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete cascade
);
create index if not exists customer_discount_usages_discount_idx on public.customer_discount_usages(shop_id, customer_discount_id);
create index if not exists customer_discount_usages_customer_idx on public.customer_discount_usages(shop_id, customer_discount_id, tg_id);
alter table public.customer_discount_usages enable row level security;

commit;
