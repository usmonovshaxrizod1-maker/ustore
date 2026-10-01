-- USTORE GREENFIELD — 079: trash records and list ordering are all-or-nothing.
begin;

create or replace function public.ustore_trash_product(
  p_shop_id uuid,p_product_id uuid,p_deleted_by text
) returns uuid language plpgsql as $$
declare v_batch uuid; v_count integer;
begin
  update public.products set status='DELETED',deleted_at=now()
   where shop_id=p_shop_id and id=p_product_id and status<>'DELETED';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'product_not_found'; end if;
  insert into public.trash_batches(shop_id,kind,product_ids,deleted_by)
  values(p_shop_id,'PRODUCT',jsonb_build_array(p_product_id::text),p_deleted_by)
  returning id into v_batch;
  insert into public.trash_batch_items(shop_id,batch_id,product_id)
  values(p_shop_id,v_batch,p_product_id) on conflict do nothing;
  return v_batch;
end; $$;

create or replace function public.ustore_trash_category(
  p_shop_id uuid,p_root_category_id uuid,p_deleted_by text
) returns jsonb language plpgsql as $$
declare v_category_ids uuid[]; v_product_ids uuid[]; v_batch uuid;
begin
  if not exists(select 1 from public.categories where shop_id=p_shop_id and id=p_root_category_id and deleted_at is null)
    then raise exception 'category_not_found'; end if;
  with recursive tree as (
    select id from public.categories where shop_id=p_shop_id and id=p_root_category_id and deleted_at is null
    union all
    select c.id from public.categories c join tree t on c.parent_id=t.id
     where c.shop_id=p_shop_id and c.deleted_at is null
  ) select array_agg(id) into v_category_ids from tree;
  select coalesce(array_agg(id),array[]::uuid[]) into v_product_ids
    from public.products where shop_id=p_shop_id and category_id=any(v_category_ids) and status<>'DELETED';
  update public.categories set deleted_at=now() where shop_id=p_shop_id and id=any(v_category_ids);
  update public.products set status='DELETED',deleted_at=now() where shop_id=p_shop_id and id=any(v_product_ids);
  insert into public.trash_batches(shop_id,kind,root_category_id,category_ids,product_ids,deleted_by)
  values(p_shop_id,'CATEGORY',p_root_category_id,to_jsonb(v_category_ids),to_jsonb(v_product_ids),p_deleted_by)
  returning id into v_batch;
  return jsonb_build_object('batchId',v_batch,'categoryCount',cardinality(v_category_ids),'productCount',cardinality(v_product_ids));
end; $$;

create or replace function public.ustore_reorder_entities(
  p_shop_id uuid,p_entity text,p_items jsonb
) returns void language plpgsql as $$
declare v_item jsonb; v_id uuid; v_sort integer; v_count integer;
begin
  if p_entity not in ('categories','products','banners') then raise exception 'invalid_entity'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>500 then raise exception 'invalid_items'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items)
    then raise exception 'duplicate_items'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := nullif(v_item->>'id','')::uuid;
    v_sort := (v_item->>'sortOrder')::integer;
    if p_entity='categories' then
      update public.categories set sort_order=v_sort where shop_id=p_shop_id and id=v_id and deleted_at is null;
    elsif p_entity='products' then
      update public.products set sort_order=v_sort where shop_id=p_shop_id and id=v_id and status<>'DELETED';
    else
      update public.banners set sort_order=v_sort where shop_id=p_shop_id and id=v_id;
    end if;
    get diagnostics v_count = row_count;
    if v_count<>1 then raise exception 'entity_not_found:%',v_id; end if;
  end loop;
end; $$;

revoke all on function public.ustore_trash_product(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.ustore_trash_category(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.ustore_reorder_entities(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ustore_trash_product(uuid,uuid,text) to service_role;
grant execute on function public.ustore_trash_category(uuid,uuid,text) to service_role;
grant execute on function public.ustore_reorder_entities(uuid,text,jsonb) to service_role;

commit;
