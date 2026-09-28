import { createButton, createStatePanel } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

const TERMINAL_STATUSES = new Set(['CANCELLED', 'DELIVERED', 'REFUNDED']);
const STATUS_LABELS = Object.freeze({
  NEW: 'Yangi', PROCESSING: 'Tayyorlanmoqda', SHIPPED: 'Yo‘lda', DELIVERED: 'Yetkazildi',
  RECEIVED: 'Qabul qilindi', CANCELLED: 'Bekor qilindi', REFUNDED: 'Pul qaytarildi', UNKNOWN: 'Noma’lum holat',
});

function clone(value) { return value == null ? value : structuredClone(value); }
function text(value) { return String(value ?? '').trim(); }
function numeric(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function normalizeStatus(value) { const s = text(value).toUpperCase(); return STATUS_LABELS[s] ? s : 'UNKNOWN'; }

export function orderStatusLabel(status) { return STATUS_LABELS[normalizeStatus(status)]; }
export function formatOrderMoney(value, currency = 'UZS') {
  const amount = numeric(value);
  try { return new Intl.NumberFormat('uz-UZ').format(amount) + (currency === 'UZS' ? ' so‘m' : ` ${currency}`); }
  catch (_) { return `${amount} ${currency}`; }
}

export function buildOrderStatusTimeline(order = {}) {
  const rows = [];
  if (order.createdAt) rows.push({ key: 'CREATED', label: 'Buyurtma yaratildi', at: order.createdAt, current: false });
  if (order.paidAt) rows.push({ key: 'PAID', label: 'To‘lov tasdiqlandi', at: order.paidAt, current: false });
  if (order.deliveredAt) rows.push({ key: 'DELIVERED', label: 'Yetkazildi', at: order.deliveredAt, current: normalizeStatus(order.status) === 'DELIVERED' });
  if (order.refundedAt) rows.push({ key: 'REFUNDED', label: 'Pul qaytarildi', at: order.refundedAt, current: normalizeStatus(order.status) === 'REFUNDED' });
  const status = normalizeStatus(order.status);
  const represented = rows.some((row) => row.key === status || (status === 'NEW' && row.key === 'CREATED'));
  if (!represented) rows.push({ key: status, label: orderStatusLabel(status), at: null, current: true });
  if (rows.length && !rows.some((row) => row.current)) rows[rows.length - 1].current = true;
  return rows;
}

export function orderActionAvailability(order = {}, { returnRequestsEnabled = true } = {}) {
  const status = normalizeStatus(order.status);
  const hasOpenReturn = !!order.returnRequest && !['REJECTED', 'COMPLETED'].includes(text(order.returnRequest.status).toUpperCase());
  return {
    canCancel: ['NEW', 'PROCESSING'].includes(status),
    canConfirmReceived: status === 'PROCESSING',
    canRequestReturn: returnRequestsEnabled && status === 'DELIVERED' && !hasOpenReturn,
    terminal: TERMINAL_STATUSES.has(status),
  };
}

export function createOrdersController({ ordersPort, returnRequestsEnabled = true, onRequestReturn } = {}) {
  if (!ordersPort?.listMine || !ordersPort?.getMine || !ordersPort?.cancelMine || !ordersPort?.confirmReceived) throw new TypeError('ordersPort to‘liq kerak');
  let state = { status: 'idle', items: [], selected: null, selectedId: null, error: null, action: null };
  const listeners = new Set();
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };
  const mergeOrder = (order) => {
    if (!order?.id) return;
    state.items = state.items.map((row) => String(row.id) === String(order.id) ? { ...row, ...order } : row);
    if (state.selected && String(state.selected.id) === String(order.id)) state.selected = { ...state.selected, ...order };
  };

  async function load() {
    set({ status: 'loading', error: null });
    const result = await ordersPort.listMine({ cursor: null });
    if (!result.ok) { set({ status: 'error', error: result.error }); return result; }
    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    set({ status: 'ready', items, error: null });
    return ok({ items, nextCursor: result.data?.nextCursor ?? null, total: result.data?.total ?? items.length });
  }

  async function open(orderId) {
    const id = text(orderId);
    if (!id) return fail('VALIDATION_ERROR', 'Buyurtma ID kerak.');
    set({ selectedId: id, status: 'detail-loading', error: null });
    const result = await ordersPort.getMine({ orderId: id });
    if (!result.ok) { set({ status: 'error', error: result.error }); return result; }
    set({ selected: result.data, selectedId: id, status: 'ready', error: null });
    return result;
  }

  async function cancel(reason = '') {
    if (!state.selected?.id) return fail('VALIDATION_ERROR', 'Buyurtma tanlanmagan.');
    if (!orderActionAvailability(state.selected, { returnRequestsEnabled }).canCancel) return fail('CONFLICT', 'Bu bosqichda bekor qilib bo‘lmaydi.');
    set({ action: 'cancel', error: null });
    const result = await ordersPort.cancelMine({ orderId: state.selected.id, reason: text(reason) || null });
    if (!result.ok) { set({ action: null, error: result.error }); return result; }
    const order = { ...state.selected, ...result.data, status: result.data?.status || 'CANCELLED', cancelReason: result.data?.reason ?? (text(reason) || null) };
    mergeOrder(order); set({ selected: order, action: null, error: null });
    return ok(order);
  }

  async function confirmReceived() {
    if (!state.selected?.id) return fail('VALIDATION_ERROR', 'Buyurtma tanlanmagan.');
    if (!orderActionAvailability(state.selected, { returnRequestsEnabled }).canConfirmReceived) return fail('CONFLICT', 'Bu buyurtmani hozir qabul qildim deb bo‘lmaydi.');
    set({ action: 'confirm', error: null });
    const result = await ordersPort.confirmReceived({ orderId: state.selected.id });
    if (!result.ok) { set({ action: null, error: result.error }); return result; }
    const order = { ...state.selected, ...result.data, status: result.data?.status || 'DELIVERED' };
    mergeOrder(order); set({ selected: order, action: null, error: null });
    return ok(order);
  }

  async function requestReturn() {
    if (!state.selected?.id) return fail('VALIDATION_ERROR', 'Buyurtma tanlanmagan.');
    if (!orderActionAvailability(state.selected, { returnRequestsEnabled }).canRequestReturn) return fail('CONFLICT', 'Qaytarish amali hozir mavjud emas.');
    if (typeof onRequestReturn !== 'function') return fail('CAPABILITY_UNAVAILABLE', 'Qaytarish support oqimi hali ulanmagan.');
    const value = await onRequestReturn(clone(state.selected));
    return value?.ok === false ? value : ok(value?.data ?? value ?? { routed: true });
  }

  return Object.freeze({
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    load, open, cancel, confirmReceived, requestReturn,
    closeDetail() { set({ selected: null, selectedId: null, error: null, action: null }); },
  });
}

function getDocument(documentRef) {
  const doc = documentRef ?? globalThis.document;
  if (!doc?.createElement) throw new Error('Orders UI uchun DOM kerak');
  return doc;
}
function appendTextNode(doc, tag, className, value) { const node = doc.createElement(tag); node.className = className; node.textContent = String(value ?? ''); return node; }
function dateLabel(value) {
  if (!value) return 'Vaqt qayd etilmagan';
  try { return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch (_) { return String(value); }
}

export function createOrdersView({ controller, state = controller?.getState?.() || {}, currency = 'UZS', returnRequestsEnabled = true } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const root = doc.createElement('section'); root.className = 'uw-orders';
  const header = doc.createElement('header'); header.className = 'uw-orders__header';
  header.append(appendTextNode(doc, 'h1', '', 'Buyurtmalarim'));
  root.append(header);

  if (state.status === 'loading') { root.append(createStatePanel({ kind: 'loading', title: 'Buyurtmalar yuklanmoqda', message: 'Bir oz kuting.' }, doc)); return root; }
  if (state.error) { root.append(createStatePanel({ kind: 'error', title: 'Buyurtmalarni ochib bo‘lmadi', message: state.error.message || 'Qayta urinib ko‘ring.', actionLabel: 'Qayta urinish', onAction: () => controller.load() }, doc)); return root; }
  if (!state.items?.length) { root.append(createStatePanel({ kind: 'empty', title: 'Hali buyurtma yo‘q', message: 'Birinchi xaridingiz shu yerda ko‘rinadi.' }, doc)); return root; }

  const layout = doc.createElement('div'); layout.className = 'uw-orders-layout';
  const list = doc.createElement('div'); list.className = 'uw-orders-list';
  for (const order of state.items) {
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'uw-order-row'; button.dataset.active = String(state.selectedId) === String(order.id) ? 'true' : 'false';
    const main = doc.createElement('span'); main.className = 'uw-order-row__main';
    main.append(appendTextNode(doc, 'b', '', `#${order.id}`), appendTextNode(doc, 'small', '', dateLabel(order.createdAt)));
    const side = doc.createElement('span'); side.className = 'uw-order-row__side';
    const status = appendTextNode(doc, 'span', 'uw-order-status', orderStatusLabel(order.status)); status.dataset.status = normalizeStatus(order.status);
    side.append(status, appendTextNode(doc, 'strong', '', formatOrderMoney(order.payableTotal ?? order.total ?? order.totalPrice, order.currency || currency)));
    button.append(main, side); button.addEventListener('click', () => controller.open(order.id)); list.append(button);
  }
  layout.append(list);

  const detail = doc.createElement('aside'); detail.className = 'uw-order-detail';
  if (!state.selected) detail.append(createStatePanel({ kind: 'empty', title: 'Buyurtmani tanlang', message: 'Tafsilot va amallar shu yerda ochiladi.' }, doc));
  else {
    const order = state.selected; const actions = orderActionAvailability(order, { returnRequestsEnabled });
    const top = doc.createElement('div'); top.className = 'uw-order-detail__top';
    top.append(appendTextNode(doc, 'div', 'uw-order-detail__id', `Buyurtma #${order.id}`));
    const status = appendTextNode(doc, 'span', 'uw-order-status', orderStatusLabel(order.status)); status.dataset.status = normalizeStatus(order.status); top.append(status); detail.append(top);
    const totals = doc.createElement('dl'); totals.className = 'uw-order-detail__totals';
    [['Mahsulotlar', order.subtotal ?? order.total ?? order.totalPrice], ['Yetkazib berish', order.deliveryFee ?? 0], ['Jami', order.payableTotal ?? order.total ?? order.totalPrice]].forEach(([label, value]) => { totals.append(appendTextNode(doc, 'dt', '', label), appendTextNode(doc, 'dd', '', formatOrderMoney(value, order.currency || currency))); });
    detail.append(totals);
    const timeline = doc.createElement('ol'); timeline.className = 'uw-order-timeline'; timeline.setAttribute('aria-label', 'Buyurtma holati tarixi');
    for (const row of buildOrderStatusTimeline(order)) { const li = doc.createElement('li'); li.dataset.current = row.current ? 'true' : 'false'; li.append(appendTextNode(doc, 'b', '', row.label), appendTextNode(doc, 'time', '', dateLabel(row.at))); timeline.append(li); }
    detail.append(timeline);
    if (order.returnRequest) detail.append(createStatePanel({ kind: 'empty', title: `Qaytarish: ${text(order.returnRequest.status) || 'ko‘rib chiqilmoqda'}`, message: order.returnRequest.reason || 'Qaytarish so‘rovi mavjud.' }, doc));
    const buttons = doc.createElement('div'); buttons.className = 'uw-order-detail__actions';
    if (actions.canCancel) buttons.append(createButton({ label: 'Bekor qilish', variant: 'danger', busy: state.action === 'cancel', onClick: () => controller.cancel() }, doc));
    if (actions.canConfirmReceived) buttons.append(createButton({ label: 'Qabul qildim', variant: 'primary', busy: state.action === 'confirm', onClick: () => controller.confirmReceived() }, doc));
    if (actions.canRequestReturn) buttons.append(createButton({ label: 'Qaytarish / muammo', variant: 'secondary', onClick: () => controller.requestReturn() }, doc));
    detail.append(buttons);
  }
  layout.append(detail); root.append(layout); return root;
}
