-- ============================================================================
-- USTORE — 018: CLICK.UZ AVTOMATIK TO'LOV INTEGRATSIYASI (Phase A: sxema)
-- ============================================================================
-- Does NOT touch 001-017. Purely additive.
--
-- Mavjud qo'lda-QR-Click oqimiga (resolvePaymentSnapshot'dagi "QR:CLICK")
-- BUTUNLAY tegilmaydi — bu YANGI, mustaqil "CLICK" to'lov metodi, ikkalasi
-- parallel yashaydi. Naqsh 011_billz_integration.sql'dan ko'chirilgan:
-- platform-controlled beta-darvoza (billz_access_granted bilan bir xil) +
-- shifrlangan kredensial jadvali (bot-token-crypto.ts qayta ishlatiladi).
-- ============================================================================

begin;

-- Platform-controlled access gate — billz_access_granted bilan aynan bir xil
-- naqsh: faqat UStorE bosh admin (platform-api orqali) yoqa oladi, do'kon
-- admini o'zi yoqolmaydi.
alter table public.shops
  add column if not exists click_access_granted boolean not null default false,
  add column if not exists click_access_granted_at timestamptz,
  add column if not exists click_access_granted_by text;

-- One row per shop (singleton, billz_connections bilan bir xil shakl).
-- Secret Key HAR DOIM shifrlangan holda saqlanadi (mavjud
-- _shared/bot-token-crypto.ts encryptBotToken/decryptBotToken, o'sha bitta
-- USTORE_BOT_TOKEN_MASTER_KEY — yangi kalit yaratilmaydi).
create table if not exists public.click_connections (
  shop_id uuid primary key references public.shops(id) on delete cascade,

  merchant_id text,
  service_id text,
  merchant_user_id text,
  secret_key_ciphertext text,
  secret_key_iv text,

  status text not null default 'DISCONNECTED'
    check (status in ('DISCONNECTED', 'CONNECTED')),

  updated_at timestamptz not null default now()
);

drop trigger if exists trg_click_connections_updated_at on public.click_connections;
create trigger trg_click_connections_updated_at
  before update on public.click_connections
  for each row execute function public.ustore_set_updated_at();

alter table public.click_connections enable row level security;

-- Har bir Prepare/Complete tsiklini yozib boradi — takroriy Prepare'ni
-- (bir xil click_trans_id) qayta yaratmaslik va Complete'ni ikki marta
-- tasdiqlab qo'ymaslik uchun (Click hujjati: takroriy Complete'ga -4
-- "Already paid" qaytarilishi SHART, xato emas).
create table if not exists public.click_transactions (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id bigint not null,

  click_trans_id bigint not null,
  merchant_trans_id text not null,
  merchant_prepare_id bigint,
  amount numeric(14,2) not null,

  state text not null default 'PREPARED'
    check (state in ('PREPARED', 'CONFIRMED', 'CANCELLED')),
  error int,
  error_note text,

  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,

  unique (shop_id, click_trans_id),
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete cascade
);

create index if not exists click_transactions_order_idx on public.click_transactions(shop_id, order_id);

alter table public.click_transactions enable row level security;

commit;
