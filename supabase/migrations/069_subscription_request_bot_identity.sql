-- UStorE: yangi do'kon so'rovi (NEW_SHOP) yuborilayotganda, do'kon egasi
-- endi o'zi xohlagan bot nomi/bio va bot rasmini ham ILOVA ichidan
-- yuborishi mumkin — bular Telegram'ga ХЕЧ QANDAY avtomatik chaqiruv
-- bilan qo'llanilmaydi (bot rasmini API orqali o'zgartirish Telegram'da
-- umuman mumkin emas), faqat ADMIN ko'rib, botni @BotFather orqali
-- yaratayotganda QO'LDA shu materiallardan foydalanadi uchun SAQLAB
-- QO'YILADI. Uchalasi ham IXTIYORIY.
begin;

alter table public.subscription_requests
  add column if not exists requested_bot_name text,
  add column if not exists requested_bot_bio text,
  add column if not exists bot_photo_storage_path text,
  add column if not exists bot_photo_uploaded_at timestamptz;

commit;
