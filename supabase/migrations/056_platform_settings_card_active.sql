-- UStorE Platform — karta to'lov usulini yoqish/o'chirish tumbleri.
-- Sinxronlashda topilgan bo'shliq: kelgan platform-api/index.ts kodi
-- (platform_get_payment_info/platform_set_payment_info)
-- platform_settings.payment_card_active ustunini o'qiydi/yozadi, lekin
-- bu ustunni yaratadigan migratsiya keltirilgan "CHANGED_ONLY" to'plamda
-- yo'q edi — shu sabab bu yerda alohida qo'shildi (kod talab qiladigan
-- ustunsiz runtime xato berardi).
alter table public.platform_settings
  add column if not exists payment_card_active boolean not null default true;
