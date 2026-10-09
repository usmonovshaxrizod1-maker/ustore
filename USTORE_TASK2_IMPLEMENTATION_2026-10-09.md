# UStorE — TOPSHIRIQ №2: PLATFORM Web + Mini App reklama slayderi

**Manba:** `USTORE_TASK1_UPDATED_SOURCE_2026-10-09.zip`, 2026-10-09.
**Holat:** Kod yozildi; avtomatik test va production build o'tdi; production deploy qilinmagan.

## 1. Qamrov

| O'lcham | Qamrov |
|---|---|
| Tizim | PLATFORM; SHOP APP o'zgartirilmagan |
| Muhit | WEB va Telegram MINI APP |
| Qurilmalar | MOBILE, TABLET, DESKTOP (responsive) |
| Admin | Faqat PLATFORM SUPER ADMIN |
| User | Do'koni bo'lmagan foydalanuvchining reklama bosh sahifasi |
| Tegilmaydi | Do'koni bor dashboard, do'kon administratori, tarif/narxlar, bosh sahifa matnlari, header |

## 2. Bajarilgan o'zgarishlar

1. `supabase/migrations/119_platform_landing_slides.sql`: doimiy `platform_landing_slides` jadvali, 10 ta global limit (tranzaksiya blokirovkasi bilan), faqat image/png, image/jpeg, image/webp uchun public `platform-landing` storage bucket, yozish uchun RLS ochilmagan.
2. `supabase/functions/platform-api/index.ts`: `platform_admin_landing_list`, `_upload`, `_delete`, `_reorder` API; yozishga faqat kriptografik aniqlangan Platform Super Admin ruxsat; fayl imzosi, tomonlar nisbati (1:1), 128-4096 px va 2 MB tekshiruvi; almashtirishda eski faylni chiqarish; saqlangan tartib. `platform_public_catalog` va do'koni yo'q foydalanuvchining `platform_boot` javobiga shu yagona manbadan `landingSlides` beriladi.
3. `web/shared/platform-landing-image.js`: brauzerda format/o'lchamni tekshirish va administrator tanlagan yo'nalishda kvadratga keltirish (center/top/bottom/left/right), yengil WebP/JPEG'ga optimallashtirish; ikkala muhitda qayta ishlatiladi.
4. `web/features/platform-home/platform-home.js`: oldingi kod bilan chiziladigan mockup/illustratsiyalar o'rniga faqat yuklangan rasmlar, premium 1:1 konteyner, ~5 s autoplay, oldinga-orqaga, indikatorlar, swipe, 1 rasmdagi ortiqcha boshqaruvni yashirish, 0 rasmda premium bo'sh fon.
5. `platform/platform-app.js`: Telegram Mini App do'koni bo'lmagan foydalanuvchiga shu `landingSlides` bilan yangi hero slayder; Super Admin → Sozlamalar → Reklama slayderi bo'limi (qo'shish, almashtirish, o'chirish, ↑↓ orqali tartib, preview, crop pozitsiya va saqlash).
6. `web/features/platform-admin/platform-admin.js`: Web Super Admin uchun alohida reklama slayderi sahifasi, bir xil API yordamida CRUD/tartib.
7. `platform/platform.css`, `web/styles/features.css`: barcha ekranlar uchun 1:1 rasm/preview/karta bezaklari.
8. `platform/index.html`, `web/index.html`, `web/404.html`, `web/styles/index.css`, `web/app.js`, `web/navigation/routes.js`: yangi komponent ulanishi va tegishli asset cache versiyalarini yangilash.
9. Yangi `tests/ustore-task2-landing-carousel.test.cjs` va mavjud eskirgan snapshot sinovlariga tuzatish.

## 3. Tekshiruvlar (lokal)

- `node --test --experimental-strip-types tests/*.test.cjs`: **1154 / 1154 PASS**.
- `node scripts/build-production.mjs`: **PASS**.
- `node scripts/check-edge-syntax.cjs`: **PASS**, 28 ta Edge TypeScript fayl.
- `node scripts/measure-production.mjs`: **PASS**.

Bu avtomatik testlar va kod qurilishi natijalari. Real Supabase ma'lumotlar bazasi, Telegram va brauzer interfeysida production E2E tekshiruv o'tkazilmagan.

## 4. Deploy ketma-ketligi (muhim)

1. Loyihaning yangi **119**-migratsiyasini production Supabase loyihasiga qo'llang. `platform_landing_slides` va `platform-landing` storage bucket yaratilganini tekshiring. Oldingi migratsiyalar ham tartib bilan qo'llangan bo'lishi kerak.
2. Yangilangan `supabase/functions/platform-api/index.ts` Edge Functionni avvalgi loyiha konfiguratsiyasi va secret'lari bilan qayta deploy qiling. **DB migratsiyasidan OLDIN yangi funksiyani deploy qilmang.**
3. Yangilangan Web statik fayllari (shu jumladan `web/404.html` va `web/shared/platform-landing-image.js`) va Platform Telegram Mini App manbasini amaldagi hostingga deploy qiling. Projektdagi production build scripti: `node scripts/build-production.mjs`; yaratilgan `dist/` artefakti hosting jarayoniga mos qo'llanadi. Web + Mini App fayl yo'llari va cache'ni tekshiring.
4. Super Admin sifatida Web va Telegramda yangi slayder sozlamalarini oching; 1, 2, 10 ta rasm, kvadrat emas rasm, almashtirish, o'chirish, tartib, server restartdan keyin saqlanishi bo'yicha smoke-test qiling.
5. `ustr.uz` Public Web hamda do'koni bo'lmagan Mini App akkaunti uchun xuddi shu rasmlar/tartib ko'rinishini, telefon/planshet/desktop o'lchamlarini va swipe/arrows/dots/autoplay'ni tekshiring; biror do'koni mavjud foydalanuvchi dashboardi o'zgarmaganini tekshiring.

**Eslatma:** Agar 119-migratsiya qo'llanmasa, public slayder eski maketlarsiz bo'sh fallbackni ko'rsatadi; yangi rasm qo'shish DB/storage jadvali bo'lmagani sababli ishlamaydi.

## 5. Fayllar

- `USTORE_TASK2_UPDATED_SOURCE_2026-10-09.zip` — Task #1 ustiga Task #2 qo'llangan to'liq manba.
- `USTORE_TASK2_CHANGED_FILES_2026-10-09.zip` — Task #1 ZIPga nisbatan farq qilgan fayllar va shu hisobot.

**Production sayti o'zgartirilmagan.** Faqat manba kodiga o'zgartirish kiritilgan.
