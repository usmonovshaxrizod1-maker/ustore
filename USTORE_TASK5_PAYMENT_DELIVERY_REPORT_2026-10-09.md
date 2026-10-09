# UStorE — 5-topshiriq: To‘lov va yetkazib berishni desktop/tabletga moslash, kartani almashtirish

**Asos:** `USTORE_TASK4_CATEGORY_EMOJI_IMAGES_UPDATED_SOURCE_2026-10-09.zip` (1–4-topshiriqlar saqlanadi).

## Qamrov

- **Tizim:** SHOP APP.
- **Dizayn:** WEB / TABLET va DESKTOP (768px+), ADMIN; Mini App va mobile Web’ning qolgan oqimi o‘zgarishsiz.
- **Karta funksiyasi:** Shop App / MINI APP + WEB / barcha qurilmalar, ADMIN tahrirlashi. USER mijozlar uchun yangi karta ma’lumoti avvalgidek umumiy fulfillment_config’dan olinadi.
- PLATFORM va boshqa Shop App sahifalari dizayni o‘zgarmadi.

## O‘zgarishlar

1. **To‘lov menyusi:** Web desktopda usullar 4 kartochkali qatorda (agar Ekvayringga ruxsat bo‘lsa), tabletda 2 ustun; oddiy mobil vertikal ro‘yxat saqlandi. `Naqd`, `Karta`, `Ekvayring`, `QR` variantlari amaldagi ruxsatlarga bog‘liq qoladi.
2. **Yetkazib berish menyusi:** `Bepul`, `Aniq narx`, `Taksi`, `Pochta` uchun xuddi shu keng ekranli kartalar.
3. **Ichki sozlamalar:** Keng Web’da usullar chapda alohida navigatsiya, o‘ngda sozlash oynasi. Narx/umumiy sozlamalar, hududlar, pochta provayderlari va QR maydonlari planshet/desktop uchun mos gridlarga ajratildi. Region/district amallari va boshqa biznes qoida o‘zgarishsiz.
4. **Karta almashtirish:** Hozirgi karta maskalangan holda ko‘rsatiladi. `Kartani almashtirish` tugmasi yangi karta raqami/egasini tahrirlashga ochadi. **Alohida `Saqlash` va `Bekor qilish` tugmalari** qo‘shildi. Validatsiya: 12–19 ta raqam, karta egasi bo‘sh emas; PIN/CVV/SMS so‘ralmaydi. `Bekor qilish` joriy serverda saqlangan karta holatini qaytaradi. Server xatoligida foydalanuvchi kiritgan yangi ma’lumot saqlashga qayta urinishi uchun qoladi, avvalgi karta saqlangan hisoblanadi. Server muvaffaqiyatli javob bergandan keyin tahrirlash oynasi yopiladi.
5. **Saqlash:** yangi server endpoint yoki baza migratsiyasi kiritilmadi — mavjud `set_fulfillment_config` va `shop_settings.fulfillment_config` ishlatiladi. `saveFulfillmentSettings()` endi muvaffaqiyat/xatolikni chaqiruvchiga qaytaradi. Yashirin umumiy action bar CSS’dagi `display:flex!important` ustuvorligini tuzatildi.
6. **Kesh:** `index.html` ichidagi Shop App JS va CSS versiyasi `328 → 329` yangilandi, tegishli eski testlar yangi kesh raqamiga moslashtirildi.

## Asosiy fayllar

- `ustore-shop-app.js` — yangi layout, navigatsiya, karta almashish/saqlash va xato oqimi.
- `ustore.css` — yangi kartochkalar, formalar va **faqat** `body.ustore-browser-mode.fc-admin-mode` + `min-width:768px` shartli desktop/tablet CSS.
- `index.html` — yangi asset versiyasi.
- `tests/ustore-fulfillment-responsive-card-replace.test.cjs` — 5 ta test: ko‘rinish, muvaffaqiyatli saqlash, xato va bekor qilish, validatsiya, katta ekran CSS qamrovi.
- Kesh versiyasini tekshiradigan mavjud `.test.cjs` fayllari ham moslashtirildi.

## Testlar

- `node --experimental-strip-types --test --test-concurrency=4 tests/*.test.cjs`: **1171/1171 PASS**.
- `node --test tests/ustore-fulfillment-responsive-card-replace.test.cjs`: **5/5 PASS**.
- `node scripts/build-production.mjs`: **PASS** (1218 files + audit/manifest).
- `node scripts/measure-production.mjs`: **PASS**.
- `node scripts/check-edge-syntax.cjs`: **PASS** (28 files).
- Tashqi Supabase bilan haqiqiy karta almashish E2E testi, Telegram/desktop/tabletning yakuniy vizual sinovi **bajarilmadi**. Chromium headless sinovi shu muhitda ishga tushmadi. Production deploy **qilinmadi**.

## Deploy va amaliy smoke-test

1. Agar 1–4-topshiriqlar hali productionga chiqmagan bo‘lsa, avval ularning **119, 120, 121** migratsiyalarini to‘g‘ri tartibda qo‘llang va tegishli Edge Function’larni yangilang (avvalgi hisobotlarga qarang). **5-topshiriqning o‘zi uchun yangi SQL migratsiya yo‘q.**
2. Shop App `index.html`, `ustore-shop-app.js`, `ustore.css` va qolgan loyiha statik fayllarini tegishli deploy muhitiga joylang. Web domeni va Telegram Mini App keshi yangi versiyani olayotganini tekshiring.
3. Desktop 1440px, tablet 820px, mobil Web 390px va Telegram Mini App’da To‘lov/Yеtkazib berish menyularini oching. Desktop/tabletdagi navigatsiya, region/district formalarini sinang. Mobil Web/Mini App umumiy vertikal oqimi saqlanganini tekshiring.
4. Admin karta raqamini almashtirsin, **Saqlash**ni bossin, profil/parametr sahifasini qayta ochib yangisini tekshirsin; mijoz checkout’ida yangisini ko‘rsin. Sun’iy tarmoq xatoligida eski karta saqlanishini, bekor qilishda tiklanishini tekshiring. To‘lov integratsiyalarini alohida tekshiring.

**Muhim:** Testlarning o'tishi live serverdagi ma'lumotlar bazasi, Cloudflare/GitHub va Telegramdagi holat tasdiqlanganini anglatmaydi.
