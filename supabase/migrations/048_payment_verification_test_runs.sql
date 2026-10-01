-- ============================================================================
-- 048: CLICK/PAYME avtomatik to'lovni "Sinash" — 3 marta real tasdiqlangan
-- test to'lovidan keyingina bu usul xaridorlarga (shop-app userlariga)
-- ko'rinadi. Xavfsizlik: TEST to'lovlar HAQIQIY buyurtma yaratmaydi —
-- alohida, mustaqil jadval (payment_test_runs), click-webhook/payme-webhook
-- ichida mavjud REAL-buyurtma yo'liga TEGILMAYDI, faqat oldindan (yangi,
-- alohida) shart bilan ajratiladi.
-- ============================================================================

begin;

-- bigint identity (click_transactions/payme_transactions bilan bir xil
-- konvensiya) — Click Prepare/Complete o'zining merchant_prepare_id'ini
-- RAQAM sifatida talab qiladi, shuning uchun UUID emas.
create table if not exists public.payment_test_runs (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  provider text not null check (provider in ('CLICK', 'PAYME')),
  amount numeric(14,2) not null check (amount > 0),
  attempt_number int not null check (attempt_number between 1 and 3),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'CANCELLED')),
  external_ref text,
  -- Payme JSON-RPC protokoli o'zining create/perform/cancel vaqtlarini har
  -- CheckTransaction javobida talab qiladi — payme_transactions jadvalini
  -- qayta ishlatib bo'lmaydi (uning order_id'si REAL buyurtmaga FOREIGN KEY,
  -- test to'lovda haqiqiy buyurtma yo'q), shuning uchun shu maydonlar
  -- to'g'ridan-to'g'ri shu yerda saqlanadi (faqat PAYME uchun ishlatiladi).
  payme_create_time_ms bigint,
  payme_perform_time_ms bigint,
  payme_cancel_time_ms bigint,
  payme_cancel_reason smallint,
  created_by text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists payment_test_runs_shop_provider_idx on public.payment_test_runs(shop_id, provider);
alter table public.payment_test_runs enable row level security;

alter table public.click_connections add column if not exists verified boolean not null default false;
alter table public.payme_connections add column if not exists verified boolean not null default false;

commit;
