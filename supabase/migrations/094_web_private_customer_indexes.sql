-- USTORE WEB 094 — Astra-5b private web customer lookup/idempotency support.
-- Additive only; existing Telegram composite keys remain intact.
begin;

create index if not exists orders_shop_account_id_idx
  on public.orders(shop_id, account_id, id desc) where account_id is not null;
create index if not exists user_favorites_shop_account_idx
  on public.user_favorites(shop_id, account_id) where account_id is not null;
create index if not exists support_tickets_shop_account_id_idx
  on public.support_tickets(shop_id, account_id, id desc) where account_id is not null;
create index if not exists cart_logs_shop_account_idx
  on public.cart_logs(shop_id, account_id) where account_id is not null;

alter table if exists public.support_ticket_messages
  add column if not exists client_message_id text;

create unique index if not exists support_ticket_messages_user_client_id_unique
  on public.support_ticket_messages(shop_id, ticket_id, client_message_id)
  where sender='USER' and client_message_id is not null;

commit;
