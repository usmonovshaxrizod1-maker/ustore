-- REVIEW-R1: proposed allocation; verify remote migration ledger before apply.
begin;
create or replace function public.ustore_send_web_support_message(
  p_shop_id uuid, p_account_id uuid, p_tg_id text, p_thread_id bigint,
  p_client_message_id text, p_body text, p_attachment jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.support_tickets;
  v_message public.support_ticket_messages;
begin
  if p_account_id is null or p_client_message_id is null or length(p_client_message_id) not between 1 and 120 then
    raise exception 'invalid_message';
  end if;
  if not exists (select 1 from public.account_identities
    where account_id=p_account_id and provider='TELEGRAM' and provider_subject=p_tg_id) then
    raise exception 'ticket_not_found';
  end if;
  -- Serialize retries before creating a ticket; ticket-local uniqueness alone
  -- cannot protect a first message whose HTTP response was lost.
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':' || p_account_id::text || ':' || p_client_message_id, 0));
  select m.* into v_message from public.support_ticket_messages m
    join public.support_tickets t on t.shop_id=m.shop_id and t.id=m.ticket_id
    where m.shop_id=p_shop_id and m.sender='USER' and m.sender_tg_id=p_tg_id
      and m.client_message_id=p_client_message_id
      and (t.account_id=p_account_id or (t.account_id is null and t.tg_id=p_tg_id))
    order by m.id limit 1;
  if found then
    if p_thread_id is not null and p_thread_id <> v_message.ticket_id then raise exception 'idempotency_conflict'; end if;
    select * into v_ticket from public.support_tickets where shop_id=p_shop_id and id=v_message.ticket_id;
    return jsonb_build_object('thread',to_jsonb(v_ticket),'message',to_jsonb(v_message),'replayed',true);
  end if;
  if p_thread_id is not null then
    select * into v_ticket from public.support_tickets where shop_id=p_shop_id and id=p_thread_id
      and (account_id=p_account_id or (account_id is null and tg_id=p_tg_id)) for update;
    if not found then raise exception 'ticket_not_found'; end if;
    if v_ticket.status='CLOSED' then raise exception 'ticket_closed'; end if;
  else
    insert into public.support_tickets(shop_id,tg_id,account_id,ticket_type)
      values(p_shop_id,p_tg_id,p_account_id,'SUPPORT') returning * into v_ticket;
  end if;
  insert into public.support_ticket_messages(shop_id,ticket_id,sender,sender_tg_id,body,client_message_id,
    attachment_path,attachment_mime,attachment_name,attachment_size)
    values(p_shop_id,v_ticket.id,'USER',p_tg_id,p_body,p_client_message_id,
      p_attachment->>'attachment_path',p_attachment->>'attachment_mime',p_attachment->>'attachment_name',
      (p_attachment->>'attachment_size')::bigint) returning * into v_message;
  update public.support_tickets set auto_close_at=null where shop_id=p_shop_id and id=v_ticket.id;
  return jsonb_build_object('thread',to_jsonb(v_ticket),'message',to_jsonb(v_message),'replayed',false);
end;
$$;
revoke all on function public.ustore_send_web_support_message(uuid,uuid,text,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ustore_send_web_support_message(uuid,uuid,text,bigint,text,text,jsonb) to service_role;
commit;
