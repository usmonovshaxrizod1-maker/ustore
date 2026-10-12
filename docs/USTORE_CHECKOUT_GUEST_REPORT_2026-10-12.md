# UStorE — checkout, bepul yetkazish va mehmon buyurtmalari

## Nima tuzatildi

Chekning lokal preview'i yuklash muvaffaqiyatli bo‘lganini isbotlamasdi.
Eski create_order buyurtma va ombor harakatini avval yaratib, chek yuklanmasa
buyurtmani bekor qilardi. Endi private Storage fayli, format va hajm serverda
tekshiriladi; undan keyin buyurtma, chegirma, chek va qoldiq bitta transactionda
saqlanadi. Upload xatosi buyurtma yoki bekor qilingan buyurtma yaratmaydi.

Yashirin birinchi bosqich maydonlari ikkinchi bosqichdagi qayta urinishda ism,
telefon va manzilni bo‘shatib yuborardi. Draft faqat ko‘rsatilayotgan bosqichdan
yangilanadi; xato aniq maydonni va kerakli bosqichni ochadi. Rasm va forma
muvaffaqiyatsiz urinishdan keyin saqlanadi. Bir xil checkout key takroran qoldiq
kamaytirmaydi. Bekor qilingan to‘lov urinishidan keyin yangi key bilan qayta
yuborish mumkin. Javob uzilganda bazada mavjud buyurtma tekshiriladi; bog‘langan
chek yoki natijasi noaniq urinish cheki o‘chirilmaydi.

Bepul yetkazish limiti har bir do‘kon uchun ixtiyoriy va standart o‘chiq.
Chegirmadan keyingi tovarlar summasi limitdan **katta** bo‘lishi kerak; teng
bo‘lsa bepul emas. Yetkazish narxi limit hisobiga kirmaydi. Server transaction
ichida summani qayta tekshiradi; UI yetmayotgan summani ko‘rsatadi.

Mehmon checkout standart o‘chiq. Yoqilganda kirish yoki mehmon sifatida davom
etish tanlanadi. Ism, familiya va +998 telefon talab qilinadi; OTP/akkaunt
yaratilmaydi, telefon tasdiqlanmagan deb belgilanadi. Mavjud to‘lov/yetkazish
usullari ishlaydi. Admin oddiy va mehmon buyurtmalarini birga boshqaradi.

Tasdiqlash oynasi shared Mini App/Shop Web'da bir xil: SVG check, do‘kon nomi,
to‘lov cheki tekshirilishi haqidagi matn, qaytish tugmalari. Mehmon uchun CSPRNG
bilan yaratilgan unique 10 raqamli kod, nusxalash va kuzatish ko‘rsatiladi.
Boshlang‘ich nollar saqlanadi. Kuzatish javobida ism/telefon/manzil/tovarlar,
ichki ID, receipt path/URL yoki akkaunt yo‘q. Tenant isolation va persistent
rate limit mavjud. Real do‘kon telefoni majburiy, Telegram/Instagram ixtiyoriy;
client va server havolalarni tekshiradi. Login/SMS oqimlari qayta yozilmadi.

## Migratsiyalar

Uchala yangi migratsiya production `jzdpogwxonvaagxotgyi` bazasiga qo‘llandi:

1. `20261011160643_checkout_receipt_atomic.sql` — private receipt va atomic checkout.
2. `20261011161230_guest_checkout_tracking.sql` — guest schema/RPC, xavfsiz tracking,
   rate limit, NULL-owner authorization va guest sozlamalar.
3. `20261012024744_guest_checkout_search_path.sql` — yangi guest placement
   funksiyalarining search_path'ini mustahkamlash; xatti-harakati o‘zgarmaydi.

Eski migratsiyalar va ma’lumotlar o‘chirilmagan. Production anonymous role atomic
checkout RPC'ni bajara olmaydi; service_role bajara oladi. Private receipt bucket
6 MiB va JPEG/PNG/WebP cheklovlarini saqlaydi. Guest rate-limit jadvali RLS bilan
to‘g‘ridan-to‘g‘ri mijozlardan yopiq; server service_role orqali ishlaydi.
Yangi search_path WARN'lari bartaraf etildi; oldingi 30 ta WARN inventari
o‘zgarmadi. RLS-no-policy INFO bu service-only rate-limit jadvali uchun kutilgan.

## Tekshiruvlar

- Checkout/free-delivery/guest/helper/payment regression guruhi: 65/65 PASS.
- Haqiqiy PostgreSQL (PGlite) transaction sinovlari: 3/3 PASS. Qoldiq, rollback,
  retry, chegirmali strict limit, unique kod, NULL-owner/admin approval,
  tenant isolation, persistent limit va sozlamalarni saqlash tekshirildi.
- Search_path qo‘shimchasidan keyin guest SQL: 2/2 PASS.
- Edge syntax: 31 fayl PASS.
- Release audit/tamper/ledger sinovlari: 7/7 PASS.
- Brauzer: actual shared Shop App + Web frame bridge; guest tanlash, aniq
  validation, upload fail, rasm/draftni saqlash, stable retry, tasdiqlash,
  privacy-safe tracking, 360/390/820/1440 px hamda Mini App tasdiqlashi PASS.
  Rasmlar `D:\Tejamkor AI\checkout-browser-qa` papkasida ko‘rildi.
- Production build PASS: 1426 fayl; initial JS gzip 39596 B.
- Umumiy Node suite: 1202/1206 PASS. Qolgan 4 xato clean HEAD baseline'da ham
  mavjud: premium-hotfix'dagi 2 eski release talabi, six-fixes'dagi eski
  platform.css version talabi, subscriptions'dagi eski avatar CSS talabi.
- Web suite: 532/533 PASS. Qolgan O2 loading-matn talabi oldingi HEAD'da ham
  bajarilmasdi. Shu topshiriqqa aloqador yangi xatolar qolmadi.

Eski testlarning atomic RPC/pre-upload va release version haqidagi tegishli
assertionlari yangilandi. Testlar to‘liq yashil deb taqdim qilinmaydi.
Haqiqiy production buyurtma/to‘lov yuborilmadi; real Android/iOS Telegram
qurilmasida yakuniy checkout hali tekshirilmagan. Noaniq transport xatosida
bog‘lanmagan chek ehtiyot chorasi sifatida saqlanadi, uni keyingi xavfsiz
storage cleanup jarayoni bilan tozalash mumkin.

## Deploy va foydalanish

- Supabase: `shop-api` ACTIVE, version 104; uchta migratsiya qo‘llandi.
- Cloudflare `ustore-web`: version `69e78662-bf3c-4318-a172-68644c08db9f` deploy qilindi.
- GitHub: shu report va tekshirilgan kod main'ga yuboriladi; Mini App root
  fayllari GitHub Pages'da, Web shell Cloudflare'da xizmat ko‘rsatadi.
- Guest checkout production'dagi mavjud do‘konlarda avtomatik yoqilmadi.
  Admin buyurtma sozlamalaridagi mehmon bo‘limida do‘kon telefonini kiritib
  yoqadi. Bepul yetkazish limiti mavjud yetkazish sozlamalarida alohida yoqiladi.

## O‘zgargan fayllar

Quyidagi ro‘yxat ushbu release diffidan tuziladi; .agents/.claude/.codex,
graphify-out, node_modules va build fayllari commitga kiritilmaydi.
- docs/plans/2026-10-11-checkout-guest.md
- docs/USTORE_CHECKOUT_GUEST_REPORT_2026-10-12.md
- index.html
- scripts/release-10a-audit.mjs
- scripts/release-integrity.mjs
- scripts/verify-checkout-guest.cjs
- supabase/functions/_shared/checkout-recovery.ts
- supabase/functions/_shared/guest-checkout.ts
- supabase/functions/shop-api/index.ts
- supabase/migrations/20261011160643_checkout_receipt_atomic.sql
- supabase/migrations/20261011161230_guest_checkout_tracking.sql
- supabase/migrations/20261012024744_guest_checkout_search_path.sql
- tests/ustore-15band-fixes.test.cjs
- tests/ustore-20260908-video-fixes.test.cjs
- tests/ustore-20260910-download-import-promo.test.cjs
- tests/ustore-20260911-bulk-catalog-chatgpt.test.cjs
- tests/ustore-20260911-delete-category-menu-bug.test.cjs
- tests/ustore-20260911-image-url-referrer-retry.test.cjs
- tests/ustore-20260911-missing-image-per-color.test.cjs
- tests/ustore-4-3-4-4-4-5.test.cjs
- tests/ustore-bundles-rewards-vip.test.cjs
- tests/ustore-checkout-receipt-atomic.test.cjs
- tests/ustore-click-payment.test.cjs
- tests/ustore-discount-combining.test.cjs
- tests/ustore-free-shipping-threshold.test.cjs
- tests/ustore-fulfillment-responsive-card-replace.test.cjs
- tests/ustore-guest-checkout.test.cjs
- tests/ustore-marketing-mukammal.test.cjs
- tests/ustore-marketing-responsive-web.test.cjs
- tests/ustore-missed-1-6-final.test.cjs
- tests/ustore-owner-superadmin-role.test.cjs
- tests/ustore-payme-uzum-payment.test.cjs
- tests/ustore-postdeploy-fix8.test.cjs
- tests/ustore-promo.test.cjs
- tests/ustore-regression.test.cjs
- tests/ustore-reports-dashboard-1to1.test.cjs
- tests/ustore-shopapp2-master-plan.test.cjs
- tests/ustore-six-fixes.test.cjs
- tests/ustore-task6-platform-and-category-polish.test.cjs
- tests/ustore-task8-legal-templates.test.cjs
- tests/ustore-tenant-isolation.test.cjs
- tests/web-integration/checkout-receipt-atomic-sql.test.cjs
- tests/web-integration/guest-checkout-sql.test.cjs
- tests/web-integration/telegram-official-release.test.cjs
- tests/web-security/astra-5c-commerce.test.cjs
- tests/web-security/astra-6c-notifications.test.cjs
- tests/web-security/review-10abc.test.cjs
- ustore-commerce.js
- ustore-shop-app.js
- ustore.css
- web/app.js
- web/index.html
- web/shared/frame-host.js
