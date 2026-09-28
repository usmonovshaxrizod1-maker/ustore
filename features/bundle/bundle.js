import { createButton, createStatePanel } from '../../components/ui.js';

function safeMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function money(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Math.round(safeMoney(value)))} so‘m`;
}

function bundleItems(bundle) {
  return Array.isArray(bundle?.resolvedItems) ? bundle.resolvedItems.filter(Boolean).slice(0, 6) : [];
}

export function bundleOptionLabel(bundle) {
  return bundleItems(bundle).map((item) => `${item.name || item.productId}${Number(item.qty) > 1 ? ` × ${Number(item.qty)}` : ''}`).join(' + ');
}

export function bundleCartLine(bundle, quantity = 1) {
  const bundleId = String(bundle?.id || '').trim();
  const qty = Math.trunc(Number(quantity));
  if (!bundleId || qty <= 0 || qty > 99) return null;
  return {
    bundleId,
    quantity: qty,
    name: String(bundle?.name || 'Aksiya to‘plami'),
    bundleName: String(bundle?.name || 'Aksiya to‘plami'),
    unitPrice: safeMoney(bundle?.bundlePrice),
    regularTotal: safeMoney(bundle?.regularTotal),
    savings: safeMoney(bundle?.savings),
    imageUrl: bundle?.coverImageUrl || bundleItems(bundle).find((item) => item.img)?.img || '',
    optionLabel: bundleOptionLabel(bundle),
  };
}

export function createBundleDetailController({ catalogPort, bundleId, onAddToCart } = {}) {
  if (!catalogPort?.getBundle) throw new TypeError('catalogPort.getBundle kerak');
  if (!bundleId) throw new TypeError('bundleId kerak');
  let bundle = null;
  return Object.freeze({
    getBundle: () => bundle,
    async load() {
      const result = await catalogPort.getBundle({ bundleId });
      if (result.ok) bundle = result.data;
      return result;
    },
    async addToCart() {
      const line = bundleCartLine(bundle);
      if (!line) return { ok:false, error:{ code:'VALIDATION_ERROR', message:'Aksiya savatga qo‘shishga tayyor emas.', retryable:false } };
      const result = await onAddToCart?.(line);
      return result?.ok === false ? result : { ok:true, data:{ line } };
    },
  });
}

export function createBundleCollage(bundle, documentRef = globalThis.document) {
  const doc = documentRef;
  const collage = doc.createElement('div'); collage.className = 'uw-bundle-collage';
  const items = bundleItems(bundle);
  for (const item of items) {
    const tile = doc.createElement('div'); tile.className = 'uw-bundle-collage__tile';
    if (item.img) {
      const image = doc.createElement('img'); image.src = item.img; image.alt = ''; image.width = 240; image.height = 240;
      image.loading = 'lazy'; image.decoding = 'async'; image.fetchPriority = 'low'; image.referrerPolicy = 'no-referrer';
      tile.append(image);
    } else {
      const fallback = doc.createElement('span'); fallback.textContent = String(item.name || '?').slice(0, 1).toLocaleUpperCase('uz-UZ');
      fallback.setAttribute('aria-hidden', 'true'); tile.append(fallback);
    }
    collage.append(tile);
  }
  return collage;
}

export function createBundleDetailView({ bundle, adding = false, onAddToCart } = {}, documentRef = globalThis.document) {
  if (!documentRef?.createElement) throw new Error('Bundle UI uchun DOM kerak');
  const doc = documentRef;
  const root = doc.createElement('section'); root.className = 'uw-bundle-detail'; root.dataset.feature = 'bundle-detail';
  if (!bundle) {
    root.append(createStatePanel({ kind:'error', title:'Aksiya topilmadi', message:'Bu aksiya hozir mavjud emas.' }, doc));
    return { element:root };
  }
  const media = createBundleCollage(bundle, doc); media.className += ' uw-bundle-detail__media';
  const content = doc.createElement('div'); content.className = 'uw-bundle-detail__content';
  const badge = doc.createElement('span'); badge.className = 'uw-bundle-badge'; badge.textContent = 'Aksiya to‘plami';
  const title = doc.createElement('h1'); title.textContent = bundle.name || 'Aksiya';
  content.append(badge, title);
  if (bundle.description) { const description = doc.createElement('p'); description.className = 'uw-bundle-detail__description'; description.textContent = bundle.description; content.append(description); }
  const price = doc.createElement('div'); price.className = 'uw-bundle-price';
  const current = doc.createElement('strong'); current.textContent = money(bundle.bundlePrice); price.append(current);
  if (safeMoney(bundle.regularTotal) > safeMoney(bundle.bundlePrice)) {
    const regular = doc.createElement('s'); regular.textContent = money(bundle.regularTotal);
    const saving = doc.createElement('span'); saving.textContent = `${money(bundle.savings)} tejaysiz`;
    price.append(regular, saving);
  }
  content.append(price);
  const composition = doc.createElement('section'); composition.className = 'uw-bundle-composition';
  const compositionTitle = doc.createElement('h2'); compositionTitle.textContent = 'To‘plam tarkibi'; composition.append(compositionTitle);
  const list = doc.createElement('ul');
  for (const item of bundleItems(bundle)) {
    const row = doc.createElement('li');
    const name = doc.createElement('span'); name.textContent = item.name || item.productId || 'Mahsulot';
    const qty = doc.createElement('strong'); qty.textContent = `${Math.max(1, Number(item.qty) || 1)} dona`;
    row.append(name, qty); list.append(row);
  }
  composition.append(list); content.append(composition);
  content.append(createButton({ label:adding ? 'Qo‘shilmoqda…' : 'To‘plamni savatga qo‘shish', size:'lg', busy:adding, disabled:adding, onClick:onAddToCart }, doc));
  root.append(media, content);
  return { element:root };
}
