-- Atomic web application submission. Receipt upload and payment claim remain
-- separate recoverable actions; this function never activates a subscription.
begin;
alter table public.subscription_requests add column if not exists web_submission_key text;
alter table public.subscription_requests add column if not exists web_submission_input jsonb;
create unique index if not exists subscription_web_submission_key_idx on public.subscription_requests(requester_telegram_id,web_submission_key) where web_submission_key is not null;
create or replace function public.ustore_submit_web_subscription(p_user text,p_key text,p_input jsonb,p_values jsonb,p_prepared_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.subscription_requests; kind_value text:=p_values->>'kind'; shop_value uuid:=(p_values->>'shop_id')::uuid;
begin
 if p_key is null or length(p_key) not between 16 and 200 or kind_value not in ('NEW_SHOP','UPGRADE') then raise exception 'invalid_submission';end if;
 perform pg_advisory_xact_lock(hashtextextended('subscription:'||p_user,0));
 select * into r from public.subscription_requests where requester_telegram_id=p_user::bigint and web_submission_key=p_key;
 if found then
  if r.web_submission_input is distinct from p_input then raise exception 'submission_payload_conflict';end if;
  return jsonb_build_object('requestId',r.id,'status',r.status,'replayed',true,'hasReceipt',r.receipt_storage_path is not null,'paymentClaimedAt',r.payment_claimed_at);
 end if;
 if exists(select 1 from public.subscription_requests where requester_telegram_id=p_user::bigint and kind=kind_value and status='NEW' and payment_method is not null and (kind_value='NEW_SHOP' or shop_id=shop_value) and (p_prepared_id is null or id<>p_prepared_id)) then raise exception 'request_already_pending';end if;
 if p_prepared_id is not null then
  select * into r from public.subscription_requests where id=p_prepared_id and requester_telegram_id=p_user::bigint for update;
  if not found or r.kind<>'NEW_SHOP' or kind_value<>'NEW_SHOP' or r.status<>'NEW' or r.payment_claimed_at is not null or r.web_submission_key is not null then raise exception 'submission_draft_conflict';end if;
  if r.payment_deadline_at is not null and r.payment_deadline_at<now() then raise exception 'submission_draft_expired';end if;
 else
  insert into public.subscription_requests(requester_telegram_id,requested_by_user_id,kind,shop_id,tariff_id,tariff_name_snapshot,tariff_price_snapshot,tariff_product_limit_snapshot)
  values(p_user::bigint,p_user::bigint,kind_value,shop_value,(p_values->>'tariff_id')::uuid,p_values->>'tariff_name_snapshot',(p_values->>'tariff_price_snapshot')::numeric,(p_values->>'tariff_product_limit_snapshot')::integer) returning * into r;
 end if;
 update public.subscription_requests set
  owner_telegram_id=(p_values->>'owner_telegram_id')::bigint,requested_shop_name=p_values->>'requested_shop_name',requested_bot_name=p_values->>'requested_bot_name',requested_bot_bio=p_values->>'requested_bot_bio',
  tariff_id=(p_values->>'tariff_id')::uuid,tariff_name_snapshot=p_values->>'tariff_name_snapshot',tariff_price_snapshot=(p_values->>'tariff_price_snapshot')::numeric,tariff_product_limit_snapshot=(p_values->>'tariff_product_limit_snapshot')::integer,
  billing_period=p_values->>'billing_period',duration_days=(p_values->>'duration_days')::integer,upgrade_action=p_values->>'upgrade_action',payment_method=p_values->>'payment_method',payment_method_id=(p_values->>'payment_method_id')::uuid,
  web_submission_key=p_key,web_submission_input=p_input,updated_at=clock_timestamp(),payment_deadline_at=case when kind_value='NEW_SHOP' then coalesce(payment_deadline_at,now()+interval '1 hour') else null end
 where id=r.id returning * into r;
 return jsonb_build_object('requestId',r.id,'status',r.status,'replayed',false,'hasReceipt',false,'paymentClaimedAt',null);
end $$;
revoke all on function public.ustore_submit_web_subscription(text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.ustore_submit_web_subscription(text,text,jsonb,jsonb,uuid) to service_role;
commit;
