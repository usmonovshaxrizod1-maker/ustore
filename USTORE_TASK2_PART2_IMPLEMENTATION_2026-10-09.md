# UStorE — Topshiriq №2, 2-qism + Platform bildirishnomalari
**Sana:** 2026-10-09  
**Asosiy kod:** `USTORE_TASK2_UPDATED_SOURCE_2026-10-09.zip` (1-topshiriq va 2-topshiriq 1-qismi saqlangan).  
**Holat:** Kod tahrirlangan, local avtomatik testlar va production build bajarilgan; production xizmatlariga hali chiqarilmagan.

## Aniq qamrov

| O'zgarish | Tizim | Muhit | Ekranlar | Rejim |
|---|---|---|---|---|
| GitHub iframe'ga bog'liq Web ochilish yo'lini ajratish | PLATFORM | WEB | Mobile, Tablet, Desktop | USER va SUPER ADMIN |
| Login/parol, sessiya nazorati, qaytish marshruti | PLATFORM | WEB | Mobile, Tablet, Desktop | USER va SUPER ADMIN |
| Login tanlash oynasining Shop App uslubidagi dizayni | PLATFORM | WEB | Mobile, Tablet, Desktop | Kiruvchi USER/SUPER ADMIN |
| Profil orqali Web logout | PLATFORM | WEB | Mobile, Tablet, Desktop | USER va SUPER ADMIN |
| Do'kon bloklanishi/o'chirilishi haqidagi xabarlarni dashboarddan olib tashlab, qo'ng'iroqcha va inboxga o'tkazish | PLATFORM | WEB + Telegram Mini App | Mobile, Tablet, Desktop (mos joylarda) | USER (do'koni bor yoki oldin bo'lgan) |

SHOP APP, uning login sahifasi va navigatsiyasiga tegilmagan; faqat mavjud umumiy login komponentining PLATFORM WEB uchun alohida ko'rinishi qo'shilgan. Telegram Mini App o'z autentifikatsiyasidan foydalanishda davom etadi.

## 1. Web platforma ochilishi

**Koddagi sabab:** Eski `ustr.uz` Platform kadrini boshqa origin'dagi `https://usmonovshaxrizod1-maker.github.io/ustore/platform/?web_frame=1` manzilidan ochardi. Bu GitHub Pages va cross-origin iframe ishiga qo'shimcha bog'liqlik yaratardi; skrinshotdagi xatoni keltirgan omillardan biri bo'lishi mumkin. Aynan browserdagi tashqi xatoni jonli muhitda takrorlab diagnostika qilish imkoniyati yo'q.

**Yechim:** `scripts/build-production.mjs` Platform kodini Web sayti chiqaradigan `dist/web/platform-ui/` ichiga ham qo'shadi; Web iframe `/platform-ui/?web_frame=1` (o'z origin'i) manzilini chaqiradi. Telegram botning GitHub Pages deployment yo'li saqlanadi. `web/_headers` ichida ushbu birinchi taraf iframe'ga mos CSP va `X-Frame-Options: SAMEORIGIN` qoidalari belgilandi. Iframe ishga tushmasa, foydalanuvchiga 18 soniyadan keyin qayta urinish oynasi ko'rsatiladi — lekin bu xatoni yashirishning o'rnini bosmaydi.

**Muhim:** Productionda `dist/web` papkasini `ustr.uz` statik saytining ROOT'i sifatida chiqarish shart. `platform-ui/` qo'shilmagan eski Web deploy bilan bu yechim ishlamaydi.

## 2. Web login va logout

- `web/app.js`da login sahifasi avvalgi sessiyani tekshiradi; sessiya mavjud bo'lsa, qayta login oynasini ko'rsatmasdan kerakli Platform sahifasiga o'tadi.
- Telegram va login/parol variantlari Shop App namunasidagi oq profil kartochkasi va ikkita qator ko'rinishiga keltirildi. Platformda kerakli matnlar do'kon va to'lov kontekstiga mos; Shop App ko'rinishi o'zgarmaydi.
- Telegram yoki parol tugmasiga bosilganda o'sha kirish usulining mavjud formasi ochiladi; eski credentials backend va akkauntlar saqlanadi.
- Platform USER va SUPER ADMIN profiliga faqat Web rejimida `Akkauntdan chiqish` qo'shildi. Bu `web_sign_out` orqali bosh sahifaning mavjud auth xizmatida server tomondagi `sign_out`ga murojaat qiladi va login sahifasiga qaytaradi.
- Platform Web'ning login va ichki sahifalari bir xil origin'dagi iframe bilan ishlaydi; mavjud Web session token faqat host jarayonida saqlanadi.

## 3. Platform bildirishnomalari (Web + Mini App)

**Ko'rinish:** Platform USER header'iga qo'ng'iroqcha va o'qilmagan xabarlar soni qo'shildi. `Bildirishnomalar` sahifasida do'kon nomi, holati, sabab, sana-vaqt, admin bilan bog'lanish va tegishli holatlarda obunani ko'rish amali mavjud. `O'qildi deb belgilash` serverda saqlanadi. Do'kon o'chirilgan/muzlatilganligi haqidagi katta lifecycle banner dashboarddan olib tashlandi. Qolgan dashboard va to'lov arizalarining alohida ogohlantirishlari o'zgarmaydi.

**Saqlash:** `120_platform_owner_notifications.sql` yangi persistent jadval yaratadi. Do'kon butunlay o'chirilgandan keyin ham xabar qolishi uchun jadval `shops`ga foreign key bilan bog'lanmagan. USER ma'lumotiga faqat Edge API orqali uning tasdiqlangan Telegram ID'si bilan cheklangan holda ruxsat beriladi; RLS yoqilgan, brauzerga to'g'ridan-to'g'ri jadval siyosati ochilmagan.

**Triggerlar:** Super Admin orqali freeze/reactivate/terminate, obuna muddati tugashi cron'i orqali avtomatik freeze. Oldingi `TERMINATE` tarixidan (auditda owner ID yozilgan bo'lsa) va hozir muzlatilgan do'konlarning saqlanib turgan statusidan initial backfill mavjud. Ilgari butunlay o'chgan do'konning egasi haqidagi audit ma'lumoti qolmagan bo'lsa, uni taxmin qilib tiklash mumkin emas.

**Sinxron:** Web va Mini App ayni Edge API va jadvaldan o'qiydi. Bildirishnoma ochilganda yangilanadi, ko'rinadigan oynada har 60 soniyada va oynaga qaytishda qayta olinadi. O'qilganlik ikkala muhitda saqlanadi. Platform Super Admin rejimida user bildirishnomasi ko'rsatilmaydi.

## O'zgargan asosiy manbalar

- **DB:** `supabase/migrations/120_platform_owner_notifications.sql`.
- **Edge:** `supabase/functions/platform-api/index.ts`, `supabase/functions/platform-subscription-cron/index.ts`.
- **Platform Web/Mini App UI:** `platform/platform-app.js`, `platform/platform.css`, `platform/index.html`.
- **Web login/host/styles:** `web/app.js`, `web/shared/frame-host.js`, `web/features/auth/login.js`, `web/styles/features.css`, `web/styles/index.css`, `web/navigation/routes.js`, `web/index.html`, `web/404.html`, `web/_headers`.
- **Builder:** `scripts/build-production.mjs`.
- **Moslashtirilgan testlar:** `tests/ustore-task2-part2-notifications-login.test.cjs` yangi; avvalgi release kesh talablariga bog'langan testlardagi versiya raqamlari yangilangan.

## Avtomatik tekshiruvlar

1. **Asosiy root suite:** `node --no-warnings --experimental-strip-types --test tests/*.test.cjs` — **1159/1159 PASS**.
2. **Alohida Web iframe/release/yangi testlar:** **16/16 PASS**.
3. `node scripts/check-edge-syntax.cjs` — **28 ta TypeScript Edge faylining sintaksisi OK**.
4. `node scripts/build-production.mjs` — **1218 faylli production build OK**.
5. `node scripts/measure-production.mjs` — **OK**, taxminan 6.63 MB raw, 1.75 MB gzip (butun web build, bu faqat yangi kod og'irligi emas).
6. Lokal muhitda Chrome/Telegram qurilmalarida haqiqiy vizual va server bilan end-to-end login/freeze/terminate sinovi **bajarilmadi**. Lokal PostgreSQL yoki production Supabase migratsiya dry-run bajarilmadi. Keng Web integratsiya testlarining ayrimlari bu muhitda yo'q `@electric-sql/pglite` dev paketini talab qiladi. Productiondagi muammo bartaraf bo'lganini faqat haqiqiy deploy va amaliy sinov tasdiqlaydi.

## Deploy tartibi (muhim)

1. **SQL migratsiyalar tartibi:** Avval 2-topshiriq 1-qismidagi **119**, so'ng yangi **120** migratsiya Supabase'ga qo'llanadi. Mavjud ma'lumotlar o'chirilmaydi.
2. `platform-api` Edge Function yangilanadi, undan keyin `platform-subscription-cron` Edge Function yangilanadi. Cron'da eski va yangi kod versiyalarini aralashtirib ishlatmang.
3. Web: source root'da `node scripts/build-production.mjs`, **`dist/web/` ni butunligicha** `ustr.uz` saytining statik origin root'iga deploy qiling; `platform-ui/` va `_headers` mavjudligini tekshiring. Web host worker/asset deploy sozlamasida SPA fallback hamda `/platform-ui/` index berilishi shart.
4. Telegram Platform Mini App: `platform/` va uning bog'liq Web shared skriptlari GitHub Pages `/ustore/platform/` joylashuviga yuklanadi. Avvalgi 2-topshiriq 1-qismidagi landing slayderi yo'qolib ketmasin.
5. Shundan so'ng haqiqiy telefon/tablet/desktopda Web login/parol va logout, F5 session persistence, mini-app bildirishnomalari, 1-ta muzlatish/reaktivatsiya (test do'konida), o'qilganlik sinxroni va tarixiy o'chirish xabarlari tekshirilsin.

**Maxsus eslatma:** To'liq yangilangan ZIP — barcha 1- va 2-topshiriqlar bilan manba kodi; ikkinchi ZIP — faqat aynan ushbu bosqichda tahrirlangan/qo'shilgan fayllar. Hech biri productionni o'zi avtomatik yangilamaydi.
