import { canonicalFallbackVariant, defaultVariantSelection, productVariants, variantDisplayImage, variantOldPrice, variantPrice } from './variant-model.js';

const BADGES = Object.freeze({ NEW: 'Yangi', TOP: 'Top', RECOMMENDED: 'Tavsiya', PROMO: 'Aksiya' });
const money = (value) => `${Number(value || 0).toLocaleString('uz-UZ')} so‘m`;

export function productCardModel(product = {}) {
  const variants = productVariants(product);
  const selected = variants.length ? (defaultVariantSelection(product).variant || canonicalFallbackVariant(product) || variants[0]) : null;
  const image = selected
    ? variantDisplayImage(product, selected.size, selected.color)
    : (product.thumb_img || product.thumbImg || product.img || '');
  const fullImage = selected ? image : (product.img || image);
  const price = selected ? variantPrice(product, selected.size, selected.color) : Number(product.price) || 0;
  const oldPrice = selected ? variantOldPrice(product, selected.size, selected.color) : Number(product.old_price ?? product.oldPrice) || 0;
  const stock = variants.length
    ? variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.qty ?? variant.stock) || 0), 0)
    : Math.max(0, Number(product.stock) || 0);
  return {
    image, fullImage, price, oldPrice, stock, hasVariants: variants.length > 0,
    discount: oldPrice > price && price >= 0 ? Math.round((1 - price / oldPrice) * 100) : 0,
    sizes: [...new Set(variants.map((item) => item.size).filter(Boolean))],
    colors: [...new Set(variants.map((item) => item.color).filter(Boolean))],
    badge: BADGES[product.badge] || '',
  };
}

function node(doc, tag, className = '', value = null) {
  const item = doc.createElement(tag);
  item.className = className;
  if (value != null) item.textContent = String(value);
  return item;
}

function button(doc, label, className, onClick) {
  const item = node(doc, 'button', className, label);
  item.type = 'button';
  item.setAttribute('aria-label', label);
  if (onClick) item.addEventListener('click', onClick);
  return item;
}

export function createProductCard(product, {
  index = 0, onOpen, onAdd, onFavorite, isFavorite = false,
  canManage = false, onPin, onEdit, onVisibility, onDuplicate, onTrash,
} = {}, documentRef = globalThis.document) {
  const doc = documentRef;
  if (!doc?.createElement) throw new Error('Mahsulot kartasi uchun DOM kerak');
  const data = productCardModel(product);
  const card = node(doc, 'article', 'uw-product-tile uw-store-product-card');
  card.dataset.productId = String(product.id || '');

  const media = node(doc, 'div', 'uw-store-product-card__media');
  const openImage = button(doc, `${product.name || 'Mahsulot'} batafsil`, 'uw-store-product-card__image-action', () => onOpen?.(product));
  if (data.image) {
    const image = node(doc, 'img', 'uw-store-product-card__image');
    image.src = data.image;
    image.alt = product.name || 'Mahsulot rasmi';
    image.width = 400; image.height = 400;
    image.loading = index < 6 ? 'eager' : 'lazy';
    image.fetchPriority = index < 2 ? 'high' : 'auto';
    image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    const fallback = node(doc, 'span', 'uw-store-product-card__image-fallback', 'Rasm mavjud emas');
    fallback.hidden = true;
    image.addEventListener('error', () => {
      if (data.fullImage && image.src !== data.fullImage) { image.src = data.fullImage; return; }
      image.hidden = true; fallback.hidden = false;
    });
    openImage.append(image, fallback);
  } else openImage.append(node(doc, 'span', 'uw-store-product-card__image-fallback', 'Rasm mavjud emas'));
  media.append(openImage);

  if (data.badge) media.append(node(doc, 'span', 'uw-store-product-card__badge', data.badge));
  if (canManage) {
    const controls = node(doc, 'div', 'uw-store-product-card__media-actions');
    if (onPin) { const pin = button(doc, product.is_featured ? 'Pinni olib tashlash' : 'Pin qilish', 'uw-store-product-card__icon', async () => {
      pin.disabled = true;
      try {
        const next = !product.is_featured;
        const result = await onPin(product, next);
        if (result?.ok !== false) { product.is_featured = next; pin.dataset.active = next ? 'true' : 'false'; pin.setAttribute('aria-label', next ? 'Pinni olib tashlash' : 'Pin qilish'); }
      } finally { pin.disabled = false; }
    }); pin.dataset.active = product.is_featured ? 'true' : 'false'; pin.textContent = '📌'; controls.append(pin); }
    if (onVisibility) { const eye = button(doc, 'Ko‘rinishni almashtirish', 'uw-store-product-card__icon', async () => {
      eye.disabled = true;
      try { const result = await onVisibility(product, false); if (result?.ok !== false) card.remove?.(); }
      finally { eye.disabled = false; }
    }); eye.textContent = '◉'; controls.append(eye); }
    if (onEdit) {
      const more = button(doc, 'Qo‘shimcha amallar', 'uw-store-product-card__icon', () => { menu.hidden = !menu.hidden; });
      more.textContent = '⋮'; controls.append(more);
      const menu = node(doc, 'div', 'uw-store-product-card__menu'); menu.hidden = true;
      menu.append(button(doc, 'Tahrirlash', 'uw-store-product-card__menu-item', () => onEdit(product)));
      if (onDuplicate) menu.append(button(doc, 'Nusxalash', 'uw-store-product-card__menu-item', () => { menu.hidden = true; onDuplicate(product); }));
      if (onTrash) menu.append(button(doc, 'Chiqindiga o‘tkazish', 'uw-store-product-card__menu-item', async () => {
        menu.hidden = true;
        const result = await onTrash(product);
        if (result?.ok) card.remove?.();
      }));
      media.append(menu);
    }
    media.append(controls);
  } else if (onFavorite) {
    const favorite = button(doc, isFavorite ? 'Sevimlilardan olish' : 'Sevimlilarga qo‘shish', 'uw-store-product-card__favorite', async () => {
      favorite.disabled = true;
      try {
        const result = await onFavorite(product, !isFavorite);
        if (result?.ok !== false) {
          isFavorite = !isFavorite;
          favorite.textContent = isFavorite ? '♥' : '♡';
          favorite.setAttribute('aria-label', isFavorite ? 'Sevimlilardan olish' : 'Sevimlilarga qo‘shish');
          favorite.dataset.active = isFavorite ? 'true' : 'false';
        }
      } finally { favorite.disabled = false; }
    });
    favorite.textContent = isFavorite ? '♥' : '♡';
    favorite.dataset.active = isFavorite ? 'true' : 'false';
    media.append(favorite);
  }

  const body = node(doc, 'div', 'uw-store-product-card__body');
  if (canManage && product.sku) body.append(node(doc, 'span', 'uw-store-product-card__sku', product.sku));
  body.append(button(doc, product.name || 'Mahsulot', 'uw-store-product-card__title', () => onOpen?.(product)));
  const price = node(doc, 'div', 'uw-store-product-card__price');
  price.append(node(doc, 'strong', data.discount ? 'uw-store-product-card__price-sale' : '', money(data.price)));
  if (data.discount) {
    price.append(node(doc, 'span', 'uw-store-product-card__discount', `-${data.discount}%`));
    price.append(node(doc, 's', 'uw-store-product-card__old-price', money(data.oldPrice)));
  }
  body.append(price);
  if (data.sizes.length) body.append(node(doc, 'small', 'uw-store-product-card__variant', `O‘lcham: ${data.sizes.join(', ')}`));
  if (data.colors.length) body.append(node(doc, 'small', 'uw-store-product-card__variant', `Rang: ${data.colors.join(', ')}`));
  if (!data.stock) body.append(node(doc, 'span', 'uw-store-product-card__stock', 'Tugagan'));
  if (!canManage || onAdd) {
    const action = button(doc, data.hasVariants ? 'Variant tanlash' : data.stock ? 'Savatga qo‘shish' : 'Mahsulotni ko‘rish', 'uw-store-product-card__add', () => {
      if (data.hasVariants || !data.stock || !onAdd) onOpen?.(product);
      else onAdd(product);
    });
    body.append(action);
  }
  card.append(media, body);
  return card;
}
