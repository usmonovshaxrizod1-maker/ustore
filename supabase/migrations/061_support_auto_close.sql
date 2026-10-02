-- ============================================================================
-- USTORE GREENFIELD — 061: SUPPORT AUTO-CLOSE AFTER 48H OF SILENCE
-- ============================================================================
-- POLISH ROUND, task 7: if the shop admin replies and the customer never
-- answers within 48 hours, the ticket auto-closes (server timestamp based,
-- never client/browser time). Reuses the EXISTING status='CLOSED'/
-- closed_at/closed_by columns for the closed state itself (spec: an
-- auto-closed ticket must behave exactly like a manually-closed one) — only
-- two new nullable columns are needed to track the deadline itself.

begin;

alter table public.support_tickets
  add column if not exists last_admin_reply_at timestamptz,
  add column if not exists auto_close_at timestamptz;

create index if not exists support_tickets_auto_close_idx
  on public.support_tickets(auto_close_at)
  where status = 'ANSWERED';

-- support_ticket_messages.sender widened to allow a SYSTEM-authored
-- auto-close note (never attributed to the human admin).
do $$
declare con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  where c.conrelid='public.support_ticket_messages'::regclass
    and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%sender%';
  if con_name is not null then
    execute format('alter table public.support_ticket_messages drop constraint %I', con_name);
  end if;
end $$;

alter table public.support_ticket_messages
  add constraint support_ticket_messages_sender_check
  check (sender in ('USER', 'ADMIN', 'SYSTEM'));

-- task 5-6 (read receipts, "✓/✓✓"): who has seen this message.
alter table public.support_ticket_messages
  add column if not exists read_at timestamptz;

-- Server-side cleanup helper, same style as
-- ustore_purge_expired_payment_drafts() (059-migratsiya) — called by a
-- lightweight hourly cron, no new Edge Function needed (48h granularity
-- does not need finer resolution, and no external API call is involved).
create or replace function public.ustore_auto_close_stale_support_tickets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  n integer := 0;
begin
  for t in
    select id, shop_id
    from public.support_tickets
    where status = 'ANSWERED'
      and auto_close_at is not null
      and auto_close_at <= now()
  loop
    insert into public.support_ticket_messages (shop_id, ticket_id, sender, sender_tg_id, body)
    values (t.shop_id, t.id, 'SYSTEM', 'SYSTEM', '48 soat davomida foydalanuvchidan javob kelmagani sababli murojaat avtomatik tugallandi.');

    update public.support_tickets
    set status = 'CLOSED', closed_at = now(), closed_by = 'SYSTEM_AUTO_CLOSE', auto_close_at = null
    where id = t.id and shop_id = t.shop_id;

    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.ustore_auto_close_stale_support_tickets() from public, anon, authenticated;
grant execute on function public.ustore_auto_close_stale_support_tickets() to service_role;

commit;
