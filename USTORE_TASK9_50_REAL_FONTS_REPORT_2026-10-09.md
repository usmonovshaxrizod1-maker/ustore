# UStorE — 9-topshiriq: Word’dagidek 50 ta haqiqiy shrift (2026-10-09)

## Manba va qamrov

- Manba: `USTORE_TASK8_LEGAL_TEMPLATES_UPDATED_SOURCE_2026-10-09.zip` (1–8-topshiriqlar saqlangan).
- **SHOP APP → MINI APP + WEB → MOBILE + TABLET + DESKTOP → ADMIN**.
- Faqat «Nomdan logo yaratish → Uslub» va uning fontlarini yuklash hamda Web CSP’ga ruxsatlar.
- PLATFORM, boshqa SHOP APP bo‘limlari, mahsulotlar, to‘lov, marketing, huquqiy shablonlarga tegilmadi.

## O‘zgartirishlar

1. `ustore-shop-app.js`: oldingi 15 uslub ro‘yxati o‘rniga roppa-rosa **50 ta boshqa-boshqa shrift oilasi**. Oldingi 14 text-preset ID saqlandi va mos real family bilan qayta ishlatildi; `monogram-badge` variantidagi eski logotip uchun kompatibil kod saqlandi, lekin 50 ta shrift ro‘yxatiga kiritilmadi.
2. Har bir variantda tanlangan logo nomi **shu font oilasida** ko‘rinadi. `Uslub` ro‘yxatiga nom bo‘yicha qidirish qo‘shildi, avvalgi yopiladigan va scroll qilinadigan tuzilma saqlangan.
3. Fontlar **Google Fonts CSS2 orqali talab paydo bo‘lganda** yuklanadi: hozirgi tanlov va ro‘yxatda ko‘rinayotgan elementlargina. `IntersectionObserver` ishlamasa birinchi 6 ta shrift yuklanadi. Keshlash `Map` orqali bir shriftning ikki marta so‘ralishini oldini oladi.
4. `ustore.css`: mobil/desktop qidiruv inputi va 50-item tanlov ro‘yxati uchun CSS; boshqa dizaynlar o‘zgarmaydi.
5. `web/index.html`, `web/_headers`: Web CSP’da faqat `https://fonts.googleapis.com` CSS va `https://fonts.gstatic.com` font manbalariga minimal ruxsat qo‘shilgan. Boshqa script-src va xavfsizlik qoidalari o‘zgarmadi.
6. `index.html`: Shop App CSS va JS asset versiyalari 331 va 333 ga yangilandi (Telegram/WebView eskisini keshdan ishlatmasin).
7. `tests/*.test.cjs`: oldingi qat’iy asset versiyalari yangi versiyaga moslandi; avvalgi «7 system family stacks» testlari 50 ta **haqiqiy font oilasi** talabi bo‘yicha yangilandi. `tests/ustore-task9-fifty-real-fonts.test.cjs`: 5 ta yangi maqsadli test.
8. `docs/branding/USTORE_50_FONT_CATALOG.md`: barcha 50 shrift oilasi, preset ID va izohlar.

## Saqlash va xavfsizlik

- Har bir logo odatdagidek `logo_wordmark` JSON orqali serverda saqlanadi; yangi jadval va SQL migratsiya **kerak emas**.
- Tashqi font fayllari na import, na fayl sifatida ZIPga qo‘shilgan. Fontlarni browser Google Fonts’dan yuklaydi; Web CSP’da faqat ikkita font domeniga ruxsat qo‘shilgan.
- Font internet/CSP tufayli yuklanmasa, ilova generic fallback ko‘rsatishi mumkin. Foydalanuvchi noto‘g‘ri ko‘rinishni saqlab yubormasligi uchun `Saqlash` bosilganda yuklangan font tekshiriladi.
- **Yangi PNG/SVG logotipni eksport qilish funksiyasi yozilmadi**: mavjud tizimning saqlash formati jonli wordmark matnidir. Agar haqiqiy SVG/PNG eksport talab qilinsa, uni alohida qilish kerak.
- Oldingi mavjud logotiplar oʻchirilmaydi, lekin oldingi 14 ta presetning shrift ko‘rinishi yangi mos font bilan **o‘zgaradi**. Buni productionga chiqarishdan oldin do‘kon egalari bilan kelishish maqsadga muvofiq.

## Test natijalari

- `node --check ustore-shop-app.js`: **OK**.
- `node --test --experimental-strip-types --test-concurrency=4 tests/*.test.cjs`: **1 192/1 192** muvaffaqiyatli, jumladan 5 ta yangi test.
- `node scripts/check-edge-syntax.cjs`: **29/29**.
- `node scripts/build-production.mjs`, `node scripts/measure-production.mjs`: **OK**, 1218 build fayl; dastlabki JS gzip 40065 bayt (bu topshiriq initial shop JS boot’ni sezilarli og‘irlashtirmaydi).
- `node --test --test-concurrency=1 --test-timeout=30000 tests/web-*/*.test.cjs`: **473/514**; qolgan **41 ta xato 8-topshiriq manba ZIP’ida ham xuddi shunday** (oldingi release-audit 001–120 migratsiya hisoblagichi, SQL test kutubxonasi yo‘qligi va boshqalar). Yangi farqli xatolar aniqlanmadi.
- Google Fonts CDN’dan barcha shriftlar **real tarmoqda** olinishi, Telegram WebView va desktop/tablet browserlarida haqiqiy screenshot preview **tekshirilmagan**: joriy muhitda `fonts.googleapis.com` domeni ishlamadi.
- Productionga **deploy qilinmagan**.

## Deploy va foydalanuvchi tekshiruvi

1. To‘liq yangilangan source ZIP’ni ishchi kodga qo‘ying. `ustore-shop-app.js`, `ustore.css`, `index.html` (Telegram / iframe), `web/index.html`, `web/_headers` (Web) birgalikda deploy qiling.
2. SQL va Edge Function deploy **shart emas**.
3. Mini App’da «Do‘kon parametrlari → Nomdan logo yaratish → Uslub» ni oching; 50 ta turli font ro‘yxatda borligini tekshiring. Pastga scroll qilib ko‘ring; font shakllari har xil ko‘rinishi kerak.
4. `FITCORE`, `Фиткоре`, `Oʻzbek` matnlarini turli shriftlarda sinang; Google Fonts kontent filtrlarida harf subsetlari to‘liq yuklanayotganini tekshiring. Tanlab saqlang, sahifani qayta ochib shriftini tekshiring.
5. Desktop va tablet Web, mobil Web va Telegram Mini App’da bir xil presetId’da bir xil font chiqishini va browser CSP console’da Google Fonts bloklanmaganini tekshiring.
6. Agar Google Fonts tarmoqqa cheklangan bo‘lsa, ushbu versiya xatolik xabarini ko‘rsatadi. Productionda doimiy mustaqillik kerak bo‘lsa, alohida litsenziyalangan va qonuniy self-hosting rejasini tuzing.
