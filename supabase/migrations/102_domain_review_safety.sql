-- REVIEW-7A-8C. LOCAL ONLY: check remote ledger before applying.
begin;
alter table public.shop_domains add column if not exists operation_kind text
  check (operation_kind in ('VERIFY','REMOVE'));
alter table public.shop_domains add column if not exists operation_started_at timestamptz;

-- A failed/unknown external operation keeps its claim. No timed automatic unlock:
-- an old provider request may still complete. See REVIEW_7A_8C.md recovery.
create or replace function public.ustore_claim_domain_operation(p_shop_id uuid,p_tg_id text,p_domain_id uuid,p_operation text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.shop_domains;
begin
  if not public.ustore_can_manage_domains(p_shop_id,p_tg_id) then raise exception 'forbidden:domains.manage'; end if;
  if p_operation not in ('VERIFY','REMOVE') or p_operation is null then raise exception 'invalid_operation'; end if;
  select * into r from public.shop_domains where id=p_domain_id and shop_id=p_shop_id for update;
  if not found then raise exception 'domain_not_found'; end if;
  if r.operation_kind is not null then raise exception 'domain_operation_busy'; end if;
  if p_operation='VERIFY' and r.status='REMOVING' then raise exception 'domain_removing'; end if;
  if p_operation='REMOVE' and r.kind<>'CUSTOM' then raise exception 'cannot_remove_default_subdomain'; end if;
  update public.shop_domains set operation_kind=p_operation,operation_started_at=now() where id=p_domain_id returning * into r;
  return to_jsonb(r);
end $$;
create or replace function public.ustore_release_domain_operation(p_domain_id uuid,p_operation text)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.shop_domains set operation_kind=null,operation_started_at=null
  where id=p_domain_id and operation_kind=p_operation;
  if not found then raise exception 'domain_operation_mismatch'; end if;
end $$;
revoke all on function public.ustore_claim_domain_operation(uuid,text,uuid,text),public.ustore_release_domain_operation(uuid,text) from public,anon,authenticated;
grant execute on function public.ustore_claim_domain_operation(uuid,text,uuid,text),public.ustore_release_domain_operation(uuid,text) to service_role;

-- Provider observations can skip intermediate states. ACTIVE still requires
-- ownership, DNS, TLS and routing evidence via the existing table constraint.
create or replace function public.ustore_domain_state_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if new.hostname is distinct from old.hostname or new.shop_id is distinct from old.shop_id or new.kind is distinct from old.kind then
    raise exception 'domain_identity_immutable';
  end if;
  if new.status<>old.status and (old.status='REMOVING' or new.status='DRAFT' or (new.status='ACTIVE' and old.status in ('DRAFT','PENDING_DNS'))) then
    raise exception 'invalid_domain_transition';
  end if;
  if new.status<>'ACTIVE' then new.is_primary=false; end if;
  new.revision=old.revision+1; new.updated_at=now(); return new;
end $$;

create or replace function public.ustore_set_primary_domain(p_shop_id uuid,p_tg_id text,p_domain_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.shop_domains;
begin
  if not public.ustore_can_manage_domains(p_shop_id,p_tg_id) then raise exception 'forbidden:domains.manage'; end if;
  perform pg_advisory_xact_lock(hashtextextended('domain-primary:'||p_shop_id::text,0));
  select * into v_row from public.shop_domains where id=p_domain_id and shop_id=p_shop_id for update;
  if not found then raise exception 'domain_not_found'; end if;
  if v_row.status<>'ACTIVE' or not v_row.routing_ready then raise exception 'domain_not_active'; end if;
  if v_row.operation_kind is not null then raise exception 'domain_operation_busy'; end if;
  update public.shop_domains set is_primary=false where shop_id=p_shop_id and is_primary and id<>p_domain_id;
  update public.shop_domains set is_primary=true where id=p_domain_id returning * into v_row;
  insert into public.admin_audit_log(shop_id,admin_tg_id,action,entity_type,entity_id,details)
    values(p_shop_id,p_tg_id,'DOMAIN_PRIMARY_CHANGED','DOMAIN',p_domain_id::text,jsonb_build_object('hostname',v_row.hostname));
  return to_jsonb(v_row);
end $$;
commit;
