-- ============================================================================
-- UStorE 038 — Promo-kod summasi oralig'i + reward-kodlar uchun "kim
-- ishlatishi mumkin" (transferability) nazorati
-- ============================================================================
-- 15-band spec, 13/14-band. Additive — mavjud promotions/reward_rules
-- jadvallariga faqat yangi ustun (default bilan) qo'shiladi.

begin;

alter table public.promotions
  add column if not exists max_order_amount numeric(14,2) check (max_order_amount is null or max_order_amount > 0),
  -- Qo'lda yaratilgan (MANUAL) kodlar odatda ochiq e'lon qilinadi — shuning
  -- uchun default TRUE (istalgan mijoz ishlatishi mumkin). Reward orqali
  -- avtomatik berilgan kodlar checkAndIssueRewards() ichida reward_rules'ning
  -- o'z transferable sozlamasidan aniq qiymat bilan yoziladi.
  add column if not exists transferable boolean not null default true;

alter table public.reward_rules
  -- Reward qoidasi bo'yicha keyinchalik yaratiladigan HAR bir promo-kod shu
  -- sozlamani meros qiladi. Default FALSE — "faqat shu mijoz" xavfsizroq
  -- standart (spec: aniq ko'rsatilmaguncha boshqa odam ishlata olmasligi kerak).
  add column if not exists transferable boolean not null default false;

commit;
