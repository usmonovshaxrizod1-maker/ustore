-- ============================================================================
-- USTORE — 019: PLATFORMA DARAJASIDAGI SUPPORT + MUAMMO HAQIDA XABAR BERISH
-- ============================================================================
-- Does NOT touch 001-018. Purely additive.
--
-- 4.4/4.5-band (Yordam bo'limi): do'kon egasi <-> UStorE bosh admin
-- yozishmasi. Mavjud 004_support_engagement.sql'dagi support_tickets/
-- support_ticket_messages (shop_id <-> mijoz) bilan AYNAN bir xil naqsh,
-- faqat tenant kaliti shop_id o'rniga requester_telegram_id — platforma
-- darajasida "shop" tushunchasi yo'q, so'rov to'g'ridan-to'g'ri foydalanuvchi
-- (do'kon egasi)dan keladi.
--
-- Ikkala turdagi murojaat ("Support bilan yozish" va "Muammo haqida xabar
-- berish") BITTA jadval juftligida, `type` ustuni orqali farqlanadi —
-- admin_audit_log'ning polimorfik `action` ustuni bilan bir xil g'oya,
-- ikkita deyarli bir xil jadval-juftligini saqlamaslik uchun.
-- ============================================================================

begin;

create table if not exists public.platform_support_tickets (
  id bigint generated always as identity primary key,
  requester_telegram_id text not null,
  requester_username text,
  requester_first_name text,
  type text not null default 'SUPPORT' check (type in ('SUPPORT', 'BUG_REPORT')),
  subject text,
  -- 4.5-band: "qaysi bo'limda" — faqat BUG_REPORT uchun ma'noli, SUPPORT'da null.
  page_context text,
  status text not null default 'OPEN' check (status in ('OPEN', 'ANSWERED', 'CLOSED')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by text,
  closed_at timestamptz,
  closed_by text
);

create index if not exists platform_support_tickets_requester_idx on public.platform_support_tickets(requester_telegram_id);
create index if not exists platform_support_tickets_status_idx on public.platform_support_tickets(status);
create index if not exists platform_support_tickets_type_idx on public.platform_support_tickets(type);

create table if not exists public.platform_support_ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.platform_support_tickets(id) on delete cascade,
  sender text not null check (sender in ('USER', 'ADMIN')),
  sender_tg_id text not null,
  body text not null,
  -- 4.5-band: bug-report skrinshoti — payment-receipts bucket'ning o'zida,
  -- platform/support-tickets/{ticketId}/... yo'li bilan (yangi bucket kerak emas).
  attachment_path text,
  created_at timestamptz not null default now()
);

create index if not exists platform_support_ticket_messages_ticket_idx on public.platform_support_ticket_messages(ticket_id);

alter table public.platform_support_tickets enable row level security;
alter table public.platform_support_ticket_messages enable row level security;

commit;
