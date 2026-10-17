-- Optional services have independent fulfilment; tariff money stays tariff-only.
begin;
alter table public.subscription_requests add column total_price_snapshot numeric(14,2)
  check (total_price_snapshot >= 0);
update public.subscription_requests set total_price_snapshot = tariff_price_snapshot;

create table public.subscription_request_addons (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.subscription_requests(id) on delete cascade,
  code text not null check (code in ('CATALOG_SETUP','MANAGED_DOMAIN')),
  quantity integer not null check (quantity between 1 and 10),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total_price numeric(14,2) not null check (total_price = unit_price * quantity),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
  handled_by bigint,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id,code)
);
create index subscription_addons_status_created_idx on public.subscription_request_addons(status,created_at);
alter table public.subscription_request_addons enable row level security;
revoke all on public.subscription_request_addons from public,anon,authenticated;
grant all on public.subscription_request_addons to service_role;

create or replace function public.ustore_submit_web_subscription(p_user text,p_key text,p_input jsonb,p_values jsonb,p_prepared_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 r public.subscription_requests;
 kind_value text:=p_values->>'kind';
 shop_value uuid:=(p_values->>'shop_id')::uuid;
 addon_values jsonb:=coalesce(p_values->'addons','[]'::jsonb);
 addon jsonb;
 tariff_amount numeric:=(p_values->>'tariff_price_snapshot')::numeric;
 addon_amount numeric:=0;
 total_amount numeric;
begin
 if p_user is null or p_key is null or length(p_key) not between 16 and 200 or kind_value not in ('NEW_SHOP','UPGRADE') then raise exception 'invalid_submission';end if;
 if jsonb_typeof(addon_values)<>'array' or jsonb_array_length(addon_values)>2 or (kind_value<>'NEW_SHOP' and jsonb_array_length(addon_values)>0) then raise exception 'invalid_subscription_addons';end if;
 for addon in select value from jsonb_array_elements(addon_values) loop
   if addon->>'code' not in ('CATALOG_SETUP','MANAGED_DOMAIN')
     or (addon->>'quantity')::integer not between 1 and 10
     or (addon->>'unitPrice')::numeric < 0
     or (addon->>'totalPrice')::numeric <> (addon->>'unitPrice')::numeric * (addon->>'quantity')::integer
     then raise exception 'invalid_subscription_addons';end if;
   addon_amount:=addon_amount+(addon->>'totalPrice')::numeric;
 end loop;
 total_amount:=coalesce((p_values->>'total_price_snapshot')::numeric,tariff_amount+addon_amount);
 if total_amount is null or total_amount <> tariff_amount+addon_amount then raise exception 'invalid_subscription_total';end if;
 perform pg_advisory_xact_lock(hashtextextended('subscription:'||p_user,0));
 -- Same eligibility as the existing draft-purge RPC, scoped to this buyer.
 delete from public.subscription_requests where requester_telegram_id=p_user::bigint
   and status='NEW' and payment_claimed_at is null and payment_deadline_at<=now();
 select * into r from public.subscription_requests where requester_telegram_id=p_user::bigint and web_submission_key=p_key;
 if found then
  if r.web_submission_input is distinct from p_input then raise exception 'submission_payload_conflict';end if;
  return jsonb_build_object('requestId',r.id,'status',r.status,'replayed',true,'hasReceipt',r.receipt_storage_path is not null,'paymentClaimedAt',r.payment_claimed_at,'totalPrice',coalesce(r.total_price_snapshot,r.tariff_price_snapshot));
 end if;
 if exists(select 1 from public.subscription_requests where requester_telegram_id=p_user::bigint and kind=kind_value and status='NEW' and payment_method is not null and (kind_value='NEW_SHOP' or shop_id=shop_value) and (p_prepared_id is null or id<>p_prepared_id)) then raise exception 'request_already_pending';end if;
 if p_prepared_id is not null then
  select * into r from public.subscription_requests where id=p_prepared_id and requester_telegram_id=p_user::bigint for update;
  if not found or r.kind<>'NEW_SHOP' or kind_value<>'NEW_SHOP' or r.status<>'NEW' or r.payment_claimed_at is not null or r.web_submission_key is not null then raise exception 'submission_draft_conflict';end if;
  if r.payment_deadline_at is not null and r.payment_deadline_at<now() then raise exception 'submission_draft_expired';end if;
 else
  insert into public.subscription_requests(requester_telegram_id,requested_by_user_id,kind,shop_id,tariff_id,tariff_name_snapshot,tariff_price_snapshot,tariff_product_limit_snapshot)
  values(p_user::bigint,p_user::bigint,kind_value,shop_value,(p_values->>'tariff_id')::uuid,p_values->>'tariff_name_snapshot',tariff_amount,(p_values->>'tariff_product_limit_snapshot')::integer) returning * into r;
 end if;
 update public.subscription_requests set
  owner_telegram_id=(p_values->>'owner_telegram_id')::bigint,requested_shop_name=p_values->>'requested_shop_name',requested_bot_name=p_values->>'requested_bot_name',requested_bot_bio=p_values->>'requested_bot_bio',
  tariff_id=(p_values->>'tariff_id')::uuid,tariff_name_snapshot=p_values->>'tariff_name_snapshot',tariff_price_snapshot=tariff_amount,total_price_snapshot=total_amount,tariff_product_limit_snapshot=(p_values->>'tariff_product_limit_snapshot')::integer,
  billing_period=p_values->>'billing_period',duration_days=(p_values->>'duration_days')::integer,upgrade_action=p_values->>'upgrade_action',payment_method=p_values->>'payment_method',payment_method_id=(p_values->>'payment_method_id')::uuid,
  web_submission_key=p_key,web_submission_input=p_input,updated_at=clock_timestamp(),payment_deadline_at=case when kind_value='NEW_SHOP' then coalesce(payment_deadline_at,now()+interval '1 hour') else null end
 where id=r.id returning * into r;
 for addon in select value from jsonb_array_elements(addon_values) loop
   insert into public.subscription_request_addons(request_id,code,quantity,unit_price,total_price,details)
   values(r.id,addon->>'code',(addon->>'quantity')::integer,(addon->>'unitPrice')::numeric,(addon->>'totalPrice')::numeric,addon->'details');
 end loop;
 return jsonb_build_object('requestId',r.id,'status',r.status,'replayed',false,'hasReceipt',false,'paymentClaimedAt',null,'totalPrice',total_amount);
end $$;
revoke all on function public.ustore_submit_web_subscription(text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.ustore_submit_web_subscription(text,text,jsonb,jsonb,uuid) to service_role;

-- Conditional row lock and history insert share a transaction, including retries.
create or replace function public.ustore_update_subscription_addon(p_id uuid,p_expected text,p_next text,p_actor bigint,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.subscription_request_addons; request_status text;
begin
 select * into a from public.subscription_request_addons where id=p_id for update;
 if not found then raise exception 'addon_not_found';end if;
 if a.status is distinct from p_expected then raise exception 'addon_status_conflict';end if;
 select status into request_status from public.subscription_requests where id=a.request_id;
 if request_status<>'APPROVED' then raise exception 'addon_payment_not_approved';end if;
 if p_next is null or not ((p_expected='PENDING' and p_next in ('IN_PROGRESS','CANCELLED')) or (p_expected='IN_PROGRESS' and p_next in ('COMPLETED','CANCELLED'))) then raise exception 'invalid_addon_transition';end if;
 if p_next='CANCELLED' and nullif(trim(p_reason),'') is null then raise exception 'addon_cancel_reason_required';end if;
 update public.subscription_request_addons set status=p_next,handled_by=p_actor,
   started_at=case when p_next='IN_PROGRESS' then now() else started_at end,
   completed_at=case when p_next in ('COMPLETED','CANCELLED') then now() else completed_at end,
   updated_at=clock_timestamp() where id=p_id;
 insert into public.subscription_request_history(request_id,event_type,actor_type,actor_telegram_id,metadata)
 values(a.request_id,'ADDON_STATUS_CHANGED','ADMIN',p_actor,jsonb_build_object('addonId',a.id,'code',a.code,'previousStatus',a.status,'nextStatus',p_next,'reason',left(p_reason,1000)));
 return jsonb_build_object('ok',true,'requestId',a.request_id,'status',p_next);
end $$;
revoke all on function public.ustore_update_subscription_addon(uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.ustore_update_subscription_addon(uuid,text,text,bigint,text) to service_role;
commit;
