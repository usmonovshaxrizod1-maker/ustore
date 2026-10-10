# UStorE — USTR kirishi, 4- va 9-topshiriq tuzatishlari

Sana: 2026-10-10. Ishchi papka: `D:/Tejamkor AI/USTORE_GIT`.

## Holat

Tuzatishlar lokalda. Production deploy va Git push bajarilmadi. Oxirgi `git fetch origin`dan keyin HEAD va origin/main bir xil: oldinda 0, ortda 0; lokal o‘zgarishlar shu kod asosida qilingan. Database migration yaratilmadi va real baza o‘zgartirilmadi.

## USTR sahifasi va login qaytishi

Sabab: `/platform-ui/`ga global va maxsus `_headers` qoidalari birga qo‘llanib, ikkita qarama-qarshi CSP/X-Frame-Options siyosatini yuborgan. Global `frame-ancestors 'none'`/DENY ichki sahifani bloklagan; maxsus SAMEORIGIN uni bekor qilmagan. Natija: login tugasa ham kulrang, ochilmagan iframe.

Tuzatish: faqat `/platform-ui/*`da global ikkita header `!` sintaksisi bilan olib tashlanadi, so‘ng yagona same-origin siyosat qo‘llanadi. Mavjud UI inline onclick va inline style ishlatgani uchun aynan shu sahifada ularning ishlashiga ruxsat beriladi. Tashqi login/callback va boshqa sahifalarning qat’iy siyosati saqlangan. Cloudflare rasmiy header semantikasi: https://developers.cloudflare.com/workers/static-assets/headers/ .

Platform muvaffaqiyatli render bo‘lgandan keyin `APP_READY` yuboradi. Shu bilan hostning 18 soniyalik noto‘g‘ri failure taymeri to‘xtaydi. Telegram autentifikatsiya mexanizmi o‘zgartirilmadi.

## 1045 original kategoriya ikonkasi

Sabab: original SVG fayllar o‘chirilmagan, lekin original qidirish/tanlash mexanizmini UI yashirib, emoji va rasm tanlash bilan almashtirgan.

Original arxivdagi barcha 1045 SVG lokal fayllar bilan baytma-bayt solishtirildi: 0 farq. Arxiv: `USTORE_CATEGORY_ICON_LIBRARY_FINAL_1045.zip`; SHA-256: dfc69bae7d630edf98c603728076c959ec3fa0147f212803f414df19bedac34f. Hech bir original SVG qayta yaratilmagan yoki almashtirilmagan.

UI faqat «Ikonkalar» va «Rasm yuklash» variantlarini beradi. Original qidirish, ranglar, IDlar, kategoriya yaratish/tahrirlash va pin qilingan kategoriyalar bir xil renderer orqali ishlaydi. Yangi kategoriya ochish har safar alohida draftni tiklaydi. Emoji picker, uning uslublari va yangi emoji yozish yo‘llari olib tashlandi.

SVG va rasm uchun ortiqcha oq fon, chegara va soya olib tashlangan. PNG/WebP alfa kanali JPEG fallback holatida ham yo‘qotilmaydi. Mavjud icon_id, icon_color, img va tarixiy icon_emoji ma’lumotlari bazadan o‘chirilmaydi. Tarixiy emoji maydonlari UI tomonidan ishlatilmaydi; tanlangan original SVG ID ustuvor.

## 50 haqiqiy shrift

Sabablar: masofaviy Google Fonts yuklanmaganda fallback ishlashi va, eng muhimi, `font-family` ichidagi qo‘shtirnoqlar HTML style atributini buzishi. Shrift nomlari har xil bo‘lsa ham haqiqiy yozuv bir xil fallbackda chiqqan.

Tuzatish: 50 alohida shriftning real WOFF2 fayllari va har biri uchun litsenziyasi loyihada. Manba pinned official google/fonts commit; oilalar va eski preset IDlar saqlangan. Style atributi to‘g‘ri escape qilinadi. FontFace orqali shu fayl preview, saqlangan logo va PNG eksportda ishlatiladi. Ko‘rinadigan/tanlangan fontlargina yuklanadi; katalog va oilalar yuklanishi deduplikatsiya qilinadi.

Yuklanmagan yoki kerakli harflarni qo‘llamaydigan font o‘rnida foydalanuvchiga aniq holat ko‘rsatiladi; fallback haqiqiy shriftdek namoyish etilmaydi. Barcha 50 oila o‘zbek lotin va to‘liq rus alifbosini qo‘llaydi. O‘zbek kirillidagi Қ/Ғ/Ҳ kabi qo‘shimcha harflar hamma upstream oilalarda yo‘q; UI buni aniqlab mos shrift tanlashni so‘raydi. Montserrat va boshqa to‘liq qamrovli oilalar mavjud. Avval saqlangan 15 eski uslub o‘zgartirilmagan.

Batafsil katalog: `docs/branding/USTORE_50_FONT_CATALOG.md`; manba/litsenziya/qayta ishlash: `vendor/wordmark-fonts/README.md` va `catalog.json`.

## Tekshiruvlar

- `npm test`: 1191/1191 o‘tdi.
- `npm run test:web`: 527/527 o‘tdi.
- `npm run lint`: o‘tdi.
- `npm run check:edge`: 29 TypeScript fayli sintaksisi o‘tdi.
- `npm run build`: yakuniy production build o‘tdi; yakuniy ko‘rsatkichlar review papkasidagi build.log faylida.
- `git diff --check`: o‘tdi.
- Original SVG arxiv auditi: 1045/1045, 0 bayt farqi.
- Real headless Edge: platform iframe yuklandi; shops/home navigatsiyasi ishladi; APP_READY failure taymerini to‘xtatdi; pageerror 0.
- Real brauzer: 1045 ikonka ro‘yxati, qidirish, rang almashtirish, yaratish/tahrirlash, yangi draft reset tekshirildi.
- Shaffof PNG real rasm tayyorlash oqimidan o‘tdi: burchak alfa qiymati 0. SVG oddiy/pin renderer fonlari 390/820/1440 pikselda transparent.
- 50 font preview ready va 50 alohida computed font-family. 50 real PNG eksport SHA-256lari farqli. Tanlangan Lobster saqlashda saqlanadi.
- Ikonka va shrift kodi Mini App va Shop Web iframe’da umumiy; viewport tekshiruvlari mobil/planshet/desktop o‘lchamlarida bajarildi.

Tekshiruv chegarasi: brauzer sinovi lokal serverda, real production JS va haqiqiy shrift/ikonka fayllari bilan o‘tkazildi. API javoblari test fixture; real bazada kategoriya yozilmadi. Real Telegram OAuth roziligi va live production deploy tekshirilmagan. Windowsda `wrangler dev --local` workerd native xatosi sabab ochilmadi; brauzer test serveri rasmiy `_headers` merge/detach semantikasini qo‘lladi. Header regression testi barcha mos qoidalarni birga tekshiradi.

Test skripti: `scripts/verify-task4-9-browser.cjs` (build’dan so‘ng; Playwright module, output directory, browser executable argumentlari). Natijalar, screenshot va 50 PNG: `D:/Tejamkor AI/USTORE_TASK4_9_REVIEW/browser`. Suite loglari: `D:/Tejamkor AI/USTORE_TASK4_9_REVIEW`.

## Deployga tayyorlik

Lokal build va tekshiruvlar o‘tdi. Ruxsat berilganda Mini App uchun GitHub Pages artefakti, USTR uchun Cloudflare static assets va kategoriya API uchun shop-api yangilanadi. Platform-api bu tuzatishlarda o‘zgarmadi. Yangi migration talab etilmaydi. Production holati hozircha o‘zgarmagan.

## O‘zgargan va qo‘shilgan fayllar

Eski emoji test fayli SVG/image regression testiga almashtirilgan. Eski testlardagi aniq cache-versiya tekshiruvlari yangilangan; boshqa talablar yumshatilmagan. Quyidagi ro‘yxat repository rootga nisbatan:

- `docs/branding/USTORE_50_FONT_CATALOG.md`
- `docs/reports/USTORE_TASK4_9_FIX_REPORT_2026-10-10.md`
- `index.html`
- `platform/index.html`
- `platform/platform-app.js`
- `scripts/verify-task4-9-browser.cjs`
- `supabase/functions/shop-api/index.ts`
- `tests/ustore-20260908-video-fixes.test.cjs`
- `tests/ustore-20260910-download-import-promo.test.cjs`
- `tests/ustore-20260911-bulk-catalog-chatgpt.test.cjs`
- `tests/ustore-20260911-delete-category-menu-bug.test.cjs`
- `tests/ustore-20260911-image-url-referrer-retry.test.cjs`
- `tests/ustore-20260911-missing-image-per-color.test.cjs`
- `tests/ustore-fulfillment-responsive-card-replace.test.cjs`
- `tests/ustore-marketing-mukammal.test.cjs`
- `tests/ustore-marketing-responsive-web.test.cjs`
- `tests/ustore-missed-1-6-final.test.cjs`
- `tests/ustore-postdeploy-fix8.test.cjs`
- `tests/ustore-regression.test.cjs`
- `tests/ustore-reports-dashboard-1to1.test.cjs`
- `tests/ustore-shopapp-polish-round.test.cjs`
- `tests/ustore-shopapp2-master-plan.test.cjs`
- `tests/ustore-six-fixes.test.cjs`
- `tests/ustore-task2-part2-notifications-login.test.cjs`
- `tests/ustore-task4-category-emoji-image.test.cjs`
- `tests/ustore-task4-category-svg-image.test.cjs`
- `tests/ustore-task6-platform-and-category-polish.test.cjs`
- `tests/ustore-task8-legal-templates.test.cjs`
- `tests/ustore-task9-fifty-real-fonts.test.cjs`
- `tests/web-security/platform-frame-headers.test.cjs`
- `ustore-shop-app.js`
- `ustore.css`
- `vendor/wordmark-fonts/README.md`
- `vendor/wordmark-fonts/catalog.json`
- `vendor/wordmark-fonts/font-alice.LICENSE.txt`
- `vendor/wordmark-fonts/font-alice.woff2`
- `vendor/wordmark-fonts/font-arsenal.LICENSE.txt`
- `vendor/wordmark-fonts/font-arsenal.woff2`
- `vendor/wordmark-fonts/font-bad-script.LICENSE.txt`
- `vendor/wordmark-fonts/font-bad-script.woff2`
- `vendor/wordmark-fonts/font-balsamiq-sans.LICENSE.txt`
- `vendor/wordmark-fonts/font-balsamiq-sans.woff2`
- `vendor/wordmark-fonts/font-caveat.LICENSE.txt`
- `vendor/wordmark-fonts/font-caveat.woff2`
- `vendor/wordmark-fonts/font-comfortaa.LICENSE.txt`
- `vendor/wordmark-fonts/font-comfortaa.woff2`
- `vendor/wordmark-fonts/font-cormorant-garamond.LICENSE.txt`
- `vendor/wordmark-fonts/font-cormorant-garamond.woff2`
- `vendor/wordmark-fonts/font-cuprum.LICENSE.txt`
- `vendor/wordmark-fonts/font-cuprum.woff2`
- `vendor/wordmark-fonts/font-didact-gothic.LICENSE.txt`
- `vendor/wordmark-fonts/font-didact-gothic.woff2`
- `vendor/wordmark-fonts/font-exo-2.LICENSE.txt`
- `vendor/wordmark-fonts/font-exo-2.woff2`
- `vendor/wordmark-fonts/font-fira-sans.LICENSE.txt`
- `vendor/wordmark-fonts/font-fira-sans.woff2`
- `vendor/wordmark-fonts/font-forum.LICENSE.txt`
- `vendor/wordmark-fonts/font-forum.woff2`
- `vendor/wordmark-fonts/font-golos-text.LICENSE.txt`
- `vendor/wordmark-fonts/font-golos-text.woff2`
- `vendor/wordmark-fonts/font-ibm-plex-mono.LICENSE.txt`
- `vendor/wordmark-fonts/font-ibm-plex-mono.woff2`
- `vendor/wordmark-fonts/font-ibm-plex-sans.LICENSE.txt`
- `vendor/wordmark-fonts/font-ibm-plex-sans.woff2`
- `vendor/wordmark-fonts/font-ibm-plex-serif.LICENSE.txt`
- `vendor/wordmark-fonts/font-ibm-plex-serif.woff2`
- `vendor/wordmark-fonts/font-inter.LICENSE.txt`
- `vendor/wordmark-fonts/font-inter.woff2`
- `vendor/wordmark-fonts/font-jura.LICENSE.txt`
- `vendor/wordmark-fonts/font-jura.woff2`
- `vendor/wordmark-fonts/font-lato.LICENSE.txt`
- `vendor/wordmark-fonts/font-lato.woff2`
- `vendor/wordmark-fonts/font-lobster.LICENSE.txt`
- `vendor/wordmark-fonts/font-lobster.woff2`
- `vendor/wordmark-fonts/font-manrope.LICENSE.txt`
- `vendor/wordmark-fonts/font-manrope.woff2`
- `vendor/wordmark-fonts/font-marck-script.LICENSE.txt`
- `vendor/wordmark-fonts/font-marck-script.woff2`
- `vendor/wordmark-fonts/font-merriweather.LICENSE.txt`
- `vendor/wordmark-fonts/font-merriweather.woff2`
- `vendor/wordmark-fonts/font-montserrat.LICENSE.txt`
- `vendor/wordmark-fonts/font-montserrat.woff2`
- `vendor/wordmark-fonts/font-neucha.LICENSE.txt`
- `vendor/wordmark-fonts/font-neucha.woff2`
- `vendor/wordmark-fonts/font-nunito.LICENSE.txt`
- `vendor/wordmark-fonts/font-nunito.woff2`
- `vendor/wordmark-fonts/font-open-sans.LICENSE.txt`
- `vendor/wordmark-fonts/font-open-sans.woff2`
- `vendor/wordmark-fonts/font-oranienbaum.LICENSE.txt`
- `vendor/wordmark-fonts/font-oranienbaum.woff2`
- `vendor/wordmark-fonts/font-oswald.LICENSE.txt`
- `vendor/wordmark-fonts/font-oswald.woff2`
- `vendor/wordmark-fonts/font-pacifico.LICENSE.txt`
- `vendor/wordmark-fonts/font-pacifico.woff2`
- `vendor/wordmark-fonts/font-pangolin.LICENSE.txt`
- `vendor/wordmark-fonts/font-pangolin.woff2`
- `vendor/wordmark-fonts/font-philosopher.LICENSE.txt`
- `vendor/wordmark-fonts/font-philosopher.woff2`
- `vendor/wordmark-fonts/font-play.LICENSE.txt`
- `vendor/wordmark-fonts/font-play.woff2`
- `vendor/wordmark-fonts/font-playfair-display.LICENSE.txt`
- `vendor/wordmark-fonts/font-playfair-display.woff2`
- `vendor/wordmark-fonts/font-poiret-one.LICENSE.txt`
- `vendor/wordmark-fonts/font-poiret-one.woff2`
- `vendor/wordmark-fonts/font-prata.LICENSE.txt`
- `vendor/wordmark-fonts/font-prata.woff2`
- `vendor/wordmark-fonts/font-pt-mono.LICENSE.txt`
- `vendor/wordmark-fonts/font-pt-mono.woff2`
- `vendor/wordmark-fonts/font-pt-sans.LICENSE.txt`
- `vendor/wordmark-fonts/font-pt-sans.woff2`
- `vendor/wordmark-fonts/font-pt-serif.LICENSE.txt`
- `vendor/wordmark-fonts/font-pt-serif.woff2`
- `vendor/wordmark-fonts/font-raleway.LICENSE.txt`
- `vendor/wordmark-fonts/font-raleway.woff2`
- `vendor/wordmark-fonts/font-roboto-condensed.LICENSE.txt`
- `vendor/wordmark-fonts/font-roboto-condensed.woff2`
- `vendor/wordmark-fonts/font-roboto-slab.LICENSE.txt`
- `vendor/wordmark-fonts/font-roboto-slab.woff2`
- `vendor/wordmark-fonts/font-roboto.LICENSE.txt`
- `vendor/wordmark-fonts/font-roboto.woff2`
- `vendor/wordmark-fonts/font-rubik-mono-one.LICENSE.txt`
- `vendor/wordmark-fonts/font-rubik-mono-one.woff2`
- `vendor/wordmark-fonts/font-rubik.LICENSE.txt`
- `vendor/wordmark-fonts/font-rubik.woff2`
- `vendor/wordmark-fonts/font-scada.LICENSE.txt`
- `vendor/wordmark-fonts/font-scada.woff2`
- `vendor/wordmark-fonts/font-tenor-sans.LICENSE.txt`
- `vendor/wordmark-fonts/font-tenor-sans.woff2`
- `vendor/wordmark-fonts/font-ubuntu.LICENSE.txt`
- `vendor/wordmark-fonts/font-ubuntu.woff2`
- `vendor/wordmark-fonts/font-unbounded.LICENSE.txt`
- `vendor/wordmark-fonts/font-unbounded.woff2`
- `vendor/wordmark-fonts/font-yeseva-one.LICENSE.txt`
- `vendor/wordmark-fonts/font-yeseva-one.woff2`
- `web/_headers`
