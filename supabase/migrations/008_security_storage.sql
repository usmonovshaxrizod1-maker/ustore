-- ============================================================================
-- USTORE GREENFIELD — 008: SECURITY HARDENING + STORAGE BUCKETS
-- ============================================================================
-- PART A — explicit REVOKE as defense-in-depth on top of RLS.
--
-- Every business table already has RLS enabled with zero permissive
-- policies (001-006), which alone already blocks anon/authenticated from
-- reading/writing any row. This section adds an EXPLICIT
-- `revoke all ... from anon, authenticated` on top of that, matching the
-- old FITCORE codebase's belt-and-suspenders security convention — so a
-- future migration that accidentally adds a permissive RLS policy still
-- can't expose data, because the role has no table-level privilege at all
-- to begin with. shop-api itself is unaffected: it always runs as
-- service_role, which bypasses both RLS and ordinary GRANT/REVOKE.
--
-- PART B — Storage buckets (shop-scoped paths).
-- 18-band: object paths move from the old flat `products/...`, `orders/...`
-- to `shops/<shop_id>/products/...`, `shops/<shop_id>/categories/...`,
-- `shops/<shop_id>/logos/...`, `shops/<shop_id>/receipts/...`.
--
-- Same security model as every business TABLE in this project: the shop-api
-- Edge Function uses the service_role key, which bypasses Storage RLS the
-- same way it bypasses table RLS — so the real enforcement is the Edge
-- Function only ever minting signed upload/download URLs whose path is
-- built from `ctx.shopId` server-side, and validating on finalize/delete
-- that any client-supplied path actually starts with `shops/<ctx.shopId>/`
-- before touching it (the same pattern the old code already used —
-- productStoragePathFromUrl there did an equivalent regex check; shop-api
-- does the same thing, just shop-prefixed now). No anon/authenticated role
-- ever talks to Storage directly for business objects, so there is no
-- permissive Storage policy to write here.
-- ============================================================================

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'shops', 'shop_bots', 'shop_memberships',
    'categories', 'products', 'sku_counters', 'sku_free_pool',
    'product_price_history', 'import_batches', 'category_aliases',
    'trash_batches', 'trash_batch_items',
    'app_users', 'orders', 'payment_receipt_history', 'stock_movements',
    'user_favorites', 'user_recent_views',
    'support_tickets', 'support_ticket_messages', 'admin_audit_log',
    'shop_settings', 'design_settings',
    'delivery_branches'
  ]
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on function public.ustore_bulk_trash_products(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.ustore_purge_trash_batch(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ustore_restore_trash_items(uuid, uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.ustore_purge_trash_items(uuid, uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.place_order(uuid, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_order_status(uuid, bigint, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.set_stock_by_sku(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.get_users_summary_fast(uuid) from public, anon, authenticated;
revoke all on function public.allocate_global_skus(uuid, integer) from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
