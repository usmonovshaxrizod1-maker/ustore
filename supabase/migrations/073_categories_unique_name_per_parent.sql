-- 073: Race-safe duplicate protection for categories created concurrently.
--
-- Bulk katalog yaratish (bulk_create_categories) va oddiy admin foydalanishda
-- ham, ikkita parallel so'rov bir xil nomdagi katalogni bir vaqtda topmay,
-- IKKALASI ham "yo'q ekan" deb yangi qator yaratib yuborishi mumkin edi —
-- bu yerdagi himoya faqat bitta so'rov ichida (in-memory) ishlaydi, ikkita
-- alohida so'rov o'rtasida emas. shop-api/index.ts'dagi bulk_create_categories
-- allaqachon bu holatni AGROHLIK bilan qayta-tekshirib qaytaradi (Postgres
-- xato kodi 23505 kelsa, "g'olib" qatorni qayta o'qib ishlatadi) — lekin bu
-- fallback FAQAT shu unique index mavjud bo'lsagina ishlaydi (aks holda
-- Postgres hech qanday xato bermay, ikkala qatorni ham yaratib qo'yaveradi).
--
-- XAVFSIZLIK ESLATMASI: agar biror do'konda bitta parent ostida (yoki bosh
-- darajada) allaqachon bir xil nomli (katta-kichik harf va probel
-- e'tiborsiz) ikkita faol katalog mavjud bo'lsa, bu migratsiya XATO BERIB
-- TO'XTAYDI — u HECH NARSANI o'chirmaydi yoki birlashtirmaydi (bu qaror
-- ma'lumotni yo'qotishi mumkin bo'lgani uchun avtomatik qilinmaydi).
-- Xato chiqsa: quyidagi izohlangan SELECT orqali qaysi shop_id/parent_id/
-- nom takrorlanganini toping, qaysi birini saqlab, qaysi birini (va uning
-- tovarlarini) qo'lda ko'chirish/o'chirishni hal qiling, keyin shu
-- migratsiyani qayta ishga tushiring.
begin;

-- Bosh daraja (parent_id is null) uchun — Postgres unique index'da NULL
-- hech qachon boshqa NULL'ga teng emas, shuning uchun alohida partial index.
create unique index if not exists categories_unique_name_root_idx
  on public.categories (shop_id, lower(btrim(name)))
  where parent_id is null and deleted_at is null;

-- Ichki (parent_id bor) kataloglar uchun.
create unique index if not exists categories_unique_name_parent_idx
  on public.categories (shop_id, parent_id, lower(btrim(name)))
  where parent_id is not null and deleted_at is null;

commit;

-- Agar yuqoridagi CREATE UNIQUE INDEX "could not create unique index ...
-- Key already exists" xatosi bilan to'xtasa, avval shu so'rov bilan
-- takrorlanganlarni toping:
--
-- select shop_id, parent_id, lower(btrim(name)) as norm_name, count(*), array_agg(id order by created_at)
-- from public.categories
-- where deleted_at is null
-- group by shop_id, parent_id, lower(btrim(name))
-- having count(*) > 1;
