-- ============================================================================
-- USTORE — 055: "Mini-App ochilgan, lekin obuna bo'lmagan" eslatmalari
-- (Telegram bildirishnoma tizimi, Group A — 053-migratsiyada ataylab
-- qoldirilgan yagona qism, endi to'ldirilmoqda)
-- ============================================================================
-- Trigger: foydalanuvchi Mini App'ni ochadi (platform_boot chaqiriladi),
-- lekin hech qachon do'kon egasi bo'lmaydi. +1/+3/+7 kundan keyin eslatma,
-- keyin TO'XTAYDI (cheksiz marketing emas). Har bir eslatma yuborilishidan
-- OLDIN qayta tekshiriladi — agar shu orada obuna bo'lgan bo'lsa, yuborilmaydi.
--
-- notification_events'ni QAYTA ISHLATA OLMAYMIZ — u shop_id NOT NULL talab
-- qiladi, bu yerda esa hali hech qanday do'kon yo'q. Shu sabab
-- platform_visitor_tracking'ning o'zida 3 ta alohida "yuborildi" ustuni
-- (idempotency shu yerda, alohida jadval kerak emas).
--
-- 001-054'ga tegilmaydi, faqat qo'shimcha.
-- ============================================================================

begin;

create table public.platform_visitor_tracking (
  telegram_user_id bigint primary key,
  first_visit_at timestamptz not null default now(),
  reminder_1d_sent_at timestamptz,
  reminder_3d_sent_at timestamptz,
  reminder_7d_sent_at timestamptz
);
alter table public.platform_visitor_tracking enable row level security;

-- notification_templates.type CHECK'ini kengaytirish (kamaytirish emas,
-- qo'shish — 053'dagi 6 ta mavjud turga 3 ta yangisi qo'shiladi).
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.notification_templates'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%type%';
  if con_name is not null then
    execute format('alter table public.notification_templates drop constraint %I', con_name);
  end if;
end $$;

alter table public.notification_templates
  add constraint notification_templates_type_check
  check (type in (
    'EXPIRY_7D', 'EXPIRY_3D', 'EXPIRY_1D', 'FROZEN', 'GRACE_7D', 'GRACE_1D',
    'VISITOR_1D', 'VISITOR_3D', 'VISITOR_7D'
  ));

insert into public.notification_templates (type, body) values
  ('VISITOR_1D', '👋 Salom! UStorE''da o''z Telegram do''koningizni ochib ko''rdingizmi? Bir necha daqiqada sozlab, birinchi mahsulotingizni qo''shishingiz mumkin.'),
  ('VISITOR_3D', '🛍 UStorE bilan Telegram orqali onlayn savdo qilish oson. Hali boshlamagan bo''lsangiz — tariflarni ko''rib chiqing, birinchi obunada +7 kun bonus bor.'),
  ('VISITOR_7D', '⏳ So''nggi eslatma: UStorE''da do''koningizni ochish uchun tayyor turibmiz. Savolingiz bo''lsa — Yordam bo''limidan yozing.');

commit;
