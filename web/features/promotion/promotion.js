import { createProductCard } from '../product/card.js';

const money = (value) => `${Number(value || 0).toLocaleString('uz-UZ')} so‘m`;

export function promotionProducts(promotion, products = []) {
  const productIds = new Set((promotion?.productIds || []).map(String));
  const categoryIds = new Set((promotion?.categoryIds || []).map(String));
  if (!productIds.size && !categoryIds.size) return [];
  return (Array.isArray(products) ? products : []).filter((product) =>
    product?.is_visible !== false && product?.status !== 'DELETED'
    && (productIds.has(String(product.id)) || categoryIds.has(String(product.category_id))));
}

function node(doc, tag, value = '', className = '') {
  const element = doc.createElement(tag);
  element.textContent = String(value);
  element.className = className;
  return element;
}

function action(doc, label, onClick, className = '') {
  const button = node(doc, 'button', label, className);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function date(value) {
  if (!value) return 'Cheklovsiz';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Cheklovsiz' : parsed.toLocaleDateString('uz-UZ');
}

export function createPromotionView({ promotion, products = [], onCopy, onOpenCatalog, onOpenProduct, onAddProduct, onFavorite, favoriteIds = new Set(), canManage = false, onPin, onEdit, onVisibility, onDuplicate, onTrash } = {}, documentRef = globalThis.document) {
  if (!documentRef?.createElement || !promotion) throw new TypeError('Aksiya ma’lumoti va DOM kerak');
  const doc = documentRef;
  const root = node(doc, 'section', '', 'uw-promotion');
  root.dataset.feature = 'promotion';
  const hero = node(doc, 'div', '', 'uw-promotion__hero');
  hero.append(node(doc, 'span', 'Promo taklif', 'uw-promotion__eyebrow'));
  hero.append(node(doc, 'h1', promotion.name || 'Aksiya'));
  const discount = promotion.discountType === 'PERCENT'
    ? `${Number(promotion.discountValue || 0)}% chegirma`
    : `${money(promotion.discountValue)} chegirma`;
  hero.append(node(doc, 'strong', discount, 'uw-promotion__discount'));
  if (promotion.endsAt) hero.append(node(doc, 'span', `Tugaydi: ${date(promotion.endsAt)}`, 'uw-promotion__date'));
  root.append(hero);

  if (promotion.code) {
    const code = node(doc, 'div', '', 'uw-promotion__code');
    const value = node(doc, 'div');
    value.append(node(doc, 'small', 'Promo-kod'), node(doc, 'strong', promotion.code));
    code.append(value, action(doc, 'Nusxalash', () => onCopy?.(promotion.code), 'uw-promotion__copy'));
    root.append(code);
  }
  const facts = node(doc, 'dl', '', 'uw-promotion__facts');
  const addFact = (term, value) => {
    const row = node(doc, 'div', '', 'uw-promotion__fact');
    row.append(node(doc, 'dt', term), node(doc, 'dd', value));
    facts.append(row);
  };
  addFact('Amal qilish muddati', `${date(promotion.startsAt)} — ${date(promotion.endsAt)}`);
  addFact('Minimal summa', promotion.minOrderAmount ? money(promotion.minOrderAmount) : 'Cheklovsiz');
  addFact('Maksimal summa', promotion.maxOrderAmount ? money(promotion.maxOrderAmount) : 'Cheklovsiz');
  addFact('Qolgan foydalanish', promotion.usageLimit == null ? 'Cheksiz' : `${Math.max(0, Number(promotion.usageLimit) - Number(promotion.usedCount || 0))} ta`);
  addFact('Kim ishlata oladi', promotion.newCustomerOnly ? 'Faqat yangi mijozlar' : 'Barcha mijozlar');
  root.append(facts);

  const applicable = promotionProducts(promotion, products);
  if (applicable.length) {
    const section = node(doc, 'section', '', 'uw-promotion__products');
    section.append(node(doc, 'h2', `Mahsulotlar (${applicable.length})`, 'uw-section-title'));
    const grid = node(doc, 'div', '', 'uw-product-grid');
    applicable.forEach((product, index) => grid.append(createProductCard(product, {
      index, onOpen: onOpenProduct, onAdd: onAddProduct, onFavorite,
      isFavorite: favoriteIds.has(String(product.id)), canManage,
      onPin, onEdit, onVisibility, onDuplicate, onTrash,
    }, doc)));
    section.append(grid); root.append(section);
  }
  root.append(action(doc, 'Katalogga o‘tish', () => onOpenCatalog?.(), 'uw-promotion__catalog'));
  return { element: root };
}

export function createPromotionsView({ bundles = [], promotions = [], onOpenBundle, onOpenPromotion } = {}, documentRef = globalThis.document) {
  if (!documentRef?.createElement) throw new TypeError('DOM kerak');
  const doc = documentRef;
  const root = node(doc, 'section', '', 'uw-promotions');
  root.append(node(doc, 'h1', 'Aksiyalar va promo-kodlar'));
  if (!bundles.length && !promotions.length) {
    root.append(node(doc, 'p', 'Hozircha faol taklif yo‘q.', 'uw-promotions__empty'));
    return { element: root };
  }
  const addSection = (title, items, render) => {
    if (!items.length) return;
    const section = node(doc, 'section', '', 'uw-promotions__section');
    section.append(node(doc, 'h2', title, 'uw-section-title'));
    const list = node(doc, 'div', '', 'uw-promotions__list');
    items.forEach((item) => list.append(render(item)));
    section.append(list); root.append(section);
  };
  addSection('Aksiya to‘plamlari', bundles, (bundle) => {
    const card = action(doc, '', () => onOpenBundle?.(bundle), 'uw-promotions__card');
    card.append(node(doc, 'strong', bundle.name || 'Aksiya'));
    card.append(node(doc, 'span', `Aksiya narxi: ${money(bundle.bundlePrice)}`));
    if (bundle.savings > 0) card.append(node(doc, 'small', `Tejaysiz: ${money(bundle.savings)}`));
    return card;
  });
  addSection('Promo-kodlar va kuponlar', promotions, (promotion) => {
    const card = action(doc, '', () => onOpenPromotion?.(promotion), 'uw-promotions__card');
    card.append(node(doc, 'strong', promotion.name || 'Promo-kod'));
    card.append(node(doc, 'span', promotion.discountType === 'PERCENT' ? `${promotion.discountValue}% chegirma` : `${money(promotion.discountValue)} chegirma`));
    if (promotion.code) card.append(node(doc, 'small', `Kod: ${promotion.code}`));
    return card;
  });
  return { element: root };
}
