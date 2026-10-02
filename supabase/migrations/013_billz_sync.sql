-- ============================================================================
-- USTORE — 013: BILLZ (billz.ai) INTEGRATION, PHASE 4 (automatic sync)
-- ============================================================================
-- Does NOT touch 001-012. Purely additive.
--
-- One background pass (see supabase/functions/billz-sync/, cron-invoked
-- every 15 minutes) does a full paginated crawl of a shop's Billz catalog
-- and, for every billz-linked UStorE product/variant, either:
--   a) updates its stock (still present in Billz), or
--   b) marks it deleted (no longer present in Billz at all).
-- Both cases are handled by ONE new RPC, billz_apply_sync — same shape as
-- set_stock_by_sku (007_tenant_rpcs.sql): match by product OR by variant,
-- recompute the parent's total stock from variants, log to stock_movements.
--
-- `products.billz_deleted_at` distinguishes a Billz-triggered auto-hide from
-- a manual trash action (status='DELETED' alone can't tell them apart) — the
-- admin's dedicated "Billz > O'chirilganlar" sub-menu is simply
-- `where billz_deleted_at is not null`, kept OUT of the general trash UI on
-- purpose (trash_batches rows are never created for these).
-- ============================================================================

begin;

alter table public.products add column if not exists billz_deleted_at timestamptz;

create index if not exists products_shop_billz_deleted_idx
  on public.products(shop_id, billz_deleted_at)
  where billz_deleted_at is not null;

-- New operation_type for the audit trail, alongside the existing three.
alter table public.stock_movements drop constraint if exists stock_movements_operation_type_check;
alter table public.stock_movements add constraint stock_movements_operation_type_check
  check (operation_type in ('KIRIM', 'BUYURTMA', 'MANUAL', 'BILLZ_SYNC'));

-- ----------------------------------------------------------------------------
-- BILLZ_APPLY_SYNC — one Billz product's crawl result applied to UStorE.
-- p_new_stock = NULL means "this billz_product_id no longer exists in Billz
-- at all" (deleted); a non-null integer means "still exists, this is its
-- current stock". Handles both a directly-linked non-variative product
-- (products.billz_product_id) and a single variant inside a variative
-- product's `variants` jsonb array — mirrors set_stock_by_sku's two-branch
-- shape exactly, just keyed by billz_product_id instead of sku.
-- ----------------------------------------------------------------------------
create or replace function public.billz_apply_sync(p_shop_id uuid, p_billz_product_id text, p_new_stock integer)
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
      update public.products set stock = p_new_stock,
             status = case when p_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end
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
    update public.products set variants = v_variants, stock = v_new_stock,
           status = case when v_new_stock > 0 then 'ACTIVE' else 'OUT_OF_STOCK' end
     where id = v_product.id and shop_id = p_shop_id;
    if v_prior is distinct from p_new_stock then
      insert into public.stock_movements (shop_id, product_id, variant_sku, prior_stock, delta, new_stock, operation_type, admin_tg_id)
      values (p_shop_id, v_product.id, v_matched_sku, v_prior, p_new_stock - v_prior, p_new_stock, 'BILLZ_SYNC', 'billz');
    end if;
  end if;
end;
$$;

revoke all on function public.billz_apply_sync(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.billz_apply_sync(uuid, text, integer) to service_role;

commit;
