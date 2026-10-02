-- ============================================================================
-- USTORE ROUND14 — 020: SHOP LEGAL DOCUMENTS + USER CONSENTS
-- ============================================================================
-- Additive only. Each shop owns its Privacy Policy / Terms text and versions.
-- A consent record is immutable per (shop,user,document,version) so later
-- edits create a new version without rewriting what the user accepted before.
-- ============================================================================

begin;

create table if not exists public.shop_legal_documents (
  shop_id uuid not null references public.shops(id) on delete cascade,
  doc_type text not null check (doc_type in ('PRIVACY','TERMS')),
  enabled boolean not null default false,
  version integer not null default 1 check (version > 0),
  content_uz text not null,
  content_ru text,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (shop_id, doc_type)
);

create index if not exists shop_legal_documents_shop_enabled_idx
  on public.shop_legal_documents(shop_id, enabled);

create table if not exists public.shop_legal_consents (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  doc_type text not null check (doc_type in ('PRIVACY','TERMS')),
  document_version integer not null check (document_version > 0),
  accepted_at timestamptz not null default now(),
  source text not null default 'REGISTRATION' check (source in ('REGISTRATION','REACCEPT')),
  unique (shop_id, tg_id, doc_type, document_version),
  foreign key (shop_id, tg_id) references public.app_users(shop_id, tg_id) on delete cascade
);

create index if not exists shop_legal_consents_user_idx
  on public.shop_legal_consents(shop_id, tg_id, accepted_at desc);

alter table public.shop_legal_documents enable row level security;
alter table public.shop_legal_consents enable row level security;

commit;
