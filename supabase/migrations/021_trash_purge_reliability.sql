-- ============================================================================
-- USTORE ROUND14 — 021: TRASH PURGE RELIABILITY
-- ============================================================================
-- Fixes permanent deletion for category batches in a schema where tenant-owned
-- relations use composite (shop_id, id) foreign keys. We explicitly detach the
-- nullable reference column BEFORE delete so PostgreSQL never attempts to SET
-- the NOT NULL shop_id column to NULL as part of a composite ON DELETE action.
-- Also detaches self-referencing category parents before the batch delete.
-- ============================================================================

begin;

create index if not exists trash_batches_expiry_idx
  on public.trash_batches(deleted_at)
  where restored_at is null and purged_at is null;

create or replace function public.ustore_purge_trash_batch(p_shop_id uuid, p_batch_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_batch public.trash_batches;
  v_image_urls jsonb;
  v_product_count int;
  v_category_count int;
begin
  select * into v_batch
    from public.trash_batches
   where shop_id = p_shop_id and id = p_batch_id
   for update;

  if not found then
    raise exception 'trash_batch_not_found:%', p_batch_id;
  end if;
  if v_batch.restored_at is not null or v_batch.purged_at is not null then
    raise exception 'batch_not_purgeable:%', p_batch_id;
  end if;

  select coalesce(jsonb_agg(img) filter (where img is not null), '[]'::jsonb), count(*)
    into v_image_urls, v_product_count
    from public.products
   where shop_id = p_shop_id
     and id in (select (x)::uuid from jsonb_array_elements_text(v_batch.product_ids) x);

  -- Product-owned dependent rows use ON DELETE CASCADE and are removed with
  -- the products. Delete products before categories so category references
  -- cannot block a category batch purge.
  delete from public.products
   where shop_id = p_shop_id
     and id in (select (x)::uuid from jsonb_array_elements_text(v_batch.product_ids) x);

  select count(*) into v_category_count
    from public.categories
   where shop_id = p_shop_id
     and id in (select (x)::uuid from jsonb_array_elements_text(v_batch.category_ids) x);

  -- Defensive detach for any product that was not part of the original batch
  -- but still points at a category being permanently removed.
  update public.products
     set category_id = null
   where shop_id = p_shop_id
     and category_id in (select (x)::uuid from jsonb_array_elements_text(v_batch.category_ids) x);

  -- Self-FK is ON DELETE RESTRICT. Detach batch nodes first so parent/child
  -- deletion order is irrelevant inside this permanent purge transaction.
  update public.categories
     set parent_id = null
   where shop_id = p_shop_id
     and id in (select (x)::uuid from jsonb_array_elements_text(v_batch.category_ids) x);

  -- trash_batches has composite (shop_id, root_category_id) ON DELETE SET NULL.
  -- Explicitly NULL only root_category_id, otherwise PostgreSQL may try to NULL
  -- shop_id as well, which is NOT NULL.
  update public.trash_batches
     set root_category_id = null
   where shop_id = p_shop_id and id = p_batch_id;

  delete from public.categories
   where shop_id = p_shop_id
     and id in (select (x)::uuid from jsonb_array_elements_text(v_batch.category_ids) x);

  update public.trash_batch_items
     set status = 'PURGED', acted_at = now()
   where shop_id = p_shop_id and batch_id = p_batch_id and status = 'PENDING';

  update public.trash_batches
     set purged_at = now()
   where shop_id = p_shop_id and id = p_batch_id;

  return jsonb_build_object(
    'imageUrls', v_image_urls,
    'productCount', v_product_count,
    'categoryCount', v_category_count
  );
end;
$$;

revoke all on function public.ustore_purge_trash_batch(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ustore_purge_trash_batch(uuid, uuid) to service_role;

commit;
