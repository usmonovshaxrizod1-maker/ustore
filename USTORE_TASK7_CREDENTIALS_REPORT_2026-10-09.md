# UStorE — 7-topshiriq: Web login va parolni boshqarish

**Kod asosi:** `USTORE_TASK6_UPDATED_SOURCE_2026-10-09.zip`. 1–6-topshiriqdagi kodlar saqlangan. Productionga deploy qilinmagan.

## Qamrov

- **PLATFORM + SHOP APP**; Telegram **MINI APP** va **WEB**; Web mobil/planshet/desktop.
- **USER/ADMIN:** Shaxsning o‘z login-parolini boshqarish; Shop App’da profilning mavjud ruxsatlari saqlanadi.
- Parolni tiklash yoki almashtirish uchun mavjud akkauntlar, do‘konlar, obunalar yoki xeshlar o‘chirilmadi.

## O‘zgartirishlar

1. Parolning serverdagi umumiy validatsiyasi endi **kamida 6 belgi, ko‘pi bilan 72 UTF-8 bayt**; harf+raqam majburiy emas. Shu qoida yangi parol o‘rnatish, Web orqali parol almashtirish va parol bilan login qilishning hammasida ishlaydi. Ilgari o‘rnatilgan barcha uzunroq parollar ishlashda davom etadi. Tasodifiy xavfsiz parol generatori o‘zgarmadi.
2. **Platform Web** va **Shop App Web** profillaridagi “Web login va parol” tugmasi endi foydalanuvchini shunchaki Telegram botga yubormaydi; ichki sahifada **loginni ko‘rsatadi va nusxalashga** imkon beradi.
3. Web’da **joriy parol + yangi parol + tasdiqlash** bilan parolni yangilash mumkin. Joriy parol serverda tekshiriladi; parollar ko‘rsatish/yashirish bilan yozilishi mumkin. Saqlangandan so‘ng yangi parol **faqat shu ochiq oynada** ko‘rsatish/nusxalash uchun mavjud bo‘ladi.
4. Web paroli yangilanganda server avvalgi Web sessiyalarini bekor qiladi; foydalanuvchiga yangi parolni nusxalash va **qayta kirish** ko‘rsatiladi. Web seans tokeni brauzerdan tozalanadi, Mini App Telegram tasdig‘i buzilmaydi.
5. Web’da login nomini ham ko‘rish/nusxalash va almashtirish mexanizmi mavjud auth API orqali ishlaydi. `web-auth` Edge Function’ga **faqat tekshirilgan Web sessiya orqali login nomini oladigan** `get_credentials_status` action qo‘shildi; javobda parol xeshi yoki asl parol yo‘q.
6. Telegram Mini App’da avvalgi birinchi credential olish va parolni yaratish/almashtirish oqimi saqlangan, parol shartlari 6 belgiga yangilangan. Mini App parolni yaratilgan yoki o‘zgartirilgan zahoti ko‘rsatadi.
7. Frontend JavaScript versiyalari yangilandi; sayt eski keshdagi dastur bilan ishlamasligi kerak.

## Xavfsizlik va cheklovlar

- **Ilgari o‘rnatilgan parolni ko‘rsatish mumkin emas** — serverda bcrypt xeshi saqlangan, asl matn emas. Hech qanday plaintext saqlash yoki qayta tiklanadigan shifrlash kiritilmadi.
- Web’da joriy parol yoddan chiqqan bo‘lsa, Telegram Mini App yoki botdagi `/reset` orqali parolni yangilash talab etiladi. Web sessiya mavjudligi **o‘zi** eski parolni ko‘rsatish yoki joriy parolsiz o‘zgartirish huquqini bermaydi.
- Kamida 6 belgilik parollar avvalgi 8 belgi talabidan kuchsizroq; ushbu o‘zgarish foydalanuvchi talabiga muvofiq. Serverning mavjud rate limiting, bcrypt va session invalidation mexanizmlari saqlangan.
- Parol nusxasi `localStorage`, `sessionStorage`, SQL yoki server jurnallariga yozilmaydi; yangisi faqat muvaffaqiyatli o‘zgarishdan keyin joriy sahifada aks etadi.

## Tekshiruvlar

- Asosiy testlar: **1183/1183 muvaffaqiyatli** (5 ta yangi maxsus credential testi bilan).
- Production build: **muvaffaqiyatli**.
- Edge TypeScript sintaksisi: **28/28 fayl** (muvaffaqiyatli).
- Kengaytirilgan Web testlarida avvaldan mavjud 5 ta boshqa soha testi muammoli: 1 tasi release-audit eski migratsiya soni (118 o‘rniga 121) va 4 tasi landing demo test moslamasidagi classList mock bilan bog‘liq; ular shu credential o‘zgarishidan kelib chiqmaydi. Joriy Web auth testlari o‘tdi.
- Haqiqiy serverda parolni Web orqali almashtirish va brauzer vizual tekshiruvi **o‘tkazilmadi**. Productionga deploy qilinmagan.

## Deploy

1. Yangilangan `supabase/functions/web-auth/index.ts` va `_shared/web-auth.ts` bilan **web-auth** Edge Function’ni deploy qilish. **Yangi SQL migratsiya yo‘q.**
2. Mini App: `index.html`, `ustore-shop-app.js`; Platform Mini App: `platform/platform-app.js`, `platform/index.html` ni yangilash.
3. Web (`ustr.uz`, do‘kon saytlari): `web/app.js`, `web/index.html`, `web/404.html`, `web/shared/frame-host.js`, `web/services/live/auth.js`, `web/services/live/index.js`, `web/runtime/production.js` ni o‘z ichiga olgan yangi production build’ni deploy qilish. Build Platform Web UI’ni ham `web/platform-ui/` ga ko‘chiradi.
4. Web’da login nomi ko‘rinishini; joriy noto‘g‘ri parolda xatoni; 5 belgili rad etilishi va 6 belgili qabul qilinishini; parolni ko‘rish/nusxalash va qayta kirishni; Telegram Mini App va boshqa Web sessiyalarining holatini haqiqiy serverda tekshirish.

**To‘liq ZIP** — kod asosi bilan birga. **Changed ZIP** — faqat 7-topshiriqda o‘zgargan/yangi fayllar va mazkur hujjat.
