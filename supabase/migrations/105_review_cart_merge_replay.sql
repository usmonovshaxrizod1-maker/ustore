-- REVIEW-9ABC: additive correction after 103/104; LOCAL ONLY.
begin;
alter table public.web_cart_merge_receipts add column if not exists request_items jsonb;
create or replace function public.ustore_merge_web_cart(
  p_shop_id uuid,
  p_account_id uuid,
  p_tg_id text,
  p_merge_key text,
  p_incoming_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare existing jsonb; merged jsonb := '[]'::jsonb; item jsonb; old_item jsonb; key text; qty integer; now_ts timestamptz:=now(); prior jsonb; response jsonb; prior_items jsonb;
begin
  if p_merge_key is null or length(p_merge_key)<16 or length(p_merge_key)>200 then raise exception 'invalid_merge_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text||':'||p_account_id::text,0));
  select r.response,r.request_items into prior,prior_items from public.web_cart_merge_receipts r where r.shop_id=p_shop_id and r.account_id=p_account_id and r.merge_key=p_merge_key;
  if found then
    if prior_items is not null and prior_items is distinct from p_incoming_items then raise exception 'cart_merge_payload_changed'; end if;
    -- Do not replace a newer cart view with the snapshot from an old receipt.
    select coalesce(cl.items,'[]'::jsonb) into existing from public.cart_logs cl where cl.shop_id=p_shop_id and cl.tg_id=p_tg_id;
    return jsonb_build_object('items',coalesce(existing,'[]'::jsonb),'updatedAt',now_ts,'replayed',true);
  end if;
  select coalesce(items,'[]'::jsonb) into existing from public.cart_logs where shop_id=p_shop_id and tg_id=p_tg_id for update;
  if existing is null then existing:='[]'::jsonb; end if;
  merged:=existing;
  for item in select value from jsonb_array_elements(coalesce(p_incoming_items,'[]'::jsonb)) loop
    key := case when item->>'type'='BUNDLE' then 'B:'||coalesce(item->>'bundleId','') else 'P:'||coalesce(item->>'productId','')||'|'||coalesce(item->>'variantId','')||'|'||coalesce(item->>'size','')||'|'||coalesce(item->>'color','') end;
    qty := greatest(0,least(99,coalesce((item->>'qty')::integer,0)));
    if qty<=0 then continue; end if;
    old_item := null;
    select value into old_item from jsonb_array_elements(merged) value where
      (case when value->>'type'='BUNDLE' then 'B:'||coalesce(value->>'bundleId','') else 'P:'||coalesce(value->>'productId','')||'|'||coalesce(value->>'variantId','')||'|'||coalesce(value->>'size','')||'|'||coalesce(value->>'color','') end)=key limit 1;
    if old_item is not null then
      merged := (select coalesce(jsonb_agg(case when (case when value->>'type'='BUNDLE' then 'B:'||coalesce(value->>'bundleId','') else 'P:'||coalesce(value->>'productId','')||'|'||coalesce(value->>'variantId','')||'|'||coalesce(value->>'size','')||'|'||coalesce(value->>'color','') end)=key then jsonb_set(value,'{qty}',to_jsonb(least(99,coalesce((value->>'qty')::integer,0)+qty))) else value end),'[]'::jsonb) from jsonb_array_elements(merged) value);
    else merged := merged || jsonb_build_array(item); end if;
  end loop;
  insert into public.cart_logs(shop_id,tg_id,account_id,items,item_count,updated_at,customer_notified_at,admin_reminded_at,reminder_count)
    values(p_shop_id,p_tg_id,p_account_id,merged,(select coalesce(sum(coalesce((value->>'qty')::integer,0)),0) from jsonb_array_elements(merged) value),now_ts,null,null,0)
    on conflict(shop_id,tg_id) do update set account_id=excluded.account_id,items=excluded.items,item_count=excluded.item_count,updated_at=excluded.updated_at,customer_notified_at=null,admin_reminded_at=null,reminder_count=0;
  response:=jsonb_build_object('items',merged,'updatedAt',now_ts,'replayed',false);
  insert into public.web_cart_merge_receipts(shop_id,account_id,merge_key,response,request_items) values(p_shop_id,p_account_id,p_merge_key,response,p_incoming_items);
  return response;
end $$;
commit;
