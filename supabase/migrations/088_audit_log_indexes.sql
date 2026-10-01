begin;

create index if not exists admin_audit_log_shop_admin_created_idx
  on public.admin_audit_log(shop_id, admin_tg_id, created_at desc);
create index if not exists admin_audit_log_shop_action_created_idx
  on public.admin_audit_log(shop_id, action, created_at desc);
create index if not exists admin_audit_log_shop_entity_created_idx
  on public.admin_audit_log(shop_id, entity_type, created_at desc);

commit;
