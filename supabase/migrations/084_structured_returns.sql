-- UStorE: qaytarish jarayonini support yozishmasidan alohida, kuzatiladigan
-- bosqichlarga ajratish. Provider/BILLZ refund avtomatik chaqirilmaydi:
-- rasmiy provayder amali bajarilgach admin faqat natijani qayd etadi.
begin;

create table if not exists public.order_returns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id bigint not null,
  requester_tg_id text not null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED','APPROVED','REJECTED','RECEIVED','RESTOCKED','REFUND_PENDING','REFUNDED','COMPLETED')),
  requested_items jsonb not null default '[]'::jsonb,
  reason text not null,
  admin_note text,
  refund_amount numeric(14,2) not null default 0,
  refund_method text,
  refund_reference text,
  billz_reconciliation_status text not null default 'NOT_REQUIRED' check (billz_reconciliation_status in ('NOT_REQUIRED','MANUAL_REQUIRED','DONE')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  received_at timestamptz,
  restocked_at timestamptz,
  refunded_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(shop_id,order_id),
  foreign key(shop_id,order_id) references public.orders(shop_id,id) on delete cascade
);
create index if not exists order_returns_shop_status_idx on public.order_returns(shop_id,status,requested_at desc);
alter table public.order_returns enable row level security;

alter table public.support_tickets add column if not exists return_request_id uuid references public.order_returns(id) on delete set null;

alter table public.stock_movements drop constraint if exists stock_movements_operation_type_check;
alter table public.stock_movements add constraint stock_movements_operation_type_check
  check (operation_type in ('KIRIM','BUYURTMA','MANUAL','BILLZ_SYNC','QAYTARISH'));

create or replace function public.ustore_update_order_return_status(
  p_shop_id uuid,p_return_id uuid,p_new_status text,p_admin_tg_id text,p_admin_note text default null
) returns public.order_returns language plpgsql security definer set search_path=public as $$
declare r public.order_returns; allowed boolean := false;
begin
  select * into r from public.order_returns where shop_id=p_shop_id and id=p_return_id for update;
  if not found then raise exception 'return_not_found'; end if;
  allowed := (r.status='REQUESTED' and p_new_status in ('APPROVED','REJECTED'))
    or (r.status='APPROVED' and p_new_status='RECEIVED')
    or (r.status='RESTOCKED' and p_new_status='REFUND_PENDING')
    or (r.status='REFUNDED' and p_new_status='COMPLETED');
  if not allowed then raise exception 'invalid_return_transition:%->%',r.status,p_new_status; end if;
  update public.order_returns set status=p_new_status,admin_note=coalesce(nullif(trim(p_admin_note),''),admin_note),
    approved_at=case when p_new_status='APPROVED' then now() else approved_at end,
    received_at=case when p_new_status='RECEIVED' then now() else received_at end,
    completed_at=case when p_new_status in ('REJECTED','COMPLETED') then now() else completed_at end,
    updated_at=now()
  where id=p_return_id and shop_id=p_shop_id returning * into r;
  return r;
end; $$;

create or replace function public.ustore_restock_order_return(
  p_shop_id uuid,p_return_id uuid,p_admin_tg_id text
) returns public.order_returns language plpgsql security definer set search_path=public as $$
declare r public.order_returns; item jsonb; product_row public.products; idx int; old_qty int; new_vars jsonb; new_total int; qty int; product_id uuid; variant_sku text; has_billz boolean:=false;
begin
  select * into r from public.order_returns where shop_id=p_shop_id and id=p_return_id for update;
  if not found then raise exception 'return_not_found'; end if;
  if r.status<>'RECEIVED' then raise exception 'invalid_return_transition:%->RESTOCKED',r.status; end if;
  for item in select value from jsonb_array_elements(r.requested_items) loop
    product_id:=nullif(item->>'product_id','')::uuid; qty:=greatest(0,coalesce((item->>'qty')::int,0));
    if product_id is null or qty<=0 then raise exception 'invalid_return_item'; end if;
    select * into product_row from public.products where shop_id=p_shop_id and id=product_id for update;
    if not found then raise exception 'return_product_not_found:%',product_id; end if;
    has_billz:=has_billz or product_row.billz_product_id is not null;
    if jsonb_array_length(coalesce(product_row.variants,'[]'::jsonb))>0 then
      select ordinality-1 into idx from jsonb_array_elements(product_row.variants) with ordinality e(value,ordinality)
       where lower(trim(coalesce(value->>'size','')))=lower(trim(coalesce(item->>'size','')))
         and lower(trim(coalesce(value->>'color','')))=lower(trim(coalesce(item->>'color',''))) limit 1;
      if idx is null then raise exception 'return_variant_not_found:%',product_id; end if;
      old_qty:=coalesce((product_row.variants->idx->>'qty')::int,0);
      variant_sku:=product_row.variants->idx->>'sku';
      has_billz:=has_billz or coalesce(nullif(product_row.variants->idx->>'billzProductId',''),nullif(product_row.variants->idx->>'billz_product_id','')) is not null;
      new_vars:=jsonb_set(product_row.variants,array[idx::text,'qty'],to_jsonb(old_qty+qty));
      select coalesce(sum((v->>'qty')::int),0) into new_total from jsonb_array_elements(new_vars) v;
      update public.products set variants=new_vars,stock=new_total,sold_count=greatest(0,sold_count-qty),status='ACTIVE' where id=product_id and shop_id=p_shop_id;
      insert into public.stock_movements(shop_id,product_id,variant_sku,prior_stock,delta,new_stock,operation_type,admin_tg_id,order_id)
      values(p_shop_id,product_id,variant_sku,old_qty,qty,old_qty+qty,'QAYTARISH',p_admin_tg_id,r.order_id);
    else
      old_qty:=coalesce(product_row.stock,0);new_total:=old_qty+qty;
      update public.products set stock=new_total,sold_count=greatest(0,sold_count-qty),status='ACTIVE' where id=product_id and shop_id=p_shop_id;
      insert into public.stock_movements(shop_id,product_id,variant_sku,prior_stock,delta,new_stock,operation_type,admin_tg_id,order_id)
      values(p_shop_id,product_id,null,old_qty,qty,new_total,'QAYTARISH',p_admin_tg_id,r.order_id);
    end if;
  end loop;
  update public.order_returns set status='RESTOCKED',restocked_at=now(),updated_at=now(),
    billz_reconciliation_status=case when has_billz then 'MANUAL_REQUIRED' else 'NOT_REQUIRED' end
  where id=p_return_id and shop_id=p_shop_id returning * into r;
  return r;
end; $$;

create or replace function public.ustore_mark_order_return_refunded(
  p_shop_id uuid,p_return_id uuid,p_admin_tg_id text,p_refund_method text,p_refund_reference text
) returns public.order_returns language plpgsql security definer set search_path=public as $$
declare r public.order_returns;
begin
  select * into r from public.order_returns where shop_id=p_shop_id and id=p_return_id for update;
  if not found then raise exception 'return_not_found'; end if;
  if r.status<>'REFUND_PENDING' then raise exception 'invalid_return_transition:%->REFUNDED',r.status; end if;
  if coalesce(trim(p_refund_reference),'')='' then raise exception 'refund_reference_required'; end if;
  update public.order_returns set status='REFUNDED',refund_method=nullif(trim(p_refund_method),''),refund_reference=trim(p_refund_reference),refunded_at=now(),updated_at=now()
   where id=p_return_id and shop_id=p_shop_id returning * into r;
  update public.orders set payment_status='REFUNDED',refunded_at=now(),payment_due_at=null where shop_id=p_shop_id and id=r.order_id;
  return r;
end; $$;

revoke all on function public.ustore_update_order_return_status(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.ustore_restock_order_return(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.ustore_mark_order_return_refunded(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.ustore_update_order_return_status(uuid,uuid,text,text,text) to service_role;
grant execute on function public.ustore_restock_order_return(uuid,uuid,text) to service_role;
grant execute on function public.ustore_mark_order_return_refunded(uuid,uuid,text,text,text) to service_role;

commit;
