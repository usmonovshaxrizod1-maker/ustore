# USTORE Category Icon Library — Codex Ready

## Tarkib
- `icons/` — 270 ta standalone scalable SVG
- `category-icons.svg` — 270 ta symbol saqlovchi bitta sprite
- `category-icons.json` — UZ/RU/EN nomlar va qidiruv aliaslari
- `manifests/` — phase bo‘yicha JSON
- `sprites/` — phase bo‘yicha sprite

## Integratsiya prinsipi
1. Kategoriya yaratishda default icon `folder` yoki mavjud default category icon bo‘lishi mumkin.
2. `Almashtirish` bosilganda searchable picker ochiladi.
3. Qidiruv `search_terms` / aliases orqali ishlaydi.
4. Tanlangan icon ID kategoriya recordida saqlanadi.
5. Rang alohida token/preset sifatida saqlanadi; SVG assetni ko‘paytirib yubormang.
6. SVG `currentColor`dan foydalanadi.
7. Icon o‘lchamini SVG ichida hardcode qilmang. UI container CSS orqali boshqarsin.

## Responsive
- 1–4 kategoriya: katta icon
- 5–8: medium
- 9–20: compact
- 20+: compact grid
- Telefon layouti mavjud Mini App talabiga ko‘ra saqlanadi.
- Tablet/small laptop/desktop/large desktop responsive bo‘lishi kerak.

## Muhim
Bu asset library. Category picker / DB migration / storefront renderingni Codex repositorydagi mavjud category tizimiga ulaydi. Eski ishlaydigan category subsystemni qayta yozmang.
