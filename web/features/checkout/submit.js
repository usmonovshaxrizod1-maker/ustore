import { createButton, createStatePanel } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

const DEFAULT_INTENT_KEY = 'ustore:web:checkout-submit:v1';

function safeString(value) { return String(value ?? '').trim(); }
function clone(value) { return value == null ? value : structuredClone(value); }
function randomKey(prefix = 'intent') {
  const id = globalThis.crypto?.randomUUID?.();
  if (id) return `${prefix}:${id}`;
  const bytes = new Uint8Array(24);
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure idempotency key generator unavailable');
  globalThis.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  if (!token) throw new Error('Secure idempotency key generator unavailable');
  return `${prefix}:${token}`;
}

export function createCheckoutIntentStore(storage = globalThis.sessionStorage, key = DEFAULT_INTENT_KEY) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    let memory = null;
    return Object.freeze({ get: () => clone(memory), set: (value) => { memory = clone(value); }, clear: () => { memory = null; } });
  }
  return Object.freeze({
    get() { try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; } },
    set(value) { storage.setItem(key, JSON.stringify(value)); },
    clear() { storage.removeItem(key); },
  });
}

export function createCheckoutSubmitController({
  ordersPort,
  paymentsPort,
  checkoutIntent,
  intentStore = createCheckoutIntentStore(),
  makeKey = randomKey,
} = {}) {
  if (!ordersPort?.create) throw new TypeError('ordersPort.create kerak');
  if (!paymentsPort?.start || !paymentsPort?.getStatus) throw new TypeError('paymentsPort kerak');
  if (!checkoutIntent || typeof checkoutIntent !== 'object') throw new TypeError('checkoutIntent kerak');

  checkoutIntent = clone(checkoutIntent);
  const saved = intentStore.get() || {};
  const persisted = saved.status === 'success' ? {} : saved;
  const intentFingerprint = JSON.stringify(checkoutIntent);
  const intentConflict = !!persisted.intentFingerprint && persisted.intentFingerprint !== intentFingerprint;
  let state = {
    status: intentConflict ? 'intent-conflict' : persisted.status || 'idle',
    order: persisted.order || null,
    payment: persisted.payment || null,
    error: intentConflict ? {code:'CONFLICT',message:'Avvalgi buyurtma hali yakunlanmagan. Buyurtmalar bo‘limida uning holatini tekshiring.',retryable:false} : null,
    idempotencyKey: persisted.idempotencyKey || null,
    paymentIdempotencyKey: persisted.paymentIdempotencyKey || null,
  };
  let inFlight = null;
  const listeners = new Set();
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const persist = () => intentStore.set({
    intentFingerprint,
    status: state.status,
    order: state.order,
    payment: state.payment,
    idempotencyKey: state.idempotencyKey,
    paymentIdempotencyKey: state.paymentIdempotencyKey,
  });
  const set = (patch, { save = true } = {}) => { state = { ...state, ...patch }; if (save) persist(); emit(); return snapshot(); };

  async function createOrRecoverOrder() {
    if (state.order?.id) return ok(state.order);
    const idempotencyKey = state.idempotencyKey || makeKey('order');
    if (!state.idempotencyKey) set({ idempotencyKey, status: 'submitting', error: null });
    else set({ status: 'submitting', error: null });
    const result = await ordersPort.create({ checkout: checkoutIntent, idempotencyKey });
    if (!result.ok) {
      const unknown = result.error?.code === 'NETWORK_ERROR' || result.error?.code === 'CONTRACT_MISMATCH';
      set({ status: unknown ? 'unknown' : 'error', error: result.error });
      return result;
    }
    const order = result.data;
    if (!order?.id) {
      const error = { code: 'CONTRACT_MISMATCH', message: 'Server buyurtma identifikatorini qaytarmadi.', retryable: true };
      set({ status: 'unknown', error });
      return { ok: false, error };
    }
    set({ status: 'order-created', order, error: null });
    return ok(order);
  }

  async function startPayment(order) {
    const method = safeString(checkoutIntent.paymentMethod);
    if (!method || method === 'CASH' || method === 'CASH_ON_DELIVERY') {
      set({ status: 'success', payment: null, error: null });
      return ok({ order, payment: null, redirectUrl: null });
    }
    const paymentIdempotencyKey = state.paymentIdempotencyKey || makeKey('payment');
    if (!state.paymentIdempotencyKey) set({ paymentIdempotencyKey });
    set({ status: 'payment-starting', error: null });
    const result = await paymentsPort.start({ orderId: order.id, method, idempotencyKey: paymentIdempotencyKey });
    if (!result.ok) {
      set({ status: ['NETWORK_ERROR','CONTRACT_MISMATCH'].includes(result.error?.code) ? 'payment-unknown' : 'payment-error', error: result.error });
      return result;
    }
    const payment = result.data;
    const rawStatus = safeString(payment?.status).toUpperCase();
    if (!['PAID','PENDING','CREATED','PROCESSING','FAILED','CANCELLED'].includes(rawStatus)) {
      const error = {code:'CONTRACT_MISMATCH',message:'To‘lov javobi tasdiqlanmadi. Holatini tekshiring.',retryable:true};
      set({status:'payment-unknown',error}); return {ok:false,error};
    }
    if (['FAILED','CANCELLED'].includes(rawStatus)) {
      const error={code:'CONFLICT',message:'To‘lov amalga oshmadi.',retryable:false};
      set({status:'payment-error',payment,error}); return {ok:false,error};
    }
    if (rawStatus === 'PROCESSING' || payment?.recoveryRequired === true) {
      const error = { code: 'PAYMENT_RECONCILIATION_REQUIRED', message: 'To‘lov so‘rovi yuborildi, lekin yakuniy natija hali tasdiqlanmadi. Yangi to‘lov boshlanmaydi.', retryable: true };
      set({ status: 'payment-unknown', payment, error });
      return ok({ order, payment, redirectUrl: payment?.redirectUrl || null, recoveryRequired: true });
    }
    set({ status: rawStatus === 'PAID' ? 'success' : 'payment-pending', payment, error: null });
    return ok({ order, payment, redirectUrl: payment?.redirectUrl || null });
  }

  async function recoverPaymentStatusInternal() {
    if (!state.order?.id) return fail('CONFLICT', 'Tekshirish uchun buyurtma hali aniqlanmagan.');
    set({ status: 'payment-checking', error: null });
    const result = await paymentsPort.getStatus({ orderId: state.order.id });
    if (!result.ok) { set({ status: 'payment-unknown', error: result.error }); return result; }
    const payment = result.data || {};
    const raw = safeString(payment.status).toUpperCase();
    if (raw === 'PAID') { set({ status: 'success', payment, error: null }); return ok({ order: state.order, payment }); }
    if (raw === 'FAILED' || raw === 'CANCELLED') {
      const error = { code: 'CONFLICT', message: 'To‘lov server tomonidan muvaffaqiyatsiz deb tasdiqlandi.', retryable: false };
      set({ status: 'payment-error', payment, error }); return { ok: false, error };
    }
    const error = { code: 'PAYMENT_RECONCILIATION_REQUIRED', message: 'To‘lov holati hali yakuniy emas. Yangi to‘lov boshlanmaydi.', retryable: true };
    set({ status: 'payment-unknown', payment, error });
    return ok({ order: state.order, payment, recoveryRequired: true });
  }

  function runOnce(work) {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(work).catch(() => {
      const error = { code: 'NETWORK_ERROR', message: 'Amal natijasi aniqlanmadi. Shu buyurtma kaliti bilan qayta tekshiring.', retryable: true };
      // Preserve keys and known order even if persistence/transport throws.
      set({ status: state.paymentIdempotencyKey ? 'payment-unknown' : 'unknown', error }, { save: false });
      return { ok: false, error };
    }).finally(() => { inFlight = null; });
    return inFlight;
  }
  function recoverPaymentStatus() {
    if (state.status === 'intent-conflict') return Promise.resolve({ok:false,error:state.error});
    return runOnce(recoverPaymentStatusInternal);
  }
  function submit() {
    if (state.status === 'intent-conflict') return Promise.resolve({ok:false,error:state.error});
    return runOnce(async () => {
      if (state.status === 'success' || state.status === 'payment-pending') return ok({order:state.order,payment:state.payment,redirectUrl:state.payment?.redirectUrl || null});
      if (['payment-unknown','payment-checking','payment-starting'].includes(state.status)) return recoverPaymentStatusInternal();
      const orderResult = await createOrRecoverOrder();
      if (!orderResult.ok) return orderResult;
      return startPayment(orderResult.data);
    });
  }

  return Object.freeze({
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    submit,
    retry() { return state.status === 'payment-unknown' || state.status === 'payment-checking' ? recoverPaymentStatus() : submit(); },
    recoverPaymentStatus,
    reset() {
      if (inFlight || !['idle','success'].includes(state.status)) return fail('CONFLICT', 'Avval joriy buyurtma holatini aniqlang.');
      intentStore.clear(); state = { status: 'idle', order: null, payment: null, error: null, idempotencyKey: null, paymentIdempotencyKey: null }; emit(); return snapshot(); },
  });
}

export function createPaymentReturnController({ paymentsPort, orderId } = {}) {
  if (!paymentsPort?.getStatus) throw new TypeError('paymentsPort.getStatus kerak');
  if (!safeString(orderId)) throw new TypeError('orderId kerak');
  let state = { status: 'checking', payment: null, error: null };
  const listeners = new Set();
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };
  async function refresh() {
    set({ status: 'checking', error: null });
    const result = await paymentsPort.getStatus({ orderId });
    if (!result.ok) { set({ status: 'unknown', error: result.error }); return result; }
    const payment = result.data || {};
    const raw = safeString(payment.status).toUpperCase();
    const status = raw === 'PAID' ? 'paid' : raw === 'FAILED' || raw === 'CANCELLED' ? 'failed' : raw === 'PENDING' || raw === 'CREATED' || raw === 'PROCESSING' ? 'pending' : 'unknown';
    set({ status, payment, error: null });
    return ok({ status, payment });
  }
  return Object.freeze({ getState: snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, load: refresh, refresh });
}

function getDocument(documentRef) {
  const doc = documentRef ?? globalThis.document;
  if (!doc?.createElement) throw new Error('Submit UI uchun DOM kerak');
  return doc;
}

export function createCheckoutSubmitView({ controller, state = controller?.getState?.() || {}, onRedirect } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const root = doc.createElement('section'); root.className = 'uw-checkout-submit'; root.dataset.status = state.status || 'idle';
  const title = doc.createElement('h2'); title.textContent = 'Buyurtmani yuborish'; root.append(title);
  if (state.status === 'unknown') root.append(createStatePanel({ kind: 'warning', title: 'Natija aniq emas', message: 'Server javobi uzildi. Yangi buyurtma yaratmaymiz — aynan shu so‘rovni tekshirib qayta urinib ko‘ramiz.', actionLabel: 'Holatni qayta tekshirish', onAction: () => controller.retry() }, doc));
  else if (state.status === 'payment-unknown') root.append(createStatePanel({ kind: 'warning', title: 'To‘lov holati tekshirilmoqda', message: state.error?.message || 'Yangi to‘lov boshlanmaydi; serverdagi mavjud urinish holatini qayta tekshiramiz.', actionLabel: 'Holatni qayta tekshirish', onAction: () => controller.retry() }, doc));
  else if (state.status === 'error' || state.status === 'payment-error' || state.status === 'intent-conflict') root.append(createStatePanel({ kind: 'error', title: 'Amal tugamadi', message: state.error?.message || 'Qayta urinib ko‘ring.', actionLabel: state.error?.retryable !== false ? 'Qayta urinish' : '', onAction: state.error?.retryable !== false ? () => controller.retry() : undefined }, doc));
  else if (state.status === 'payment-checking') root.append(createStatePanel({kind:'loading',title:'To‘lov tekshirilmoqda',message:'Server javobi kutilmoqda.'},doc));
  else if (state.status === 'payment-pending') {
    root.append(createStatePanel({kind:'warning',title:'To‘lov kutilmoqda',message:'Mavjud buyurtma to‘lovini yakunlang.',actionLabel:'Holatni tekshirish',onAction:()=>controller.recoverPaymentStatus()},doc));
    if (state.payment?.redirectUrl) root.append(createButton({label:'To‘lovga o‘tish',onClick:()=>onRedirect?.(state.payment.redirectUrl)},doc));
  }
  else if (state.status === 'success') root.append(createStatePanel({ kind: 'success', title: 'Buyurtma qabul qilindi', message: state.order?.id ? `Buyurtma: ${state.order.id}` : 'Buyurtma serverda tasdiqlandi.' }, doc));
  else {
    const busy = ['submitting','payment-starting'].includes(state.status);
    root.append(createButton({ label: busy ? 'Yuborilmoqda…' : 'Buyurtma berish', busy, disabled: busy, onClick: async () => { const result = await controller.submit(); if (result.ok && result.data?.redirectUrl) onRedirect?.(result.data.redirectUrl); } }, doc));
  }
  return { element: root };
}

export function createPaymentReturnView({ controller, state = controller?.getState?.() || {} } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const root = doc.createElement('section'); root.className = 'uw-payment-return'; root.dataset.status = state.status || 'checking';
  const map = {
    checking: ['loading', 'To‘lov tekshirilmoqda', 'Brauzerga qaytishning o‘zi to‘lov tasdig‘i emas.'],
    paid: ['success', 'To‘lov tasdiqlandi', 'Server to‘lov holatini tasdiqladi.'],
    pending: ['warning', 'To‘lov kutilmoqda', 'Provider tasdig‘i hali kelmagan.'],
    failed: ['error', 'To‘lov amalga oshmadi', 'Buyurtma holatini tekshirib, boshqa usulni tanlashingiz mumkin.'],
    unknown: ['offline', 'Holatni aniqlab bo‘lmadi', 'Qayta tekshirish mumkin; yangi to‘lovni darhol boshlamang.'],
  };
  const [kind, title, message] = map[state.status] || map.unknown;
  root.append(createStatePanel({ kind, title, message, actionLabel: ['pending','unknown'].includes(state.status) ? 'Qayta tekshirish' : '', onAction: ['pending','unknown'].includes(state.status) ? () => controller.refresh() : undefined }, doc));
  return { element: root };
}
