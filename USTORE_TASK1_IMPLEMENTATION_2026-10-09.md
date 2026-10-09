# UStorE — TOPSHIRIQ №1 BAJARILDI

Sana: 2026-10-09  
Manba: `USTORE_COMPLETE_SOURCE_2026-10-09.zip`

## Qamrov

- **Tizim:** SHOP APP (Platform boshqaruv sahifalarining loading dizayni o'zgartirilmadi).
- **Muhit:** Telegram MINI APP va WEB, shu jumladan Web ichidagi Mini App iframe.
- **Ekranlar:** MOBILE, TABLET, DESKTOP; vertikal/gorizontal responsive, safe area.
- **Rejim:** USER + ADMIN (do'kon ochilishidagi umumiy birinchi ekran; boshqa admin sahifalari o'zgartirilmaydi).
- **Do'konlar:** faqat FITCORE emas, barcha UStorE do'konlari uchun bitta universal komponent.

## Amalga oshirildi

1. `shop-welcome.js`, `shop-welcome.css`, `shop-welcome-art.svg`: mustaqil CSS/SVG premium welcome komponent; statik yumshoq gradient/to'lqin/sharchalar, glass-logo karta, serif tipografika va 3 ta navbatma-navbat xiralashib-yorishadigan nuqta. Video/GIF/3D/heavy kutubxona yo'q.
2. Logo, nom, mavjud tema/theme ranglari va uz/ru tili uchun dinamik yangilanish. Noto'g'ri logo URL yoki mavjud bo'lmagan logo uchun monogramma. Uzun do'kon nomlari moslashadi.
3. `index.html` da Mini App ekrani birinchi paintdayoq mavjud. `ustore-shop-app.js` mavjud boot/theme/locale ma'lumotlarini shu ekranga uzatadi va asosiy sahifa tayyor bo'lganida fade-out qiladi. Iframe ichidagi welcome ota Web sahifasi bilan dublikat miltillamasligi uchun darhol olib tashlanadi.
4. `web/index.html` **va** `web/404.html` da welcome birinchi paintdan ko'rinadi; `web/launch-boot.js` brend keshini o'qiydi; `web/app.js` public/shop kontekstidan logo/theme va nomni oladi.
5. `web/shared/frame-host.js`: iframe APP_READY bo'lguncha cover saqlanadi; keyin taxminan 320ms fade-out. 15 soniyali xatolik/takror urinish yo'li bor. Mavjud server so'rovlarini ko'paytirmaydi.
6. `web/services/live/shop-public.js`: mavjud `boot` javobidagi `designSettings`ni frontendga uzatadi, yangi API so'rovi talab qilmaydi.
7. `scripts/build-production.mjs`: welcome resurslari Mini App `dist/` va Web `dist/web/` buildlariga qo'shiladi. Yangi versiya querylari orqali eski JS keshining ishlatilishi oldi olinadi (`ustore-shop-app.js?v=326`, Web `?v=20261009t1`).
8. Birinchi marta katalog keshi yo'q bo'lsa, cover skeletonni ertaroq ochmasligi uchun katalogning dastlabki so'rovi yakunlanguncha kutiladi; mahsulot tasvirlari to'liq yuklanishini kutmaydi.

## Bajarilgan tekshiruvlar

- `node --experimental-strip-types --test tests/*.test.cjs`: **1149 ta test muvaffaqiyatli, 0 xato**.
- `node scripts/build-production.mjs`: **SUCCESS**, welcome resurslari `dist/` va `dist/web/`da mavjudligi tekshirildi.
- Welcome/iframe/related focused tests: **12/12 muvaffaqiyatli**.
- `node --test --test-concurrency=1 tests/web-ui/*.test.cjs tests/web-unification/*.test.cjs`: **268/269 muvaffaqiyatli**. Qolgan bittasi `X-Robots-Tag` (`/admin`) bilan bog'liq oldindan mavjud metadata konfiguratsiya/test nomuvofiqligi; Task #1 kodiga tegishli emas.
- Brauzerni ushbu ish muhitida avtomatlashtirib ishga tushirib bo'lmadi: **real Android Chrome, Telegram WebView va desktop brauzer vizual testi o‘tkazilmagan**. Kod to'liq testdan o'tdi, real qurilmada yakuniy tasdiqlash zarur.

## Muhim chegaralar

- Bu topshiriq **faqat do'konning birinchi ochilish welcome/cover** mexanizmiga tegishli. Platform'ning o'z loading sahifasi, checkout, katalog kartalari, autentifikatsiya, admin va boshqa interfeyslarning umumiy dizayni o'zgartirilmaydi.
- Saytga haqiqiy deploy **qilinmadi**. Mini App (GitHub Pages) va Web (Cloudflare) yangilangan artefaktlari **ikkalasi ham** bir release ichida chiqishi shart. Oldindan mavjud serverga hech qanday SQL yoki Supabase migration talab qilinmaydi.
- Yangi SVG — ref rasmdagi vizual tavsifdan kod bilan yasalgan fon. Real telefondagi piksel darajasidagi moslik brauzerda ko'rib tasdiqlanmagan.

## Qo'llash

**To'liq ZIP:** `USTORE_GIT` papkasini loyiha ishchi papkasi bilan moslab, amaldagi fayllarni yangilang.  
**Faqat o'zgargan fayllar ZIP:** `USTORE_GIT/` ichidagi fayllarni mavjud ishchi papkadagi xuddi shu nisbiy yo'llarga qo'ying, so'ng `node scripts/build-production.mjs` va testlarni bajaring. 

*Avval stagingda Android Chrome + Telegram Mini App + desktop/tabletda real shop URL bilan tekshirish tavsiya qilinadi.*
