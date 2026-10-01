# CODEX INTEGRATION NOTE — USTORE 270 CATEGORY ICONS

Ushbu papkadagi tayyor asset bazasini repositoryga integratsiya qil. Iconlarning o‘zini qayta generatsiya qilma.

- `category-icons.json` — canonical metadata
- `category-icons.svg` yoki `icons/*.svg` — visual asset source
- existing category subsystemni avval inventory qil
- category image/upload ishlayotgan bo‘lsa uni ko‘r-ko‘rona o‘chirma; backward compatibility saqla
- yangi category uchun default folder icon
- `Almashtirish` orqali searchable picker ochilsin
- qidiruv UZ/RU/EN aliases bilan ishlasin
- tanlangandan keyin 5–6 brand-friendly color preset ko‘rsat
- rang variantlari uchun SVG fayllarni ko‘paytirma; `currentColor`/CSS token ishlat
- selected icon ID + color token saqlansin
- iconlar fixed pixel size emas: containerga qarab scale qilinsin
- 4 ta kategoriya bo‘lsa katta, 20 ta bo‘lsa compact render qilinsin
- telefon/Mini App layoutini buzma; tablet va barcha desktop-class breakpointlarda responsive qil
- mavjud UStorE/Mini App design language’dan chiqma
