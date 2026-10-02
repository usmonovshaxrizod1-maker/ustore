// USTORE — Xodimlar/Huquqlar tizimi: yagona permission katalogi + standart
// rollarning default huquqlari. Frontend (xodim/rol UI) shu ro'yxatning
// bir xil nusxasini ko'rsatadi — shu fayl ikkalasi uchun ham "haqiqat manbai".
//
// Granularlik qarori: spec har bir amal uchun alohida permission (masalan
// catalog.create/edit/delete/reorder/move/trash/restore — 7 tasi alohida)
// taklif qilgan edi, lekin bu round buni ATAYLAB yiriqroq guruhlarga
// birlashtiradi (masalan bitta "catalog.manage"). Sabab: 90+ ta mayda
// permission'ni har birini mos keladigan action'ga alohida ulash — bu
// round hajmini keskin oshiradi, real amaliyotda esa deyarli har doim
// "shu bo'limni boshqara oladimi yo'qmi" darajasidagi qaror kifoya qiladi.
// Faqat spec ANIQ talab qilgan "ko'rish vs tahrirlash alohida" tamoyili
// saqlanadi (masalan stock.view / stock.manage, orders.view / orders.manage).
// Kelajakda kerak bo'lsa, mavjud yiriq permission'lar ichidan yangi, torroq
// kalitlar ajratib chiqarish mumkin — bu QO'SHIMCHA, buzuvchi o'zgarish emas.
//
// Owner-only imkoniyatlar (shop o'chirish, egalikni topshirish, boshqa
// Owner tayinlash/o'chirish) bu ro'yxatda YO'Q — ular hech qachon
// requirePermission() orqali berilmaydi, alohida (isOwnerCapabilityAllowed
// uslubida) tekshiriladi, keyingi bosqichda.

export const PERMISSIONS = [
  "domains.manage",           // OWNER/system MANAGER automatic; lower staff may receive this explicitly
  "catalog.manage",           // kategoriya CRUD, tartiblash, ko'chirish
  "products.manage",          // mahsulot CRUD, ko'rinish, pin, bulk move/trash
  "products.import_export",   // Excel import/export, import tarixi
  "stock.view",                // Ombor holati, harakatlar tarixi
  "stock.manage",              // Kirim, qoldiqni o'zgartirish (bulk)
  "orders.view",                // Buyurtmalar ro'yxati/tafsilotlari
  "orders.manage",              // Holat/jo'natma o'zgartirish, chek tasdiqlash/rad etish, ichki izoh
  "customers.view",             // Mijozlar ro'yxati (aloqa ma'lumotlari bilan — pastga qarang)
  "customers.manage",           // Ogohlantirish, bloklash/blokdan chiqarish
  "support.manage",             // Murojaatlarni ko'rish/javob berish/yopish
  "reports.view",               // Dashboard/hisobotlar
  "marketing.manage",           // Promo-kod, banner, bosh sahifa kataloglari
  "shop.settings.manage",       // Do'kon ma'lumotlari, yetkazish/to'lov, dizayn, huquqiy hujjatlar
  "integrations.manage",        // Billz/Click ulanishi
  "staff.manage",                // Xodim taklif qilish/rollarni tayinlash (Owner-only amallar bundan mustasno)
  "staff.permissions.manage",    // Owner delegates per manager, never automatic
] as const;

export type Permission = typeof PERMISSIONS[number];

export function isValidPermission(v: unknown): v is Permission {
  return typeof v === "string" && (PERMISSIONS as readonly string[]).includes(v);
}

export const STANDARD_ROLES: Record<string, { nameUz: string; nameRu: string; permissions: Permission[] }> = {
  MANAGER: {
    nameUz: "Boshqaruvchi", nameRu: "Управляющий",
    permissions: ["domains.manage", "catalog.manage", "products.manage", "products.import_export", "stock.view", "stock.manage", "orders.view", "orders.manage", "customers.view", "customers.manage", "support.manage", "reports.view", "marketing.manage"],
  },
  SALES: {
    nameUz: "Sotuvchi", nameRu: "Продавец",
    permissions: ["orders.view", "orders.manage", "customers.view", "support.manage"],
  },
  WAREHOUSE: {
    nameUz: "Omborchi", nameRu: "Складовщик",
    // Shop takomillashtirish, 13-band: "products.manage" ATAYLAB yo'q —
    // omborchi faqat qoldiq (stock.manage: kirim/bulk o'zgartirish) bilan
    // ishlaydi, nom/narx/rasm/tavsif/discount TAHRIRLAY OLMAYDI (bular
    // edit_product_field'ning o'zi products.manage bilan gated, alohida
    // "stock.adjust" kaliti kerak emas edi — stock.manage allaqachon bu
    // ikkisini ajratib bergan ekan).
    permissions: ["stock.view", "stock.manage"],
  },
  CATALOG_MANAGER: {
    nameUz: "Katalog menejeri", nameRu: "Менеджер каталога",
    permissions: ["catalog.manage", "products.manage", "products.import_export"],
  },
  SUPPORT: {
    nameUz: "Support", nameRu: "Поддержка",
    permissions: ["support.manage", "orders.view", "customers.view"],
  },
  ACCOUNTANT: {
    nameUz: "Hisobchi", nameRu: "Бухгалтер",
    permissions: ["reports.view", "orders.view"],
  },
  VIEWER: {
    nameUz: "Kuzatuvchi", nameRu: "Наблюдатель",
    permissions: ["orders.view", "stock.view", "reports.view", "customers.view"],
  },
};
