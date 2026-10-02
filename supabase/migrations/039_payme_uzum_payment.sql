-- ============================================================================
-- USTORE — 039: PAYME va UZUM CHECKOUT avtomatik to'lov integratsiyasi
-- ============================================================================
-- Does NOT touch 001-038. Purely additive.
--
-- Naqsh 018_click_payment.sql'dan AYNAN ko'chirilgan: platform-controlled
-- beta-darvoza (billz_access_granted/click_access_granted bilan bir xil) +
-- shifrlangan kredensial jadvali (bot-token-crypto.ts qayta ishlatiladi,
-- yangi shifrlash kaliti yaratilmaydi). Mavjud qo'lda-QR (Payme/Click/...)
-- va yangi CLICK (avtomatik) oqimlariga BUTUNLAY tegilmaydi — bular ikkita
-- YANGI, mustaqil "PAYME" va "UZUM" to'lov metodi, parallel yashaydi.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A) PAYME
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists payme_access_granted boolean not null default false,
  add column if not exists payme_access_granted_at timestamptz,
  add column if not exists payme_access_granted_by text;

create table if not exists public.payme_connections (
  shop_id uuid primary key references public.shops(id) on delete cascade,

  merchant_id text,
  login text,
  password_ciphertext text,
  password_iv text,

  status text not null default 'DISCONNECTED'
    check (status in ('DISCONNECTED', 'CONNECTED')),

  updated_at timestamptz not null default now()
);

drop trigger if exists trg_payme_connections_updated_at on public.payme_connections;
create trigger trg_payme_connections_updated_at
  before update on public.payme_connections
  for each row execute function public.ustore_set_updated_at();

alter table public.payme_connections enable row level security;

-- Har bir CreateTransaction/PerformTransaction/CancelTransaction tsiklini
-- yozib boradi — Payme state modeliga mos: 1=yaratilgan, 2=bajarilgan,
-- -1=bajarilishdan oldin bekor qilingan, -2=bajarilgandan keyin bekor
-- qilingan (qaytarilgan).
create table if not exists public.payme_transactions (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id bigint not null,

  payme_transaction_id text not null,
  amount numeric(14,2) not null,

  state smallint not null default 1
    check (state in (1, 2, -1, -2)),
  reason smallint,

  create_time bigint not null,
  perform_time bigint,
  cancel_time bigint,

  created_at timestamptz not null default now(),

  unique (shop_id, payme_transaction_id),
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete cascade
);

create index if not exists payme_transactions_order_idx on public.payme_transactions(shop_id, order_id);

alter table public.payme_transactions enable row level security;

-- ---------------------------------------------------------------------------
-- B) UZUM (Uzum Checkout)
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists uzum_access_granted boolean not null default false,
  add column if not exists uzum_access_granted_at timestamptz,
  add column if not exists uzum_access_granted_by text;

create table if not exists public.uzum_connections (
  shop_id uuid primary key references public.shops(id) on delete cascade,

  terminal_id text,
  api_key_ciphertext text,
  api_key_iv text,

  status text not null default 'DISCONNECTED'
    check (status in ('DISCONNECTED', 'CONNECTED')),

  updated_at timestamptz not null default now()
);

drop trigger if exists trg_uzum_connections_updated_at on public.uzum_connections;
create trigger trg_uzum_connections_updated_at
  before update on public.uzum_connections
  for each row execute function public.ustore_set_updated_at();

alter table public.uzum_connections enable row level security;

create table if not exists public.uzum_transactions (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id bigint not null,

  uzum_order_id text not null,
  amount numeric(14,2) not null,

  state text not null default 'REGISTERED'
    check (state in ('REGISTERED', 'COMPLETED', 'DECLINED', 'REFUNDED')),

  created_at timestamptz not null default now(),
  completed_at timestamptz,

  unique (shop_id, uzum_order_id),
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete cascade
);

create index if not exists uzum_transactions_order_idx on public.uzum_transactions(shop_id, order_id);

alter table public.uzum_transactions enable row level security;

commit;
