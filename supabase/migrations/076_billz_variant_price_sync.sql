-- USTORE GREENFIELD — 076: keep each BILLZ variation's own documented
-- retail/shop price instead of overwriting the parent product price.
begin;

create or replace function public.billz_apply_sync_v2(
  p_shop_id uuid, p_billz_product_id text, p_new_stock integer,
  p_name text default null, p_description text default null, p_price numeric default null
) returns void
language plpgsql
as $$
declare
  v_product_id uuid;
  v_variant_idx integer;
  v_variants jsonb;
begin
  select id into v_product_id from public.products
   where shop_id = p_shop_id and billz_product_id = p_billz_product_id and status <> 'DELETED'
   limit 1;
  if found then
    perform public.billz_apply_sync(p_shop_id,p_billz_product_id,p_new_stock,p_name,p_description,p_price);
    return;
  end if;

  -- The existing proven stock/deletion path remains the source of truth.
  -- Passing a null price prevents a child variation from changing the
  -- parent's base price; its own price is written below in the same DB txn.
  perform public.billz_apply_sync(p_shop_id,p_billz_product_id,p_new_stock,p_name,p_description,null);
  if p_new_stock is null or p_price is null or p_price <= 0 then return; end if;

  select p.id, p.variants into v_product_id, v_variants
    from public.products p
   where p.shop_id = p_shop_id and p.status <> 'DELETED' and p.variants is not null
     and exists (select 1 from jsonb_array_elements(p.variants) e where e->>'billzProductId' = p_billz_product_id)
   for update limit 1;
  if not found then return; end if;
  select idx - 1 into v_variant_idx
    from jsonb_array_elements(v_variants) with ordinality as t(elem,idx)
   where elem->>'billzProductId' = p_billz_product_id limit 1;
  v_variants := jsonb_set(v_variants,array[v_variant_idx::text,'price'],to_jsonb(p_price),true);
  update public.products set
    variants = v_variants,
    price = case when v_variant_idx = 0 then p_price else price end
  where shop_id = p_shop_id and id = v_product_id;
end;
$$;
revoke all on function public.billz_apply_sync_v2(uuid,text,integer,text,text,numeric) from public, anon, authenticated;
grant execute on function public.billz_apply_sync_v2(uuid,text,integer,text,text,numeric) to service_role;

commit;
