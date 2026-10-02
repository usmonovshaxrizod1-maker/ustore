-- UStorE: do'kon lifecycle — bot/mini-app haqiqiy uzilishi + muzlatish
-- muddatini (grace period) admin bitta do'kon uchun uzaytira olishi.
--
-- Bu migratsiya faqat ikkita mavjud CHECK cheklovini kengaytiradi (yangi
-- qiymat qo'shish — kamaytirish emas, xavfsiz) va yangi shablon qatorini
-- INSERT qiladi. Hech qanday mavjud qatorga tegilmaydi, hech qanday
-- ustun o'chirilmaydi.
begin;

-- 1) notification_templates.type — yangi 'GRACE_EXTENDED' turi (admin
--    muzlatilgan do'konga qo'lda kun qo'shganda egaga yuboriladigan xabar).
--    059-migratsiyadagi bilan bir xil dinamik drop/recreate naqsh — aniq
--    constraint nomiga bog'liq bo'lmaslik uchun.
do $$
declare con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  where c.conrelid='public.notification_templates'::regclass
    and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%type%';
  if con_name is not null then
    execute format('alter table public.notification_templates drop constraint %I', con_name);
  end if;
end $$;

alter table public.notification_templates
  add constraint notification_templates_type_check
  check (type in (
    'EXPIRY_7D','EXPIRY_3D','EXPIRY_1D','FROZEN','GRACE_7D','GRACE_1D',
    'VISITOR_1D','VISITOR_3D','VISITOR_7D','REACTIVATED','TERMINATED',
    'GRACE_EXTENDED'
  ));

insert into public.notification_templates(type, body) values
  ('GRACE_EXTENDED', '⏳ {SHOP_NAME} uchun muzlatish muddati {DAYS} kunga uzaytirildi. Shu muddat ichida obunani yangilang, aks holda do''koningiz butunlay o''chiriladi.')
on conflict (type) do nothing;

-- 2) platform_admin_action_log.action — yangi 'EXTEND_FROZEN_GRACE' turi.
do $$
declare con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  where c.conrelid='public.platform_admin_action_log'::regclass
    and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%action%';
  if con_name is not null then
    execute format('alter table public.platform_admin_action_log drop constraint %I', con_name);
  end if;
end $$;

alter table public.platform_admin_action_log
  add constraint platform_admin_action_log_action_check
  check (action in ('GRANT_DAYS', 'FREEZE', 'REACTIVATE', 'TERMINATE', 'EXTEND_FROZEN_GRACE'));

commit;
