-- Astra 8c: domain-loss auth cancellation, default-subdomain fallback metadata,
-- and explicit Telegram Mini App target state. PROPOSED_LOCAL: verify remote ledger before apply.
begin;

alter table public.shop_settings
  add column if not exists telegram_mini_app_domain_id uuid references public.shop_domains(id) on delete set null,
  add column if not exists telegram_mini_app_updated_at timestamptz;

create or replace function public.ustore_cancel_domain_handoffs_on_unavailable()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_domain_id uuid; v_shop_id uuid;
begin
  if tg_op='DELETE' then
    v_domain_id:=old.id; v_shop_id:=old.shop_id;
  else
    if new.status='ACTIVE' and new.routing_ready then return null; end if;
    v_domain_id:=new.id; v_shop_id:=new.shop_id;
  end if;

  update public.web_origin_auth_handoffs
     set cancelled_at=coalesce(cancelled_at,now())
   where target_domain_id=v_domain_id and consumed_at is null and cancelled_at is null;

  update public.shop_settings
     set telegram_mini_app_domain_id=null, telegram_mini_app_updated_at=now()
   where shop_id=v_shop_id and telegram_mini_app_domain_id=v_domain_id;
  return null;
end $$;

drop trigger if exists shop_domains_cancel_handoffs_unavailable on public.shop_domains;
create trigger shop_domains_cancel_handoffs_unavailable
  after update of status,routing_ready or delete on public.shop_domains
  for each row execute function public.ustore_cancel_domain_handoffs_on_unavailable();

-- 100 added a RESTRICT FK from short-lived handoffs to shop_domains. 7c must be
-- able to finish removing a custom domain after provider cleanup, so 8c clears
-- those ephemeral handoff rows before deleting the domain. Durable auth events
-- remain in web_auth_audit/admin_audit_log.
create or replace function public.ustore_finalize_domain_removal(p_shop_id uuid,p_tg_id text,p_domain_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.shop_domains;
begin
  if not public.ustore_can_manage_domains(p_shop_id,p_tg_id) then raise exception 'forbidden:domains.manage'; end if;
  select * into v_row from public.shop_domains where id=p_domain_id and shop_id=p_shop_id and status='REMOVING' for update;
  if not found then raise exception 'domain_not_removing'; end if;
  update public.web_origin_auth_handoffs set cancelled_at=coalesce(cancelled_at,now())
    where target_domain_id=p_domain_id and consumed_at is null and cancelled_at is null;
  delete from public.web_origin_auth_handoffs where target_domain_id=p_domain_id;
  update public.shop_settings set telegram_mini_app_domain_id=null,telegram_mini_app_updated_at=now()
    where shop_id=p_shop_id and telegram_mini_app_domain_id=p_domain_id;
  delete from public.shop_domains where id=p_domain_id;
  insert into public.admin_audit_log(shop_id,admin_tg_id,action,entity_type,entity_id,details)
    values(p_shop_id,p_tg_id,'DOMAIN_REMOVED','DOMAIN',p_domain_id::text,jsonb_build_object('hostname',v_row.hostname));
  return to_jsonb(v_row);
end $$;

revoke all on function public.ustore_cancel_domain_handoffs_on_unavailable() from public,anon,authenticated;
revoke all on function public.ustore_finalize_domain_removal(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.ustore_finalize_domain_removal(uuid,text,uuid) to service_role;

commit;
