// UStorE: do'kon lifecycle bo'yicha yagona, umumiy konstantalar — platform-api
// (backend action'lar) va platform-subscription-cron (avtomatik tekshiruv)
// ikkalasi ham AYNAN shu faylni import qiladi, shuning uchun "60 kun" kabi
// qiymatlar ikkita joyda mustaqil yozilib, keyinchalik bir-biridan
// chetlashib qolish xavfi yo'q.
//
// Haqiqiy, admin sozlaydigan qiymat hamon platform_lifecycle_settings.
// retention_days ustunida saqlanadi (bu FAQAT o'sha sozlama hali
// yuklanmagan/topilmagan holatlar uchun zaxira qiymat).
export const SHOP_FREEZE_DAYS = 60;
