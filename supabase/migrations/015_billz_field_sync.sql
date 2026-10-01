-- ============================================================================
-- USTORE — 015: BILLZ (billz.ai) INTEGRATION, Phase 4 extension (field sync)
-- ============================================================================
-- Does NOT touch 001-014. Redefines billz_apply_sync in place (same name,
-- same first 3 params — old 3-arg callers keep working since the 3 new ones
-- default to null) to ALSO carry name/description/price on every stock sync,
-- not just quantity. Product decision (confirmed by the user): Billz is the
-- source of truth for these fields once linked — a name/description edited
-- directly in UStorE after import WILL be overwritten by Billz's version on
-- the next 15-minute sync. Category is deliberately excluded: Billz's own
-- category tree has no stored mapping to UStorE's admin-defined catalogs
-- (that was always a one-time manual choice at import time), so there is
-- nothing reliable to sync it against.
--
-- For a variative product, name/description/price always come from the
-- BILLZ PARENT product (never a specific variant's own copy) — same
-- decision Phase 2's import already made for price (UStorE has one shared
-- price/name/description per product row, not per variant). See
-- billzCrawlProductMap in _shared/billz-client.ts: every variant's map
-- entry carries its PARENT's name/description/price alongside its OWN
-- stock, precisely so this stays correct regardless of which variant
-- happens to be the one triggering a given sync call.
--
-- A changed name/description marks translation_status='PENDING' (the same
-- staleness signal every other name/description-changing code path in
-- shop-api/index.ts already uses) so the existing translate-pending sweep
-- picks it up — no new translation-triggering plumbing needed here.
-- ============================================================================

begin;

create or replace function public.billz_apply_sync(
  p_shop_id uuid, p_billz_product_id text, p_new_stock integer,
  p_name text default null, p_description text default null, p_price numeric default null
)
returns void
language plpgsql
as $$
declare
  v_product public.products;
  v_variant_idx int;
  v_variants jsonb;
  v_new_stock int;
  v_prior int;
  v_matched_sku text;
  v_name_changed boolean;
begin
  -- Branch A: non-variative product, linked directly via billz_product_id.
  select * into v_product from public.products
   where shop_id = p_shop_id and billz_product_id = p_billz_product_id and status <> 'DELETED'
   for update;
  if found then
    if p_new_stock is null then
      update public.products set status = 'DELETED', deleted_at = now(), billz_deleted_at = now()
       where id = v_product.id and shop_id = p_shop_id;
    else
      v_prior := v_product.stock;
      v_name_changed := (p_name is not null and p_name <> v_product.name)
                      or (p_description is not null and p_description is distinct from v_product.description);
      update public.products set
        stock = p_new_stock,
        status = case when p_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end,
        name = coalesce(p_name, name),
        description = coalesce(p_description, description),
        price = coalesce(p_price, price),
        translation_status = case when v_name_changed then 'PENDING' else translation_status end,
        translation_hash = case when v_name_changed then null else translation_hash end
       where id = v_product.id and shop_id = p_shop_id;
      if v_prior is distinct from p_new_stock then
        insert into public.stock_movements (shop_id, product_id, variant_sku, prior_stock, delta, new_stock, operation_type, admin_tg_id)
        values (p_shop_id, v_product.id, null, v_prior, p_new_stock - v_prior, p_new_stock, 'BILLZ_SYNC', 'billz');
      end if;
    end if;
    return;
  end if;

  -- Branch B: one variant inside a variative product's `variants` array.
  select p.* into v_product from public.products p
   where p.shop_id = p_shop_id and p.status <> 'DELETED' and p.variants is not null
     and exists (select 1 from jsonb_array_elements(p.variants) elem where elem->>'billzProductId' = p_billz_product_id)
   for update limit 1;
  if not found then
    return; -- not linked in this shop — nothing to do
  end if;

  select idx - 1 into v_variant_idx
    from jsonb_array_elements(v_product.variants) with ordinality as t(elem, idx)
   where elem->>'billzProductId' = p_billz_product_id limit 1;
  v_matched_sku := v_product.variants->v_variant_idx->>'sku';

  if p_new_stock is null then
    v_variants := v_product.variants - v_variant_idx;
    if jsonb_array_length(v_variants) = 0 then
      -- last remaining variant deleted too — the whole product goes with it.
      update public.products set status = 'DELETED', deleted_at = now(), billz_deleted_at = now()
       where id = v_product.id and shop_id = p_shop_id;
    else
      select coalesce(sum((elem->>'qty')::int), 0) into v_new_stock from jsonb_array_elements(v_variants) elem;
      update public.products set variants = v_variants, stock = v_new_stock,
             status = case when v_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end
       where id = v_product.id and shop_id = p_shop_id;
    end if;
  else
    v_prior := (v_product.variants->v_variant_idx->>'qty')::int;
    v_variants := jsonb_set(v_product.variants, array[v_variant_idx::text, 'qty'], to_jsonb(p_new_stock));
    select coalesce(sum((elem->>'qty')::int), 0) into v_new_stock from jsonb_array_elements(v_variants) elem;
    v_name_changed := (p_name is not null and p_name <> v_product.name)
                    or (p_description is not null and p_description is distinct from v_product.description);
    update public.products set
      variants = v_variants, stock = v_new_stock,
      status = case when v_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end,
      name = coalesce(p_name, name),
      description = coalesce(p_description, description),
      price = coalesce(p_price, price),
      translation_status = case when v_name_changed then 'PENDING' else translation_status end,
      translation_hash = case when v_name_changed then null else translation_hash end
     where id = v_product.id and shop_id = p_shop_id;
    if v_prior is distinct from p_new_stock then
      insert into public.stock_movements (shop_id, product_id, variant_sku, prior_stock, delta, new_stock, operation_type, admin_tg_id)
      values (p_shop_id, v_product.id, v_matched_sku, v_prior, p_new_stock - v_prior, p_new_stock, 'BILLZ_SYNC', 'billz');
    end if;
  end if;
end;
$$;

revoke all on function public.billz_apply_sync(uuid, text, integer, text, text, numeric) from public, anon, authenticated;
grant execute on function public.billz_apply_sync(uuid, text, integer, text, text, numeric) to service_role;

commit;
