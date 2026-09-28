import { createButton, createSelectField, createStatePanel, createTextField } from '../../components/ui.js';

function safeString(value) { return String(value ?? '').trim(); }
function safeMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
function money(value) { return `${new Intl.NumberFormat('uz-UZ').format(Math.round(safeMoney(value)))} so‘m`; }

export function normalizeCheckoutDraft(input = {}) {
  return {
    contactName: safeString(input.contactName),
    phone: safeString(input.phone),
    address: safeString(input.address),
    deliveryId: safeString(input.deliveryId),
    paymentMethod: safeString(input.paymentMethod),
    consent: input.consent === true,
  };
}

export function validateCheckoutDraft(input = {}) {
  const draft = normalizeCheckoutDraft(input);
  const fieldErrors = {};
  if (draft.contactName.length < 2) fieldErrors.contactName = 'Ismni kiriting.';
  if (!/^\+?[0-9 ()-]{7,20}$/.test(draft.phone)) fieldErrors.phone = 'Telefon raqamini tekshiring.';
  if (!draft.deliveryId) fieldErrors.deliveryId = 'Yetkazib berish usulini tanlang.';
  if (draft.deliveryId !== 'PICKUP' && draft.address.length < 5) fieldErrors.address = 'Yetkazib berish manzilini kiriting.';
  if (!draft.paymentMethod) fieldErrors.paymentMethod = 'To‘lov usulini tanlang.';
  if (!draft.consent) fieldErrors.consent = 'Buyurtma shartlariga rozilik kerak.';
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors, draft };
}

export function normalizeCheckoutQuote(value) {
  if (!value || typeof value !== 'object') return null;
  const deliveryOptions = Array.isArray(value.deliveryOptions) ? value.deliveryOptions.map((row) => ({
    id: safeString(row.id), label: safeString(row.label || row.id), price: safeMoney(row.price), available: row.available !== false,
  })).filter((row) => row.id) : [];
  const paymentMethods = Array.isArray(value.paymentMethods) ? value.paymentMethods.map((row) => ({
    id: safeString(row.id), label: safeString(row.label || row.id), available: row.available !== false,
  })).filter((row) => row.id) : [];
  return {
    ...value,
    subtotal: safeMoney(value.subtotal),
    discounts: safeMoney(value.discounts),
    delivery: safeMoney(value.delivery),
    total: safeMoney(value.total),
    deliveryOptions,
    paymentMethods,
    serverAuthoritative: value.serverAuthoritative === true,
  };
}

export function createCheckoutController({ cartPort, cart, initial = {} } = {}) {
  if (!cartPort?.quote) throw new TypeError('cartPort.quote kerak');
  if (!cart || !Array.isArray(cart.lines)) throw new TypeError('checkout uchun cart kerak');
  let state = {
    draft: normalizeCheckoutDraft(initial),
    quote: null,
    loadingQuote: false,
    error: null,
    fieldErrors: {},
  };
  const listeners = new Set();
  const snapshot = () => ({ ...state, draft: { ...state.draft }, quote: state.quote ? structuredClone(state.quote) : null, fieldErrors: { ...state.fieldErrors } });
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };

  async function refreshQuote() {
    if (state.loadingQuote) return null;
    set({ loadingQuote: true, error: null });
    const result = await cartPort.quote({
      cart,
      deliverySelection: state.draft.deliveryId ? { id: state.draft.deliveryId } : null,
    });
    if (!result.ok) {
      set({ loadingQuote: false, quote: null, error: result.error });
      return result;
    }
    const quote = normalizeCheckoutQuote(result.data);
    if (!quote?.serverAuthoritative) {
      const error = { code: 'CONTRACT_MISMATCH', message: 'Checkout hisobi server tomonidan tasdiqlanmagan.', retryable: false };
      set({ loadingQuote: false, quote: null, error });
      return { ok: false, error };
    }
    set({ loadingQuote: false, quote, error: null });
    return { ok: true, data: quote };
  }

  return Object.freeze({
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async load() { return refreshQuote(); },
    async setField(name, value) {
      if (!Object.prototype.hasOwnProperty.call(state.draft, name)) throw new Error(`Unknown checkout field: ${name}`);
      const draft = { ...state.draft, [name]: name === 'consent' ? value === true : String(value ?? '') };
      const fieldErrors = { ...state.fieldErrors }; delete fieldErrors[name];
      set({ draft, fieldErrors });
      if (name === 'deliveryId') return refreshQuote();
      return { ok: true, data: draft };
    },
    async refreshQuote() { return refreshQuote(); },
    validate() {
      const result = validateCheckoutDraft(state.draft);
      set({ fieldErrors: result.fieldErrors });
      return result;
    },
    buildCheckoutIntent() {
      const validation = validateCheckoutDraft(state.draft);
      set({ fieldErrors: validation.fieldErrors });
      if (!validation.valid) return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Checkout ma’lumotlarini tekshiring.', retryable: false, fieldErrors: validation.fieldErrors } };
      if (!state.quote?.serverAuthoritative) return { ok: false, error: { code: 'CONTRACT_MISMATCH', message: 'Server quote kerak.', retryable: true } };
      return { ok: true, data: { ...validation.draft, quoteSnapshot: { total: state.quote.total, currency: state.quote.currency || 'UZS' } } };
    },
  });
}

function getDocument(documentRef) {
  const doc = documentRef ?? globalThis.document;
  if (!doc?.createElement) throw new Error('Checkout UI uchun DOM kerak');
  return doc;
}

function createCheckbox(doc, { label, checked, onChange, error }) {
  const wrap = doc.createElement('label'); wrap.className = 'uw-checkout-consent';
  const input = doc.createElement('input'); input.type = 'checkbox'; input.checked = checked === true;
  input.addEventListener('change', () => onChange?.(input.checked));
  const text = doc.createElement('span'); text.textContent = label;
  wrap.append(input, text);
  const out = doc.createElement('div'); out.className = 'uw-checkout-consent-wrap'; out.append(wrap);
  if (error) { const e = doc.createElement('p'); e.className = 'uw-field__error'; e.textContent = error; out.append(e); }
  return out;
}

export function createCheckoutView({ controller, state = controller?.getState?.() || {} } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const draft = normalizeCheckoutDraft(state.draft);
  const quote = normalizeCheckoutQuote(state.quote);
  const errors = state.fieldErrors || {};
  const root = doc.createElement('section'); root.className = 'uw-checkout'; root.dataset.feature = 'checkout';
  const title = doc.createElement('h1'); title.textContent = 'Buyurtmani rasmiylashtirish'; root.append(title);

  if (state.error) {
    const kind = state.error.code === 'CONFLICT' ? 'error' : 'offline';
    root.append(createStatePanel({
      kind,
      title: state.error.code === 'CONFLICT' ? 'Narx yoki qoldiq o‘zgardi' : 'Hisobni yangilab bo‘lmadi',
      message: state.error.message || 'Qayta urinib ko‘ring.',
      actionLabel: state.error.retryable ? 'Qayta hisoblash' : '',
      onAction: state.error.retryable ? () => controller.refreshQuote() : undefined,
    }, doc));
  }

  const layout = doc.createElement('div'); layout.className = 'uw-checkout-layout';
  const form = doc.createElement('div'); form.className = 'uw-checkout-form';

  const contact = doc.createElement('section'); contact.className = 'uw-checkout-section';
  const contactTitle = doc.createElement('h2'); contactTitle.textContent = 'Kontakt'; contact.append(contactTitle);
  const name = createTextField({ label: 'Ism', value: draft.contactName, autocomplete: 'name', required: true, error: errors.contactName || '' }, doc);
  const phone = createTextField({ label: 'Telefon', value: draft.phone, type: 'tel', autocomplete: 'tel', inputMode: 'tel', required: true, error: errors.phone || '' }, doc);
  name.input.addEventListener('input', () => controller.setField('contactName', name.input.value));
  phone.input.addEventListener('input', () => controller.setField('phone', phone.input.value));
  contact.append(name.element, phone.element); form.append(contact);

  const delivery = doc.createElement('section'); delivery.className = 'uw-checkout-section';
  const deliveryTitle = doc.createElement('h2'); deliveryTitle.textContent = 'Yetkazib berish'; delivery.append(deliveryTitle);
  const deliveryOptions = (quote?.deliveryOptions || []).filter((row) => row.available).map((row) => ({ value: row.id, label: `${row.label}${row.price ? ` · ${money(row.price)}` : ' · bepul'}` }));
  deliveryOptions.unshift({ value: '', label: 'Tanlang' });
  const deliveryField = createSelectField({ label: 'Usul', value: draft.deliveryId, options: deliveryOptions, required: true, error: errors.deliveryId || '', disabled: state.loadingQuote && !quote }, doc);
  deliveryField.select.addEventListener('change', () => controller.setField('deliveryId', deliveryField.select.value));
  const address = createTextField({ label: 'Manzil', value: draft.address, autocomplete: 'street-address', required: draft.deliveryId !== 'PICKUP', error: errors.address || '', help: draft.deliveryId === 'PICKUP' ? 'Olib ketishda manzil talab qilinmaydi.' : '' }, doc);
  address.input.addEventListener('input', () => controller.setField('address', address.input.value));
  delivery.append(deliveryField.element, address.element); form.append(delivery);

  const payment = doc.createElement('section'); payment.className = 'uw-checkout-section';
  const paymentTitle = doc.createElement('h2'); paymentTitle.textContent = 'To‘lov'; payment.append(paymentTitle);
  const paymentOptions = [{ value: '', label: 'Tanlang' }, ...(quote?.paymentMethods || []).filter((row) => row.available).map((row) => ({ value: row.id, label: row.label }))];
  const paymentField = createSelectField({ label: 'To‘lov usuli', value: draft.paymentMethod, options: paymentOptions, required: true, error: errors.paymentMethod || '' }, doc);
  paymentField.select.addEventListener('change', () => controller.setField('paymentMethod', paymentField.select.value));
  payment.append(paymentField.element); form.append(payment);

  form.append(createCheckbox(doc, {
    label: 'Buyurtma, yetkazib berish va qaytarish shartlariga roziman.',
    checked: draft.consent,
    error: errors.consent || '',
    onChange: (checked) => controller.setField('consent', checked),
  }));

  const summary = doc.createElement('aside'); summary.className = 'uw-checkout-summary';
  const summaryTitle = doc.createElement('h2'); summaryTitle.textContent = 'Server hisobi'; summary.append(summaryTitle);
  if (state.loadingQuote && !quote) {
    const loading = doc.createElement('p'); loading.textContent = 'Hisoblanmoqda…'; loading.setAttribute('role', 'status'); summary.append(loading);
  } else if (quote) {
    const dl = doc.createElement('dl'); dl.className = 'uw-checkout-totals';
    for (const [label, value] of [['Tovarlar', quote.subtotal], ['Chegirma', -quote.discounts], ['Yetkazib berish', quote.delivery], ['Jami', quote.total]]) {
      const dt = doc.createElement('dt'); dt.textContent = label;
      const dd = doc.createElement('dd'); dd.textContent = value < 0 ? `−${money(Math.abs(value))}` : money(value);
      dl.append(dt, dd);
    }
    summary.append(dl);
    const authority = doc.createElement('p'); authority.className = 'uw-checkout-authority'; authority.textContent = 'Jami summa server quote’dan olinadi. Brauzerdagi eski narx yakuniy hisob hisoblanmaydi.'; summary.append(authority);
  } else {
    const noQuote = doc.createElement('p'); noQuote.textContent = 'Yakuniy hisob hali olinmagan.'; summary.append(noQuote);
  }
  summary.append(createButton({ label: 'Davom etish', busy: state.loadingQuote, disabled: !quote || !!state.error, onClick: () => controller.validate() }, doc));

  layout.append(form, summary); root.append(layout);
  return { element: root, fields: { name: name.input, phone: phone.input, address: address.input, delivery: deliveryField.select, payment: paymentField.select } };
}
