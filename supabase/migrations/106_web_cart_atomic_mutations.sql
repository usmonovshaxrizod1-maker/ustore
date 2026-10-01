-- Web cart is authoritative account state. Legacy cart_logs is only a monitoring
-- snapshot written by Mini App; it must never overwrite a web customer's cart.
begin;
create table if not exists public.web_carts (
 shop_id uuid not null references public.shops(id) on delete cascade,
 account_id uuid not null references public.accounts(id) on delete cascade,
 tg_id text not null,
 items jsonb not null default '[]'::jsonb,
 item_count integer not null default 0,
 selected_promo_code text,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(shop_id,account_id)
);
alter table public.web_carts enable row level security;
revoke all on public.web_carts from public,anon,authenticated;
grant all on public.web_carts to service_role;
insert into public.web_carts(shop_id,account_id,tg_id,items,item_count,selected_promo_code,updated_at)
 select distinct on(shop_id,account_id) shop_id,account_id,tg_id,items,item_count,selected_promo_code,updated_at
 from public.cart_logs where account_id is not null order by shop_id,account_id,updated_at desc
 on conflict do nothing;

create table if not exists public.web_cart_mutation_receipts (
 shop_id uuid not null references public.shops(id) on delete cascade,
 account_id uuid not null references public.accounts(id) on delete cascade,
 mutation_id text not null check(length(mutation_id) between 16 and 200),
 request jsonb not null, created_at timestamptz not null default now(),
 primary key(shop_id,account_id,mutation_id)
);
alter table public.web_cart_mutation_receipts enable row level security;
revoke all on public.web_cart_mutation_receipts from public,anon,authenticated;
grant all on public.web_cart_mutation_receipts to service_role;

create or replace function public.ustore_mutate_web_cart(p_shop_id uuid,p_account_id uuid,p_tg_id text,p_mutation_id text,p_operation text,p_line jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current_items jsonb; result_items jsonb; old_item jsonb; key text; qty integer;
 prior jsonb; request_body jsonb:=jsonb_build_object('operation',p_operation,'line',p_line); stamp timestamptz;
begin
 if p_operation not in ('add','set','clear') or p_mutation_id is null or length(p_mutation_id) not between 16 and 200 then raise exception 'invalid_cart_mutation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text||':'||p_account_id::text,0));
 stamp:=clock_timestamp();
 select request into prior from public.web_cart_mutation_receipts where shop_id=p_shop_id and account_id=p_account_id and mutation_id=p_mutation_id;
 if found then
  if prior is distinct from request_body then raise exception 'cart_mutation_conflict'; end if;
  select items into current_items from public.web_carts where shop_id=p_shop_id and account_id=p_account_id;
  return jsonb_build_object('items',coalesce(current_items,'[]'::jsonb),'replayed',true);
 end if;
 select items into current_items from public.web_carts where shop_id=p_shop_id and account_id=p_account_id for update;
 current_items:=coalesce(current_items,'[]'::jsonb);result_items:=current_items;
 if p_operation='clear' then result_items:='[]'::jsonb;
 else
  key:=p_line->>'lineKey';qty:=(p_line->>'quantity')::integer;
  if key is null or qty is null or qty<0 or qty>99 then raise exception 'invalid_cart_quantity'; end if;
  select value into old_item from jsonb_array_elements(current_items) value where
   (case when value->>'type'='BUNDLE' then 'bundle:'||(value->>'bundleId') else 'product:'||(value->>'productId')||'|'||coalesce(value->>'size','')||'|'||coalesce(value->>'color','') end)=key limit 1;
  if p_operation='set' and old_item is null then raise exception 'cart_line_not_found'; end if;
  if p_operation='add' then
   if qty=0 then raise exception 'invalid_cart_quantity'; end if;
   qty:=qty+coalesce((old_item->>'qty')::integer,0);
   if qty>99 then raise exception 'invalid_cart_quantity'; end if;
   if old_item is null then old_item:=p_line-'lineKey'-'quantity'; end if;
  end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into result_items from jsonb_array_elements(current_items) value where
   (case when value->>'type'='BUNDLE' then 'bundle:'||(value->>'bundleId') else 'product:'||(value->>'productId')||'|'||coalesce(value->>'size','')||'|'||coalesce(value->>'color','') end)<>key;
  if qty>0 then result_items:=result_items||jsonb_build_array(jsonb_set(old_item,'{qty}',to_jsonb(qty))); end if;
  if jsonb_array_length(result_items)>130 then raise exception 'invalid_cart_size'; end if;
 end if;
 insert into public.web_carts(shop_id,account_id,tg_id,items,item_count,updated_at)
 values(p_shop_id,p_account_id,p_tg_id,result_items,(select coalesce(sum((value->>'qty')::integer),0) from jsonb_array_elements(result_items) value),stamp)
 on conflict(shop_id,account_id) do update set items=excluded.items,item_count=excluded.item_count,tg_id=excluded.tg_id,updated_at=excluded.updated_at;
 insert into public.web_cart_mutation_receipts(shop_id,account_id,mutation_id,request) values(p_shop_id,p_account_id,p_mutation_id,request_body);
 return jsonb_build_object('items',result_items,'updatedAt',stamp,'replayed',false);
end $$;
revoke all on function public.ustore_mutate_web_cart(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ustore_mutate_web_cart(uuid,uuid,text,text,text,jsonb) to service_role;

-- Keep existing abandoned-cart monitoring, without reading its snapshots back.
create or replace function public.ustore_web_cart_monitor() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='DELETE' then
  delete from public.cart_logs where shop_id=OLD.shop_id and account_id=OLD.account_id and items=OLD.items;
  return OLD;
 end if;
 if NEW.item_count=0 then
  delete from public.cart_logs where shop_id=NEW.shop_id and account_id=NEW.account_id;
 else
  insert into public.cart_logs(shop_id,tg_id,account_id,items,item_count,updated_at,selected_promo_code,customer_notified_at,admin_reminded_at,reminder_count)
  values(NEW.shop_id,NEW.tg_id,NEW.account_id,NEW.items,NEW.item_count,NEW.updated_at,NEW.selected_promo_code,null,null,0)
  on conflict(shop_id,tg_id) do update set account_id=excluded.account_id,items=excluded.items,item_count=excluded.item_count,updated_at=excluded.updated_at,selected_promo_code=excluded.selected_promo_code,customer_notified_at=null,admin_reminded_at=null,reminder_count=0;
 end if;
 return NEW;
end $$;
revoke all on function public.ustore_web_cart_monitor() from public,anon,authenticated;
create trigger web_cart_monitor after insert or update of items or delete on public.web_carts for each row execute function public.ustore_web_cart_monitor();

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
    select coalesce(cl.items,'[]'::jsonb) into existing from public.web_carts cl where cl.shop_id=p_shop_id and cl.account_id=p_account_id;
    return jsonb_build_object('items',coalesce(existing,'[]'::jsonb),'updatedAt',now_ts,'replayed',true);
  end if;
  select coalesce(items,'[]'::jsonb) into existing from public.web_carts where shop_id=p_shop_id and account_id=p_account_id for update;
  if existing is null then existing:='[]'::jsonb; end if;
  merged:=existing;
  for item in select value from jsonb_array_elements(coalesce(p_incoming_items,'[]'::jsonb)) loop
    key := case when item->>'type'='BUNDLE' then 'B:'||coalesce(item->>'bundleId','') else 'P:'||coalesce(item->>'productId','')||'|'||coalesce(item->>'size','')||'|'||coalesce(item->>'color','') end;
    qty := greatest(0,least(99,coalesce((item->>'qty')::integer,0)));
    if qty<=0 then continue; end if;
    old_item := null;
    select value into old_item from jsonb_array_elements(merged) value where
      (case when value->>'type'='BUNDLE' then 'B:'||coalesce(value->>'bundleId','') else 'P:'||coalesce(value->>'productId','')||'|'||coalesce(value->>'size','')||'|'||coalesce(value->>'color','') end)=key limit 1;
    if old_item is not null then
      merged := (select coalesce(jsonb_agg(case when (case when value->>'type'='BUNDLE' then 'B:'||coalesce(value->>'bundleId','') else 'P:'||coalesce(value->>'productId','')||'|'||coalesce(value->>'size','')||'|'||coalesce(value->>'color','') end)=key then jsonb_set(value,'{qty}',to_jsonb(least(99,coalesce((value->>'qty')::integer,0)+qty))) else value end),'[]'::jsonb) from jsonb_array_elements(merged) value);
    else merged := merged || jsonb_build_array(item); end if;
  end loop;
  if jsonb_array_length(merged)>130 then raise exception 'invalid_cart_size'; end if;
  insert into public.web_carts(shop_id,tg_id,account_id,items,item_count,updated_at)
    values(p_shop_id,p_tg_id,p_account_id,merged,(select coalesce(sum(coalesce((value->>'qty')::integer,0)),0) from jsonb_array_elements(merged) value),clock_timestamp())
    on conflict(shop_id,account_id) do update set items=excluded.items,item_count=excluded.item_count,updated_at=excluded.updated_at;
  response:=jsonb_build_object('items',merged,'updatedAt',now_ts,'replayed',false);
  insert into public.web_cart_merge_receipts(shop_id,account_id,merge_key,response,request_items) values(p_shop_id,p_account_id,p_merge_key,response,p_incoming_items);
  return response;
end $$;

revoke all on function public.ustore_merge_web_cart(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ustore_merge_web_cart(uuid,uuid,text,text,jsonb) to service_role;
commit;
