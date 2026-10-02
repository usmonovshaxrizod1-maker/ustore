-- ============================================================================
-- UStorE 041 — Mahsulot kartochkasi uchun kichik rasm nusxasi (thumbnail)
-- ============================================================================
-- Muammo: mahsulot kartochkasi rasmni atigi ~128px balandlikda ko'rsatadi,
-- lekin telefon TO'LIQ o'lchamdagi rasmni yuklab olardi. Sahifada 10-20 ta
-- kartochka bo'lgani uchun mijoz bir necha megabayt kutardi — "rasmlar 3-4
-- soniya chiqmaydi" shikoyatining sababi shu.
--
-- Brauzerda o'lchandi (haqiqiy canvas kodlash, 1000px shovqinli fotosurat):
--     PNG (avvalgi holat)  -> 2140 KB
--     WebP 800px q0.75     ->  157 KB   (asosiy rasm — mahsulot sahifasi uchun)
--     WebP 320px q0.72     ->   25 KB   (kartochka uchun kifoya)
--
-- Yechim: yuklashda ikkita nusxa saqlanadi. Kartochkalar kichigini,
-- mahsulot sahifasi esa kattasini ishlatadi.
--
-- Ustun NULL bo'lishi mumkin va bu MUHIM: bugungi barcha mavjud mahsulotlarda
-- u null bo'ladi va frontend avtomatik asosiy rasmga (img) qaytadi — ya'ni
-- eski mahsulotlar avvalgidek ishlashda davom etadi, hech narsa buzilmaydi.
-- Kichik nusxa yaratish ham "iloji boricha" tarzda: agar u yuklanmasa,
-- mahsulot baribir muvaffaqiyatli saqlanadi (faqat thumb_img null qoladi).

begin;

alter table public.products
  add column if not exists thumb_img text;

commit;
