# UStorE — Topshiriq №3: Marketing responsive (2026-10-09)

## Qamrov
- **Tizim:** SHOP APP
- **Muhit:** Web storefront (brauzer, shu jumladan Web frame orqali ishlaydigan Shop App)
- **Ekran:** planshet va desktop, CSS media query `min-width: 768px`
- **Rejim:** do‘kon ADMIN, `marketing.manage` huquqi mavjud sahifalar
- **O‘zgarmagan:** Telegram Mini App, mobil Web (<768px), Shop App USER, UStorE PLATFORM, boshqa do‘kon sozlamalari, marketing backend/API va ma'lumotlar modeli.

## Asl muammo va sabab
Shop App Marketing bo‘limining mobil dizayni planshet/desktopda ham qolgan: marketing hub `.fc-mkt-pro-hub .fc-marketing-hub-grid` 1 ustunga `!important` bilan mahkamlangan; marketing sheet modalari esa oldingi `.fc-sheet-overlay`/`.fc-sheet` qoidalari bilan `max-width:30rem`, `height:100%` va telefon kabi full-screen ko‘rinishga majburlangan. Bundan tashqari `renderPageShell` sahifalariga `max-w-md` berilgan.

## O‘zgarishlar
1. Marketing bosh sahifasidagi 7 ta boshqaruv kartasi tablet/desktopda **3 ustunli**; «Marketing sozlamalari» ham shu grid uslubida.
2. Ichki Bannerlar, Aksiyalar, Promo-kodlar, Bosqichli chegirmalar, Avtomatik sovg‘alar, Shaxsiy chegirmalar ro‘yxatlari tablet (2 ustun) va keng desktop (3 ustun) grid asosida; statistikalar 4 ustunda. Ro‘yxatlardagi yuklash/bo‘sh-holat xabarlari butun qatorni egallaydi.
3. Bannerlar, aksiyalar, promo-kodlar, bosqichli chegirmalar, sovg‘alar, shaxsiy chegirmalar detail va qo‘shish/tahrirlash modallari; katalog/mahsulot tanlagich, mijoz tanlagich va banner slot tanlagich modalari markazlashgan, max 900px kenglik, viewportga mos maksimal balandlik, ichki scroll bilan.
4. Desktop formalarning mavjud bevosita maydonlari ikki ustunga ajratildi; bo‘lim sarlavhalari, rasmlar, tanlash bloklari to‘liq enni egallaydi. Font va boshqaruv elementlari yirikroq; bitta formaning barcha amallari va IDlari saqlangan.
5. «Bosh sahifa kataloglari» va «Marketing sozlamalari» alohida wrapper class orqali brauzer adminiga mos kenglik oladi.
6. Shop App `index.html` CSS/JS kesh versiyalari oshirildi, eski qat’iy kesh-versiya testlari yangi versiyaga moslashtirildi.

## Texnik fayllar
- `ustore.css`: faqat `@media(min-width:768px)` + `body.ustore-browser-mode.fc-admin-mode` bilan cheklangan marketing qoidalari.
- `ustore-shop-app.js`: faqat featured/settings sahifalarida yangi CSS class belgilari; biznes funksiyalari o‘zgarmagan.
- `index.html`: `ustore.css?v=326`, `ustore-shop-app.js?v=327`.
- `tests/ustore-marketing-responsive-web.test.cjs`: yangi CSS va qamrov kontraktlari.
- tarixiy `tests/*.test.cjs` kesh-versiya assertionlarini yangilash.

## Tekshiruvlar
- `node --check ustore-shop-app.js` — o‘tdi.
- CSS parse (`tinycss2`) — 0 ta parser xatosi.
- `node scripts/build-production.mjs` — production build muvaffaqiyatli, 1218 fayl + audit/manifest.
- `node scripts/check-edge-syntax.cjs` — 28 Edge TypeScript fayl sintaksisi o‘tdi.
- `node --test --experimental-strip-types tests/*.test.cjs` — **1162 / 1162 o'tdi**.
- Marketing Web va frame-host tanlangan testlari — **18 / 18 o'tdi**.
- To‘liq Web integratsiya testlari ushbu muhitda **473 / 514**: qolgan 41 ta test SQL uchun o‘rnatilmagan `@electric-sql/pglite`, talab qilinadigan Node TypeScript ishlatish bayroqlari, mavjud release-audit qarama-qarshiliklari va boshqa avvalgi sharoitlarga bog‘liq. Ularni muvaffaqiyatli o‘tdi deb hisoblamaslik kerak.
- Real Chrome screenshot/interaction sinovi bajarilmadi: Chromium headless ushbu container muhitida vaqt tugashi bilan to‘xtadi. Tablet/desktopda real vizual ko‘rinish ishlab turgan deployment orqali qo‘shimcha sinovdan o‘tkazilishi lozim.

## Deploy
1. Oldingi 1, 2 va 2-qism topshiriqlari saqlangan *to‘liq yangi ZIP*ni ishchi loyihaga olish yoki *changed-files ZIP* fayllarini aynan mavjud papka yo‘llarida yangilash.
2. GitHub/Shop App Mini App/Shop App Web aktiv hosting joylashuvini amaldagi deploy konfiguratsiyaga muvofiq yangilash.
3. CSS/JS cache-busting `index.html` o‘zgargan, hosting/CDN caches yangilangani tekshirilsin.
4. 768–1024, 1024–1200, >=1200px ekranlarda marketing hub, barcha ichki ro‘yxatlar, banner/promo/aksiya/chegirma/sovg‘a formalarining ochilishi, scroll, saqlash va yopish amallarini tekshirish; mobil Web va Mini App vizual regressiya sinovi.
5. Bu topshiriq uchun yangi SQL migratsiya yoki Edge API o‘zgarishi yo‘q. Oldingi topshiriqlarning server deploy bosqichlari baribir amal qiladi.

**Production saytga deploy qilinmadi.**
