# UStorE — 4-topshiriq: har bir kategoriya uchun Emoji yoki Rasm

**Qamrov:** SHOP APP → Mini App va Web → mobil/planshet/desktop → Admin (boshqarish) va User (ko‘rsatish).

## Bajarilgan funksiyalar

- Kategoriya yaratish va tahrirlash oynalariga har bir kategoriya uchun **Emoji / Rasm yuklash** mustaqil tanlovi qo‘shildi.
- Emoji uchun qurilmaning haqiqiy rangli emoji fonti ishlatiladi; tayyor tanlovlar va boshqa emojini yozib tanlash mumkin.
- PNG, JPG va WebP yuklanadi, preview bor. PNG/WebP dagi shaffof alpha-kanal saqlanadi; rasm `object-fit:contain` bilan cho‘zmasdan/kesmasdan ko‘rsatiladi. Eski WebView shaffof tasvirni JPEG formatiga aylantirib yuborsa, alpha-kanalni yo‘qotmaslik uchun asl fayl tanlanadi. Oq fonda tayyorlangan JPEG ichidagi oq piksellar avtomatik o‘chirilmaydi.
- Admin saqlagan tanlov barcha mijozlar uchun (Mini App va Web) umumiy kategoriya ma’lumotlari orqali chiqadi.
- **Mavjud kataloglar va ularning eski SVG ikonkalari o‘zgarishsiz qoladi**, toki admin emoji yoki rasmga almashtirmaguncha; kategoriyalar va mahsulotlar o‘chirilmaydi.
- Mavjud Supabase Storage `images` va `storeProductImage` yuklash yo‘li qayta ishlatilgan; fayllar optimallashtiriladi va rasm o‘zgartirilganda eski faylga boshqa havola bo‘lmasa cleanup ishlaydi.

## Asosiy kod o‘zgarishlari

- `ustore-shop-app.js`: kategoriya visual tanlovi, preview, native emoji va rasm renderi, kategoriya saqlash payloadi.
- `ustore.css`: background transparent + contain, emoji selector va preview.
- `supabase/functions/shop-api/index.ts`: kategoriya tipi/emoji validatsiyasi va create/update, barcha storefront katalog selectlariga yangi ustunlar.
- `supabase/migrations/121_category_visual_modes.sql`: `icon_type` va `icon_emoji` ustunlari. Oldingi kategoriyalar uchun default `legacy`.
- `index.html`: yangilangan fayllar kesh versiyasi.
- `tests/ustore-task4-category-emoji-image.test.cjs`: to‘rtta yangi regresiya testi (shu jumladan eski WebView alpha fallback). Oldingi kesh-versiya testlari yangi versiyaga moslashtirildi.

## Deploy

1. Dastlab 119 va 120 migratsiyalari qo‘llanganligini tekshiring, keyin **121-migratsiya**ni Supabase SQL muhitiga qo‘llang.
2. `shop-api` Edge Function ni yangilang.
3. Shop App statik fayllari (Mini App va Web bir xil manbadan foydalanadigan fayllar) ni deploy qiling; brauzer kesh versiyalarini yangilang.
4. Admin orqali bir kategoriya uchun 🍕 emoji, boshqa kategoriya uchun shaffof PNG/WebP yuklang. Telegram Mini App, mobil Web va desktop/tabletda ko‘rinishini tekshiring. So‘ng kategoriya tahriri va sahifani qayta ochishda saqlanishini sinang.

## Sinovlar

- `node --no-warnings --experimental-strip-types --test tests/*.test.cjs`: **1166/1166** test PASS.
- `npm run build`: PASS; 1218 fayldan production build.
- `node scripts/check-edge-syntax.cjs`: PASS.
- Bu muhitda real ishchi Supabase bazasi va haqiqiy Telegram/Chrome brauzeri bilan end-to-end tekshiruv bajarilmadi. Production saytga deploy qilinmadi.

## Eslatma

- Oq fonli **JPEG** faylning o‘zida oq fon rasmga qo‘shib saqlangan bo‘lsa, faqat `object-fit` bilan o‘chmaydi; shaffof PNG yoki WebP ishlating.
- Bu bosqich aynan category visual uchun. Marketing/Platform va oldingi topshiriqlarga tegilmagan.
