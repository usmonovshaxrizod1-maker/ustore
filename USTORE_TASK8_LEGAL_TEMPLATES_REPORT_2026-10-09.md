# UStorE — 8-topshiriq, huquqiy shablonlarni qo‘shish (2026-10-09)

**Asos:** `USTORE_TASK7_UPDATED_SOURCE_2026-10-09.zip`. Oldingi 1–7-topshiriqlar manba kodi saqlangan.

## Qamrov

- **SHOP APP → MINI APP + WEB → MOBILE/TABLET/DESKTOP → ADMIN + USER**.
- **PLATFORM** huquqiy hujjatlariga tegilmadi.
- Beshta ixtiyoriy hujjat: **OFFER / RETURNS / DELIVERY / PAYMENT / WARRANTY**.
- Yangi SQL migratsiya shart emas: barcha besh `doc_type` qiymati avvalgi `114_storefront_optional_legal_documents.sql` migratsiyasida mavjud.

## Koddagi o‘zgarishlar

1. `supabase/functions/_shared/shop-legal-templates.ts` — beshta hujjat uchun batafsil o‘zbekcha va ruscha shablonlar. Har biri Sotuvchi javobgarligini, huquqiy ustuvorlikni, real to‘lov/yetkazish variantlarini va do‘konning ma’lumotlarini tekshirish talabi borligini izohlaydi.
2. `supabase/functions/shop-api/index.ts` — `LEGAL_DEFAULTS` beshta bo‘sh shablon o‘rniga yagona moduldan matn oladi. `readShopLegalDocuments` mavjud mantiqi bo‘sh qator/yangi do‘kon uchun default matnni qaytaradi, **avval saqlangan bo‘sh bo‘lmagan `content_uz`/`content_ru` matnlarini o‘zgartirmaydi**. Boshqaruvchi Saqlashni bosganda matn mavjud `shop_legal_documents` jadvalida yoziladi. Mavjud akkaunt/mahsulot/buyurtma ma’lumotlari o‘zgarmadi.
3. `ustore-shop-app.js` — ixtiyoriy hujjatlarning status izohi to‘g‘rilandi: faqat `PRIVACY` va `TERMS` ro‘yxatdan o‘tishda rozilik talab qiladi. Admin yoqqan **OFFER, DELIVERY, PAYMENT, WARRANTY** shablonlariga mijoz do‘koni pastidagi «Hujjatlar va sotuvchi» bo‘limidan havolalar qo‘shildi. DELIVERY/PAYMENT bosilganda eski umumiy yetkazish/to‘lov ma’lumoti emas, hujjatning o‘zi ochiladi. Avvalgi «Yetkazib berish va to‘lov» sahifasi o‘zgarmaydi. RETURNS avvalgi «Qaytarish va almashtirish» sahifasi orqali ochiladi.
4. `index.html` — Shop App JS kesh versiyasi `331` → `332`.
5. `tests/ustore-task8-legal-templates.test.cjs` — 4 ta yangi maxsus test. 16 ta oldingi testda eskirgan JS versiya tekshiruvi `332` ga moslashtirildi.
6. `docs/legal/USTORE_OPTIONAL_LEGAL_TEMPLATES_UZ_RU.md` — ikkala tildagi matnlarni texnik bo‘lmagan tartibda ko‘rish uchun hujjat.

## Mavjud hujjatlar va ma’lumotlar himoyasi

- `PRIVACY` va `TERMS` matnlari va ularning dastlabki tanlash mexanizmi o‘zgarmadi.
- Mavjud do‘konlardagi ilgari admin tomonidan kiritilgan `OFFER/RETURNS/DELIVERY/PAYMENT/WARRANTY` matnlari ustidan yozilmaydi. Faqat bo‘sh satr yoki yo‘q qator uchun server shablon ko‘rsatadi. Mavjud bo‘sh qator DBda avtomatik update qilinmaydi, ammo API orqali shablon ko‘rinadi va admin Saqlashni bosganda persistent bo‘ladi.
- Yangi ixtiyoriy hujjatlar avtomatik e’lon qilinmaydi (`enabled=false`); sotuvchi matnini tekshirishi va yoqishi kerak.
- Customer huquqlarini cheklaydigan umumiy muddat/«kafolat yo‘q» kabi universal cheklovlar kiritilmadi. Qonun ustuvorligi ta’kidlandi.

## Tekshiruv natijalari

- `node --check ustore-shop-app.js`: **OK**.
- `NODE_PATH=$(npm root -g) node scripts/check-edge-syntax.cjs`: **29 / 29 TypeScript fayl**.
- `node --test --experimental-strip-types --test-concurrency=4 tests/*.test.cjs`: **1187 / 1187 test muvaffaqiyatli**, jumladan 4 ta yangi test.
- `node scripts/build-production.mjs && node scripts/measure-production.mjs`: **OK** (1218 build fayl; boshlang‘ich JS gzip 40065 bayt).
- `npm ci --offline` to‘liq o‘tmadi: lokal npm cache'da `youch-core` paketi yo‘q; lekin yuqoridagi mustaqil Node build va testlar bajarildi.
- Haqiqiy **Supabase + Telegram + Web** da foydalanuvchi tekshiruvi hamda yuridik ekspertiza **o‘tkazilmagan**; productionga **deploy qilinmagan**.

## Deploy tartibi

1. Mavjud DBda `114_storefront_optional_legal_documents.sql` qo‘llangani tasdiqlansin. Agar o‘sha migratsiya avval qo‘llangan bo‘lsa, **yangi SQL kerak emas**.
2. `supabase/functions/shop-api/index.ts` va yangi `_shared/shop-legal-templates.ts` birgalikda `shop-api` Edge Function sifatida deploy qilinsin.
3. Yangilangan `ustore-shop-app.js`, `index.html` va Web production build tarqatilsin (mavjud boshqa scriptlar va fayllar saqlangan holda).
4. Admin’da 5 shablonning o‘zbekcha/ruscha matnini tekshirib ko‘ring; bittasini yoqing, mijozning Mini App va Web pastki hujjatlar bo‘limidan ochilishini tekshiring.
5. Maxsus sinov: avval admin o‘zgartirgan hujjatni qo‘l tegmasdan saqlanganligini, bo‘sh hujjatda shablon chiqishini, disabled hujjat customer'ga chiqmasligini va TERMS/PRIVACY rozilik jarayoni o‘zgarmaganligini tasdiqlang.

## Huquqiy tayanch (ko‘rish va moslashtirish uchun)

- O‘RQ-792 «Elektron tijorat to‘g‘risida»: https://lex.uz/docs/-6213382
- 221-I «Iste’molchilarning huquqlarini himoya qilish to‘g‘risida»: https://lex.uz/docs/-4704

**Ogohlantirish:** Shablonlar yuridik xulosa emas, ishlab chiqaruvchi/sotuvchi kafolati, yetkazish hududi, to‘lov provayderi, sotuvchi shaxsiy rekvizitlari va qonunchilikdagi majburiy istisnolarga moslab tekshirilsin.
