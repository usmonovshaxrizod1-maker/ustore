# UStorE — 6-topshiriq: Platform USER UX + mobil kategoriya ikonkalari

**Kod asosi:** `USTORE_TASK5_PAYMENT_DELIVERY_UPDATED_SOURCE_2026-10-09.zip`. Oldingi 1–5-topshiriq fayllari saqlanadi. **Productionga deploy qilinmagan.**

## Qamrov

| Soha | Platform (USER) | Shop App (USER/ADMIN) |
|---|---|---|
| Muhit | Telegram Mini App + Web | Telegram Mini App + Web |
| Qurilma | Mobil, tablet, desktop | Mobil emoji/rasm va pinned kategoriya ko'rinishini birxillashtirish; katta ekran regressiyasini saqlash |
| Tuzatish | Do'konlarim, Yordam/murojaatlar, joriy obuna uzaytirish | Kategoriya/featured ikonka orqasidagi noxush oq fon |

Platform Super Admin boshqaruv ekranlari, boshqa Shop App funksiyalari, billing server amallari, tarif narxlari va mavjud foydalanuvchi ma'lumotlari o'zgartirilmagan.

## Bajarilgan o'zgarishlar

### A. Platform — Do'konlarim

- Do'konlar **holati bo'yicha tartiblanadi**: ACTIVE, PROVISIONING, FROZEN, TERMINATING, TERMINATED. Ma'lumotlar o'chirilmaydi.
- Har bir kartada logotip, nom, bot username, holat, tarif va qolgan obuna muddati **aniq, ajratilgan** bloklarda ko'rsatiladi.
- Boshqarish belgisi/yo'nalishi bir xil; karta bosilganda **amaldagi** do'kon tafsilotlariga o'tadi.
- Mobil 1 ustun; 700px+ 2 ustun; 1180px+ 3 ustun. Tepadagi KPI ko'rsatkichlari va “Yangi do'kon” ishlashi saqlangan.

### B. Platform — Yordam/murojaatlar

- Asosiy sahifada yo'nalishlar aniq ajratilgan: **Yangi savol yuborish**, **Xatolik haqida xabar**, **Murojaatlar tarixi**.
- Endi “Yangi murojaat” va “Murojaatlarim” **alohida tab** sifatida ochiladi. Avvalgi holatda uchta tugmadan ikkitasi bir xil aralash yozish+tarix ekraniga olib borardi.
- Tarixda mavjud ticketning mavzusi/ID/sanasi/holati ko'rinadi; bosilganda o'zining suhbat tredi ochiladi.
- Yangi savol yuborishning backend API si o'zgarmagan (`platform_create_support_ticket`); muvaffaqiyatli yuborilganda tredi ochiladi, qaytganda tarix ko'rsatiladi.
- Telefonlarda asosiy ikkita amallar **vertikal kartalar**: tor matnlar ikki ustunga majburan tiqilmaydi. Tablet/desktopda ular 2 ustunli.

### C. Platform — Obuna muddatini uzaytirish

- Mavjud tarifli do'konning “Obunani uzaytirish” amali to'g'ridan-to'g'ri **PAYMENT** oqimiga o'tadi (`flowUpgradeAction = EXTEND`).
- Aynan EXTEND holatida katta xarid/tarif kartasi o'rniga **ixcham obuna ma'lumotlari** chiqadi: do'kon, joriy tarif, qolgan kun, qo'shiladigan davr, to'lov summasi.
- Oylik/yillik tanlash, amaldagi to'lov usullari, chek ixtiyori, shartlarga rozilik va serverdagi **avvalgi tasdiqlash mexanizmi** o'zgarmagan. Birinchi sotib olish va tarif almashtirishning oldingi kartasi saqlanadi.
- Obunasiz do'kon uchun “Uzaytirish” o'rniga mantiqan **“Tarif tanlash”** ko'rsatiladi.
- To'lovdan orqaga qaytish manba sahifaga (do'kon tafsiloti/to'lov tarixi/To'lovlar tab) mos ishlaydi.

### D. Shop App — mobil kategoriya ikonkalari

- Emoji yoki rasm bo'lgan kategoriyalarda endi wrapperga **aniq `fc-category-visual-shell`** klassi qo'yiladi. Oldingi `:has()` CSS selektoriga yagona yechim sifatida tayanilmaydi (ayrim WebViewlar uchun moslik).
- Kategoriya ro'yxati, bosh sahifaning yuqorisida pin qilingan kategoriya navigatsiyasi hamda pin qilingan kategoriya tanlash oynasi uchun oq dekorativ wrapper foni, chegara va soya olib tashlanadi.
- `object-fit:contain` va `background:transparent` saqlanadi. Rasmning O'ZIDA oq fon bo'lsa, CSS buni o'chira olmaydi; manba transparent PNG/WebP bo'lishi kerak.

## Tekshiruvlar

- `node --experimental-strip-types --test --test-concurrency=4 tests/*.test.cjs`: **1178/1178 PASS**.
- Yangi maqsadli testlar: **7/7 PASS**.
- `node scripts/build-production.mjs`: **PASS**, 1218 fayl + audit/manifest.
- `node scripts/measure-production.mjs`: **PASS**.
- `node scripts/check-edge-syntax.cjs`: **PASS**, 28 fayl.
- CSS parser (`tinycss2`): ikkala o'zgartirilgan CSS da sintaksis xatolari **0**.
- Real server orqali end-to-end obuna to'lovi, haqiqiy support ticket yozuvi hamda Telegram/Chrome desktop-tablet-mobil vizual skrinshot sinovi **hali bajarilmagan**.

## Deploy

Bu bosqich **yangi SQL migratsiya va Edge Function modifikatsiyasi** talab qilmaydi. Oldingi 1–4-topshiriqlar deploy qilinmagan bo'lsa, ularning mavjud 119–121 migratsiyalari va Edge Function o'zgarishlarini avvalgi hisobot bo'yicha qo'llash kerak.

- Platform Mini App: `platform/platform-app.js`, `platform/platform.css`, `platform/index.html`.
- Platform Web: shu fayllarning same-origin frame nusxalari (`npm run build` ularni `dist/web/platform-ui` ichiga joylaydi).
- Shop App Mini App / Web: `ustore-shop-app.js`, `ustore.css`, `index.html`. 
- Cache-busting: Platform JS `v65`, CSS `v43`; Shop App JS va CSS `v330`.

**Amaliy QA:** 390px, 820px, 1440px va Telegram Mini App’da (1) faol/o'chirilgan do'kon kartalari (2) yangi xabar, tarix, suhbatdan qaytish (3) uzaytirishdan to'lovga va orqaga o'tish (4) 1:1 PNG transparent kategoriya, emoji, pinned kategoriya tekshirilsin. Haqiqiy kartadan/to'lov provayderidan xavfsiz stagingda foydalaning.
