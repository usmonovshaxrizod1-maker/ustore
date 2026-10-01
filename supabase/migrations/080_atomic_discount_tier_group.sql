-- USTORE GREENFIELD — 080: save a tier group and all of its steps in one txn.
begin;
create or replace function public.ustore_save_discount_tier_group(
  p_shop_id uuid,p_group_id uuid,p_group jsonb,p_steps jsonb
) returns uuid language plpgsql as $$
declare v_group_id uuid; v_step jsonb;
begin
  if p_steps is null or jsonb_array_length(p_steps)=0 then raise exception 'steps_required'; end if;
  if p_group_id is null then
    insert into public.discount_tier_groups(
      shop_id,name,category_ids,product_ids,starts_at,ends_at,allow_stacking,is_active,updated_at
    ) values(
      p_shop_id,nullif(p_group->>'name',''),p_group->'category_ids',p_group->'product_ids',
      nullif(p_group->>'starts_at','')::timestamptz,nullif(p_group->>'ends_at','')::timestamptz,
      coalesce((p_group->>'allow_stacking')::boolean,false),coalesce((p_group->>'is_active')::boolean,true),now()
    ) returning id into v_group_id;
  else
    update public.discount_tier_groups set
      name=nullif(p_group->>'name',''),category_ids=p_group->'category_ids',product_ids=p_group->'product_ids',
      starts_at=nullif(p_group->>'starts_at','')::timestamptz,ends_at=nullif(p_group->>'ends_at','')::timestamptz,
      allow_stacking=coalesce((p_group->>'allow_stacking')::boolean,false),
      is_active=coalesce((p_group->>'is_active')::boolean,true),updated_at=now()
    where shop_id=p_shop_id and id=p_group_id returning id into v_group_id;
    if v_group_id is null then raise exception 'group_not_found'; end if;
    delete from public.discount_tiers where shop_id=p_shop_id and group_id=v_group_id;
  end if;
  for v_step in select value from jsonb_array_elements(p_steps) loop
    insert into public.discount_tiers(
      shop_id,group_id,name,threshold_amount,discount_type,discount_value,
      category_ids,product_ids,starts_at,ends_at,allow_stacking,is_active,updated_at
    ) values(
      p_shop_id,v_group_id,nullif(p_group->>'name',''),(v_step->>'threshold_amount')::numeric,
      v_step->>'discount_type',(v_step->>'discount_value')::numeric,
      p_group->'category_ids',p_group->'product_ids',nullif(p_group->>'starts_at','')::timestamptz,
      nullif(p_group->>'ends_at','')::timestamptz,coalesce((p_group->>'allow_stacking')::boolean,false),
      coalesce((p_group->>'is_active')::boolean,true),now()
    );
  end loop;
  return v_group_id;
end; $$;
revoke all on function public.ustore_save_discount_tier_group(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ustore_save_discount_tier_group(uuid,uuid,jsonb,jsonb) to service_role;
commit;
