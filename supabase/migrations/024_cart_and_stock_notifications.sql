-- ============================================================================
-- USTORE GREENFIELD — 024: ABANDONED CART TRACKING + BACK-IN-STOCK NOTIFICATIONS
-- ============================================================================
-- Online Do'kon Improvements round, items 2 va 3.
--
-- cart_logs: bir mijozning HOZIRGI savat holatini saqlaydi (to'liq tarix
-- emas — faqat oxirgi holat kifoya, chunki maqsad "kim hozir savatda
-- tovar qoldirib ketgan" degan monitoring, mahsulot narxi esa admin
-- ko'rish vaqtida joriy narxdan qayta hisoblanadi). Buyurtma berilganda
-- yoki savat bo'shaganda qator o'chiriladi — shuning uchun "hali tashlab
-- ketilmagan" savat bu jadvalda umuman ko'rinmaydi.
--
-- stock_notifications: "Kelganda xabar bering" obunalari. notified_at NULL
-- bo'lgan qator "hali xabar berilmagan, faol obuna" degani — shu tufayli
-- (shop_id, tg_id, product_id) bo'yicha faqat NULL holatda unique bo'lishi
-- kifoya (xabar berilgach xohlasa qayta obuna bo'lishi mumkin bo'lsin
-- uchun, eski notified qatorlar tarix sifatida qoladi).
-- ============================================================================

begin;

create table if not exists public.cart_logs (
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  items jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (shop_id, tg_id),
  foreign key (shop_id, tg_id) references public.app_users(shop_id, tg_id) on delete cascade
);

create index if not exists cart_logs_shop_updated_idx on public.cart_logs(shop_id, updated_at);

create table if not exists public.stock_notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  foreign key (shop_id, tg_id) references public.app_users(shop_id, tg_id) on delete cascade,
  foreign key (shop_id, product_id) references public.products(shop_id, id) on delete cascade
);

-- Bir mijoz bitta mahsulotga bir vaqtning o'zida faqat BITTA faol
-- (hali xabar berilmagan) obunaga ega bo'lishi mumkin — duplicate subscription yo'q.
create unique index if not exists stock_notifications_unique_active
  on public.stock_notifications(shop_id, tg_id, product_id) where notified_at is null;

create index if not exists stock_notifications_pending_by_product_idx
  on public.stock_notifications(shop_id, product_id) where notified_at is null;

alter table public.cart_logs enable row level security;
alter table public.stock_notifications enable row level security;

commit;
