-- USTORE GREENFIELD — 081: one explicit deletion deadline per frozen shop.
begin;
alter table public.shop_settings add column if not exists frozen_delete_at timestamptz;
update public.shop_settings s set frozen_delete_at = s.frozen_at + make_interval(days => coalesce(l.retention_days,60))
from public.platform_lifecycle_settings l
where l.id=true and s.frozen_at is not null and s.frozen_delete_at is null;
update public.shop_settings set frozen_delete_at=frozen_at+interval '60 days'
where frozen_at is not null and frozen_delete_at is null;

create or replace function public.ustore_freeze_shop(
  p_shop_id uuid,p_reason text,p_retention_days integer
) returns jsonb language plpgsql as $$
declare v_status text; v_now timestamptz:=now(); v_name text;
begin
  select status into v_status from public.shops where id=p_shop_id for update;
  if not found then raise exception 'shop_not_found'; end if;
  if v_status='TERMINATED' then raise exception 'shop_already_terminated'; end if;
  if v_status='FROZEN' then raise exception 'shop_already_frozen'; end if;
  update public.shops set status='FROZEN' where id=p_shop_id;
  update public.shop_settings set frozen_at=v_now,
    frozen_delete_at=v_now+make_interval(days=>least(greatest(p_retention_days,1),365)),
    lifecycle_reason=p_reason,lifecycle_changed_at=v_now
  where shop_id=p_shop_id returning name into v_name;
  return jsonb_build_object('previousStatus',v_status,'frozenAt',v_now,'frozenDeleteAt',v_now+make_interval(days=>least(greatest(p_retention_days,1),365)),'name',v_name);
end; $$;

create or replace function public.ustore_extend_frozen_deadline(
  p_shop_id uuid,p_days integer
) returns jsonb language plpgsql as $$
declare v_status text; v_old timestamptz; v_new timestamptz; v_name text;
begin
  select status into v_status from public.shops where id=p_shop_id for update;
  if not found then raise exception 'shop_not_found'; end if;
  if v_status<>'FROZEN' then raise exception 'shop_not_frozen'; end if;
  select frozen_delete_at,name into v_old,v_name from public.shop_settings where shop_id=p_shop_id for update;
  v_new:=greatest(coalesce(v_old,now()),now())+make_interval(days=>least(greatest(p_days,1),365));
  update public.shop_settings set frozen_delete_at=v_new,lifecycle_changed_at=now() where shop_id=p_shop_id;
  return jsonb_build_object('previousDeadline',v_old,'newDeadline',v_new,'name',v_name);
end; $$;

create or replace function public.ustore_reactivate_shop(p_shop_id uuid)
returns jsonb language plpgsql as $$
declare v_status text; v_name text;
begin
  select status into v_status from public.shops where id=p_shop_id for update;
  if not found then raise exception 'shop_not_found'; end if;
  if v_status<>'FROZEN' then raise exception 'shop_not_frozen'; end if;
  update public.shops set status='ACTIVE' where id=p_shop_id;
  update public.shop_settings set frozen_at=null,frozen_delete_at=null,lifecycle_reason=null,lifecycle_changed_at=now()
   where shop_id=p_shop_id returning name into v_name;
  return jsonb_build_object('name',v_name);
end; $$;

revoke all on function public.ustore_freeze_shop(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.ustore_extend_frozen_deadline(uuid,integer) from public,anon,authenticated;
revoke all on function public.ustore_reactivate_shop(uuid) from public,anon,authenticated;
grant execute on function public.ustore_freeze_shop(uuid,text,integer) to service_role;
grant execute on function public.ustore_extend_frozen_deadline(uuid,integer) to service_role;
grant execute on function public.ustore_reactivate_shop(uuid) to service_role;
commit;
