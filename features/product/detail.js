import { createButton, createStatePanel } from '../../components/ui.js';
import { colorGroupsForProduct, createVariantSelection, productVariants } from './variant-model.js';

function money(value) { return `${Number(value || 0).toLocaleString('uz-UZ')} so‘m`; }

export function buildProductGallery(product) {
  const images = [];
  const push = (src, color = null) => {
    if (!src || images.some((item) => item.src === src)) return;
    images.push({ src, color });
  };
  push(product?.img, null);
  for (const group of colorGroupsForProduct(product)) push(group.img, group.name);
  return images;
}

export function createProductDetailController({ catalogPort, productId, onAddToCart } = {}) {
  if (!catalogPort) throw new TypeError('catalogPort kerak');
  let product = null;
  let selection = null;
  return {
    async load() {
      const result = await catalogPort.getProduct({ productId });
      if (!result.ok) return result;
      product = result.data;
      selection = createVariantSelection(product);
      return { ok: true, data: { product, selection: selection.getState(), gallery: buildProductGallery(product) } };
    },
    getProduct: () => product,
    getSelection: () => selection?.getState() || null,
    selectColor(color) { if (!selection) throw new Error('Product not loaded'); return selection.selectColor(color); },
    selectSize(size) { if (!selection) throw new Error('Product not loaded'); return selection.selectSize(size); },
    addToCart() {
      if (!product || !selection) throw new Error('Product not loaded');
      const selected = selection.getState();
      if (!selected.canAdd) return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Tanlangan kombinatsiya mavjud emas.', retryable: false } };
      const line = {
        productId: product.id, size: selected.size, color: selected.color, quantity: 1, sku: selected.sku,
        name: product.name, unitPrice: selected.price, imageUrl: selected.image || product.img || null,
        optionLabel: [selected.color, selected.size].filter(Boolean).join(' · '),
        ...(selected.variant?.id ? { variantId: selected.variant.id } : {}),
      };
      const added = onAddToCart?.(line);
      if (added && typeof added.then === 'function') return added.then((result) => result?.ok === false ? result : { ok: true, data: result?.data || line });
      if (added?.ok === false) return added;
      return { ok: true, data: added?.data || line };
    },
  };
}

export function createProductDetailView({ product, selection, gallery = buildProductGallery(product), onSelectColor, onSelectSize, onAddToCart, onShare, adding = false } = {}, documentRef = globalThis.document) {
  if (!documentRef?.createElement) throw new Error('Product detail UI uchun DOM kerak');
  const doc = documentRef;
  const root = doc.createElement('article'); root.className = 'uw-product-detail'; root.dataset.feature = 'product-detail';
  if (!product) { root.append(createStatePanel({ kind: 'error', title: 'Mahsulot topilmadi', message: 'Mahsulot ma’lumotlarini yuklab bo‘lmadi.' }, doc)); return { element: root }; }
  const current = selection || createVariantSelection(product).getState();

  const galleryBox = doc.createElement('section'); galleryBox.className = 'uw-product-gallery'; galleryBox.setAttribute('aria-label', 'Mahsulot rasmlari');
  const mainImage = doc.createElement('img'); mainImage.className = 'uw-product-gallery__main'; mainImage.src = current.image || gallery[0]?.src || ''; mainImage.alt = product.name || ''; mainImage.width = 800; mainImage.height = 800; mainImage.loading = 'eager'; mainImage.decoding = 'async'; mainImage.fetchPriority = 'high'; mainImage.referrerPolicy = 'no-referrer';
  const noImage = doc.createElement('div'); noImage.className = 'uw-product-no-image'; noImage.textContent = 'Rasm mavjud emas'; noImage.hidden = Boolean(mainImage.src);
  mainImage.hidden = !mainImage.src;
  mainImage.addEventListener('error', () => { mainImage.dataset.imageError = 'true'; mainImage.hidden = true; noImage.hidden = false; });
  const thumbs = doc.createElement('div'); thumbs.className = 'uw-product-gallery__thumbs';
  for (const image of gallery) { const button = doc.createElement('button'); button.type = 'button'; button.className = 'uw-product-gallery__thumb'; button.dataset.src = image.src; const img = doc.createElement('img'); img.src = image.src; img.alt = image.color ? `${image.color} rasmi` : product.name; img.width = 96; img.height = 96; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; button.append(img); button.addEventListener('click', () => { mainImage.src = image.src; mainImage.hidden = false; noImage.hidden = true; }); thumbs.append(button); }
  const zoom = createButton({ label: 'Rasmni kattalashtirish', variant: 'ghost', onClick: () => { galleryBox.dataset.zoom = galleryBox.dataset.zoom === 'true' ? 'false' : 'true'; } }, doc);
  galleryBox.append(mainImage, noImage, thumbs, zoom);

  const info = doc.createElement('section'); info.className = 'uw-product-detail__info';
  const title = doc.createElement('h1'); title.textContent = product.name; title.className = 'uw-product-detail__title';
  const sku = doc.createElement('p'); sku.className = 'uw-product-detail__sku'; sku.textContent = current.sku ? `SKU: ${current.sku}` : '';
  const price = doc.createElement('div'); price.className = 'uw-product-detail__price'; price.dataset.currentPrice = String(current.price); price.textContent = money(current.price);
  if (current.oldPrice > current.price) { const old = doc.createElement('s'); old.className = 'uw-product-detail__old-price'; old.textContent = money(current.oldPrice); price.append(old); }
  const stock = doc.createElement('p'); stock.className = 'uw-product-detail__stock'; stock.dataset.stock = String(current.stock); stock.textContent = current.stock > 0 ? `Qoldiq: ${current.stock}` : 'Qoldiq tugagan';
  info.append(title, sku, price, stock);

  const variants = productVariants(product);
  if (variants.length) {
    const colors = colorGroupsForProduct(product);
    const colorWrap = doc.createElement('div'); colorWrap.className = 'uw-product-options'; colorWrap.append(Object.assign(doc.createElement('p'), { textContent: 'Rang' }));
    for (const group of colors) { const button = createButton({ label: group.name, variant: current.color === group.name ? 'primary' : 'secondary', onClick: () => onSelectColor?.(group.name) }, doc); button.dataset.color = group.name; colorWrap.append(button); }
    info.append(colorWrap);
    const sizes = [...new Set(variants.filter((variant) => variant.color === current.color).map((variant) => variant.size).filter(Boolean))];
    const sizeWrap = doc.createElement('div'); sizeWrap.className = 'uw-product-options'; sizeWrap.append(Object.assign(doc.createElement('p'), { textContent: 'O‘lcham' }));
    for (const sizeValue of sizes) { const variant = variants.find((item) => item.color === current.color && item.size === sizeValue); const button = createButton({ label: sizeValue, variant: current.size === sizeValue ? 'primary' : 'secondary', disabled: Number(variant?.qty ?? variant?.stock) <= 0, onClick: () => onSelectSize?.(sizeValue) }, doc); button.dataset.size = sizeValue; sizeWrap.append(button); }
    info.append(sizeWrap);
  }
  const actions = doc.createElement('div'); actions.className = 'uw-product-detail__actions';
  const add = createButton({ label: current.canAdd ? (adding ? 'Savatga qo‘shilmoqda' : 'Savatga qo‘shish') : 'Mavjud emas', disabled: !current.canAdd, busy: adding, onClick: onAddToCart }, doc); add.className += ' uw-product-detail__add';
  actions.append(add);
  if (typeof onShare === 'function') {
    const shareStatus = doc.createElement('span'); shareStatus.className = 'uw-product-detail__share-status'; shareStatus.setAttribute('role', 'status'); shareStatus.setAttribute('aria-live', 'polite');
    const share = createButton({ label: 'Ulashish', variant: 'secondary', onClick: async () => {
      const result = await onShare();
      shareStatus.textContent = result?.ok ? (result.data?.method === 'clipboard' ? 'Havola nusxalandi.' : 'Ulashildi.') : (result?.error?.code === 'CANCELLED' ? '' : (result?.error?.message || 'Ulashib bo‘lmadi.'));
    } }, doc);
    share.className += ' uw-product-detail__share'; actions.append(share, shareStatus);
  }
  info.append(actions);
  root.append(galleryBox, info);
  return { element: root, mainImage };
}
