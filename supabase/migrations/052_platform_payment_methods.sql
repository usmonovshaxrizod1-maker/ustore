-- ============================================================================
-- USTORE — 052: Platforma to'lov usullari (Click/Payme/Paynet havola-CRUD)
-- ============================================================================
-- Spec: "Payment methods admin: Karta (mavjud, platform_settings orqali,
-- TEGILMAYDI) + Click/Payme/Paynet (ko'rinadigan nomi + to'lov havolasi +
-- faol tumbler) — admin CRUD, user faqat faollarini ko'radi".
--
-- Bu — shop-api'dagi Click/Payme/Uzum MERCHANT integratsiyasi (webhook,
-- avtomatik tasdiqlash) EMAS. U yerda haqiqiy merchant API kredensiallari
-- bilan avtomatik to'lov tasdiqlanadi. Bu yerda esa — platformaning O'ZINI
-- (do'kon UStorE'ga obuna puli to'laganda) qo'lda tekshiriladigan oddiy
-- tashqi havola: admin bitta http(s) havola qo'yadi (masalan Click/Payme
-- shaxsiy to'lov sahifasi), mijoz bosadi, to'laydi, keyin mavjud "To'ladim"
-- (platform_confirm_payment_claim, 049-migratsiya) oqimi orqali xabar
-- beradi — xuddi hozirgi Karta usuli bilan bir xil keyingi qadam.
--
-- Karta (platform_settings.payment_card_number/card_holder) BUTUNLAY
-- TEGILMAYDI — ikkalasi mustaqil, parallel yashaydi.
--
-- 001-051'ga tegilmaydi, faqat qo'shimcha. Yangi jadval uchun faqat
-- `enable row level security` (016'dagi bir xil naqsh — policy'siz RLS
-- allaqachon anon/authenticated'ni bloklaydi, faqat service_role o'qiy oladi).
-- ============================================================================

begin;

create table public.platform_payment_methods (
  id uuid primary key default gen_random_uuid(),
  method_type text not null check (method_type in ('CLICK', 'PAYME', 'PAYNET')),
  display_name text not null,
  payment_url text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.platform_payment_methods enable row level security;

commit;
