import { createButton, createStatePanel } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

const STATUSES = new Set(['ALL', 'OPEN', 'ANSWERED', 'CLOSED']);
function clone(value) { return value == null ? value : structuredClone(value); }
function text(value) { return String(value ?? '').trim(); }
function idText(value) { return value == null ? null : String(value); }
function clampPage(value) { const n = Number.parseInt(String(value || 1), 10); return Number.isInteger(n) && n > 0 ? n : 1; }
function clampPageSize(value) { const n = Number.parseInt(String(value || 30), 10); return Math.min(100, Math.max(10, Number.isInteger(n) ? n : 30)); }
function statusValue(value) { const v = String(value || 'ALL').toUpperCase(); return STATUSES.has(v) ? v : 'ALL'; }
function lastMessageVersion(ticket) { return ticket?.lastMessage?.createdAt || ticket?.updatedAt || ticket?.answeredAt || ticket?.createdAt || null; }
function needsReply(ticket) {
  if (!ticket || ticket.status === 'CLOSED') return false;
  if (ticket.status === 'OPEN') return true;
  return ticket.status === 'ANSWERED' && String(ticket.lastMessage?.sender || '').toUpperCase() === 'USER';
}

export function normalizeAdminSupportTicket(raw = {}) {
  const status = statusValue(raw.status) === 'ALL' ? 'OPEN' : statusValue(raw.status);
  const customer = raw.customer && typeof raw.customer === 'object' ? raw.customer : {};
  const lastMessage = raw.lastMessage && typeof raw.lastMessage === 'object' ? {
    sender: String(raw.lastMessage.sender || '').toUpperCase(),
    body: raw.lastMessage.body ?? null,
    createdAt: raw.lastMessage.createdAt || null,
  } : null;
  return {
    ...raw,
    id: idText(raw.id),
    tgId: idText(raw.tgId ?? raw.tg_id),
    orderId: idText(raw.orderId ?? raw.order_id),
    status,
    ticketType: String(raw.ticketType || raw.ticket_type || 'SUPPORT').toUpperCase(),
    createdAt: raw.createdAt || raw.created_at || null,
    answeredAt: raw.answeredAt || raw.answered_at || null,
    closedAt: raw.closedAt || raw.closed_at || null,
    messageCount: Number(raw.messageCount || 0),
    customer: {
      name: text(customer.name) || null,
      phone: text(customer.phone) || null,
      tgId: idText(customer.tgId ?? raw.tgId ?? raw.tg_id),
    },
    lastMessage,
  };
}

export function normalizeAdminSupportMessage(raw = {}) {
  return {
    ...raw,
    id: idText(raw.id),
    ticketId: idText(raw.ticketId ?? raw.ticket_id),
    sender: String(raw.sender || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER',
    body: raw.body ?? raw.text ?? null,
    createdAt: raw.createdAt || raw.created_at || null,
    readAt: raw.readAt || raw.read_at || null,
    attachment: raw.attachment || null,
  };
}

export function createAdminSupportController({ adminPort } = {}) {
  if (!adminPort?.invoke) throw new TypeError('adminPort kerak');
  let state = {
    status: 'idle', tickets: [], selectedTicketId: null, selectedTicket: null, messages: [], error: null,
    filters: { search: '', status: 'ALL', page: 1, pageSize: 30 },
    pagination: { page: 1, pageSize: 30, totalCount: 0, totalPages: 1 },
    sending: false,
  };
  const listeners = new Set();
  const seenVersions = new Map();
  let generation = 0;
  let detailGeneration = 0;
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };
  const stale = () => fail('CONFLICT', 'So‘rov holati o‘zgargan.');

  function decorateTicket(ticket) {
    const row = normalizeAdminSupportTicket(ticket);
    const version = lastMessageVersion(row);
    const seen = seenVersions.get(row.id);
    return { ...row, needsReply: needsReply(row), hasUnreadAttention: needsReply(row) && (!seen || seen !== version) };
  }

  async function load({ page = state.filters.page } = {}) {
    const run = ++generation;
    const filters = { ...state.filters, page: clampPage(page), pageSize: clampPageSize(state.filters.pageSize), status: statusValue(state.filters.status), search: text(state.filters.search).slice(0, 80) };
    set({ status: 'loading', error: null, filters });
    const result = await adminPort.invoke('get_support_tickets', { page: filters.page, pageSize: filters.pageSize, status: filters.status, search: filters.search });
    if (run !== generation) return stale();
    if (!result.ok) { set({ status: 'error', error: result.error }); return result; }
    const tickets = (result.data?.tickets || []).map(decorateTicket);
    const totalPages = Math.max(1, Number(result.data?.totalPages || 1));
    const pagination = {
      page: clampPage(result.data?.page || filters.page), pageSize: clampPageSize(result.data?.pageSize || filters.pageSize),
      totalCount: Math.max(0, Number(result.data?.totalCount || 0)), totalPages,
    };
    const selectedTicket = state.selectedTicketId ? tickets.find((row) => row.id === state.selectedTicketId) || state.selectedTicket : null;
    set({ status: 'ready', tickets, selectedTicket, pagination, filters: { ...filters, page: pagination.page }, error: null });
    return ok({ items: tickets, ...pagination });
  }

  function setSearch(value) { set({ filters: { ...state.filters, search: String(value ?? ''), page: 1 } }); return snapshot(); }
  function setStatus(value) { set({ filters: { ...state.filters, status: statusValue(value), page: 1 } }); return snapshot(); }
  function setPageSize(value) { set({ filters: { ...state.filters, pageSize: clampPageSize(value), page: 1 } }); return snapshot(); }
  async function applyFilters() { return load({ page: 1 }); }
  async function nextPage() { return load({ page: Math.min(state.pagination.totalPages, state.pagination.page + 1) }); }
  async function previousPage() { return load({ page: Math.max(1, state.pagination.page - 1) }); }

  async function openTicket(ticketId) {
    const id = idText(ticketId);
    if (!id) return fail('VALIDATION_ERROR', 'Ticket ID kerak.');
    const run = ++detailGeneration;
    const ticket = state.tickets.find((row) => row.id === id) || (state.selectedTicket?.id === id ? state.selectedTicket : null);
    set({ status: 'messages-loading', selectedTicketId: id, selectedTicket: ticket, messages: [], error: null });
    const result = await adminPort.invoke('get_support_messages', { ticketId: id });
    if (run !== detailGeneration) return stale();
    if (!result.ok) { set({ status: 'error', error: result.error }); return result; }
    const messages = (result.data?.messages || []).map(normalizeAdminSupportMessage);
    const current = ticket || state.tickets.find((row) => row.id === id) || null;
    if (current) seenVersions.set(id, lastMessageVersion(current));
    const tickets = state.tickets.map((row) => row.id === id ? { ...row, hasUnreadAttention: false } : row);
    const selectedTicket = current ? { ...current, hasUnreadAttention: false } : null;
    set({ status: 'ready', tickets, selectedTicket, messages, error: null });
    return ok({ items: messages, hasMore: result.data?.hasMore === true });
  }

  async function sendReply(body) {
    const ticketId = state.selectedTicketId;
    const message = text(body);
    if (!ticketId) return fail('VALIDATION_ERROR', 'Avval murojaatni tanlang.');
    if (!message) return fail('VALIDATION_ERROR', 'Javob matni kerak.');
    if (state.selectedTicket?.status === 'CLOSED') return fail('CONFLICT', 'Yopilgan murojaatga javob yuborib bo‘lmaydi.');
    set({ sending: true, error: null });
    const result = await adminPort.invoke('send_support_message', { ticketId, body: message });
    if (!result.ok) { set({ sending: false, error: result.error }); return result; }
    const sent = normalizeAdminSupportMessage(result.data?.message || {});
    const returnedTicket = result.data?.ticket ? decorateTicket(result.data.ticket) : null;
    const nextTicket = returnedTicket || (state.selectedTicket ? { ...state.selectedTicket, status: 'ANSWERED', needsReply: false, hasUnreadAttention: false } : null);
    if (nextTicket) seenVersions.set(ticketId, lastMessageVersion(nextTicket));
    const tickets = state.tickets.map((row) => row.id === ticketId ? { ...row, ...(nextTicket || {}), needsReply: false, hasUnreadAttention: false } : row);
    set({ sending: false, messages: [...state.messages, sent], selectedTicket: nextTicket, tickets, error: null });
    return ok(sent);
  }

  function resetPrivateState() {
    generation++; detailGeneration++; seenVersions.clear();
    state = { status: 'idle', tickets: [], selectedTicketId: null, selectedTicket: null, messages: [], error: null, filters: { search: '', status: 'ALL', page: 1, pageSize: 30 }, pagination: { page: 1, pageSize: 30, totalCount: 0, totalPages: 1 }, sending: false };
    emit();
  }

  return Object.freeze({
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    load, setSearch, setStatus, setPageSize, applyFilters, nextPage, previousPage, openTicket, sendReply, resetPrivateState,
  });
}

function getDocument(documentRef) { const doc = documentRef ?? globalThis.document; if (!doc?.createElement) throw new Error('Admin support UI uchun DOM kerak'); return doc; }
function elText(doc, tag, className, value) { const el = doc.createElement(tag); el.className = className; el.textContent = String(value ?? ''); return el; }
function dateLabel(value) { if (!value) return ''; try { return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); } catch (_) { return String(value); } }
function ticketTitle(ticket) { return ticket.customer?.name || (ticket.customer?.tgId ? `Telegram ${ticket.customer.tgId}` : `Murojaat #${ticket.id}`); }
function statusLabel(status) { return status === 'CLOSED' ? 'Tugallangan' : status === 'ANSWERED' ? 'Javob berilgan' : 'Yangi'; }
function renderMessageAttachment(doc, attachment) {
  if (!attachment) return null;
  const wrap = doc.createElement('div'); wrap.className = 'uw-admin-support-attachment';
  const url = attachment.url || attachment.previewUrl || null;
  if (url) { const link = doc.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; link.textContent = attachment.name || 'Biriktirilgan fayl'; wrap.append(link); }
  else wrap.append(elText(doc, 'span', '', attachment.name || 'Biriktirilgan fayl'));
  wrap.append(elText(doc, 'small', '', 'Private fayl'));
  return wrap;
}

export function createAdminSupportView({ controller, state = controller?.getState?.() || {} } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const root = doc.createElement('section'); root.className = 'uw-admin-support';
  const header = doc.createElement('header'); header.className = 'uw-admin-support__header';
  const intro = doc.createElement('div'); intro.append(elText(doc, 'h2', '', 'Qo‘llab-quvvatlash'), elText(doc, 'p', '', 'Mijoz murojaatlari va yozishmalarini boshqaring.'));
  header.append(intro); root.append(header);

  const toolbar = doc.createElement('form'); toolbar.className = 'uw-admin-support-toolbar';
  const search = doc.createElement('input'); search.type = 'search'; search.className = 'uw-field__control'; search.value = state.filters?.search || ''; search.placeholder = 'Telegram ID, ism, telefon yoki ticket raqami'; search.setAttribute('aria-label', 'Murojaatlarni qidirish');
  const status = doc.createElement('select'); status.className = 'uw-field__control'; status.setAttribute('aria-label', 'Murojaat holati');
  for (const item of [['ALL','Barchasi'],['OPEN','Yangi'],['ANSWERED','Javob berilgan'],['CLOSED','Tugallangan']]) { const option = doc.createElement('option'); option.value = item[0]; option.textContent = item[1]; option.selected = item[0] === (state.filters?.status || 'ALL'); status.append(option); }
  const submit = createButton({ label: 'Izlash', type: 'submit', busy: state.status === 'loading' }, doc);
  toolbar.append(search, status, submit);
  toolbar.addEventListener('submit', (event) => { event.preventDefault(); controller.setSearch(search.value); controller.setStatus(status.value); controller.applyFilters(); });
  root.append(toolbar);

  if (state.status === 'loading' && !state.tickets?.length) { root.append(createStatePanel({ kind: 'loading', title: 'Murojaatlar yuklanmoqda', message: 'Bir oz kuting.' }, doc)); return root; }
  if (state.status === 'error' && !state.tickets?.length) { root.append(createStatePanel({ kind: 'error', title: 'Murojaatlarni ochib bo‘lmadi', message: state.error?.message || 'Qayta urinib ko‘ring.', actionLabel: 'Qayta urinish', onAction: () => controller.load() }, doc)); return root; }

  const layout = doc.createElement('div'); layout.className = 'uw-admin-support-layout';
  const master = doc.createElement('aside'); master.className = 'uw-admin-support-master'; master.setAttribute('aria-label', 'Murojaatlar ro‘yxati');
  if (!state.tickets?.length) master.append(createStatePanel({ kind: 'empty', title: 'Murojaat topilmadi', message: 'Qidiruv yoki filtrni o‘zgartirib ko‘ring.' }, doc));
  for (const ticket of state.tickets || []) {
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'uw-admin-support-ticket'; button.dataset.active = ticket.id === state.selectedTicketId ? 'true' : 'false';
    button.dataset.attention = ticket.hasUnreadAttention ? 'true' : 'false';
    const top = doc.createElement('span'); top.className = 'uw-admin-support-ticket__top'; top.append(elText(doc, 'strong', '', ticketTitle(ticket)), elText(doc, 'small', '', `#${ticket.id}`));
    const meta = doc.createElement('span'); meta.className = 'uw-admin-support-ticket__meta';
    const type = ticket.ticketType === 'RETURN' ? 'Qaytarish / muammo' : 'Support';
    meta.append(elText(doc, 'span', '', type), elText(doc, 'span', '', dateLabel(ticket.lastMessage?.createdAt || ticket.createdAt)));
    const preview = elText(doc, 'span', 'uw-admin-support-ticket__preview', ticket.lastMessage?.body || 'Xabar yo‘q');
    const footer = doc.createElement('span'); footer.className = 'uw-admin-support-ticket__footer';
    const chip = elText(doc, 'span', 'uw-admin-support-status', statusLabel(ticket.status)); chip.dataset.status = ticket.status;
    footer.append(chip);
    if (ticket.hasUnreadAttention) footer.append(elText(doc, 'span', 'uw-admin-support-attention', ticket.status === 'OPEN' ? 'Yangi' : 'Javob kerak'));
    button.append(top, meta, preview, footer); button.addEventListener('click', () => controller.openTicket(ticket.id)); master.append(button);
  }
  const pager = doc.createElement('div'); pager.className = 'uw-admin-support-pager';
  pager.append(createButton({ label: 'Oldingi', variant: 'ghost', size: 'sm', disabled: (state.pagination?.page || 1) <= 1, onClick: () => controller.previousPage() }, doc));
  pager.append(elText(doc, 'span', '', `${state.pagination?.page || 1} / ${state.pagination?.totalPages || 1}`));
  pager.append(createButton({ label: 'Keyingi', variant: 'ghost', size: 'sm', disabled: (state.pagination?.page || 1) >= (state.pagination?.totalPages || 1), onClick: () => controller.nextPage() }, doc));
  master.append(pager);

  const detail = doc.createElement('section'); detail.className = 'uw-admin-support-detail'; detail.setAttribute('aria-label', 'Murojaat tafsiloti');
  if (!state.selectedTicketId) detail.append(createStatePanel({ kind: 'empty', title: 'Murojaatni tanlang', message: 'Chap tomondagi ro‘yxatdan bir murojaatni oching.' }, doc));
  else if (state.status === 'messages-loading') detail.append(createStatePanel({ kind: 'loading', title: 'Xabarlar yuklanmoqda', message: 'Bir oz kuting.' }, doc));
  else {
    const ticket = state.selectedTicket;
    if (ticket) {
      const detailHeader = doc.createElement('header'); detailHeader.className = 'uw-admin-support-detail__header';
      const customer = doc.createElement('div'); customer.append(elText(doc, 'h3', '', ticketTitle(ticket)), elText(doc, 'p', '', `Ticket #${ticket.id}${ticket.orderId ? ` · Buyurtma #${ticket.orderId}` : ''}`));
      if (ticket.customer?.phone) customer.append(elText(doc, 'small', '', ticket.customer.phone));
      const chip = elText(doc, 'span', 'uw-admin-support-status', statusLabel(ticket.status)); chip.dataset.status = ticket.status; detailHeader.append(customer, chip); detail.append(detailHeader);
    }
    if (state.error) detail.append(createStatePanel({ kind: 'error', title: 'Amal bajarilmadi', message: state.error.message || 'Qayta urinib ko‘ring.' }, doc));
    const messages = doc.createElement('div'); messages.className = 'uw-admin-support-messages'; messages.setAttribute('aria-live', 'polite');
    if (!state.messages?.length) messages.append(createStatePanel({ kind: 'empty', title: 'Xabar yo‘q', message: 'Bu murojaatda hali xabar mavjud emas.' }, doc));
    for (const message of state.messages || []) {
      const row = doc.createElement('article'); row.className = 'uw-admin-support-message'; row.dataset.sender = message.sender;
      if (message.body) row.append(elText(doc, 'p', '', message.body));
      const attachment = renderMessageAttachment(doc, message.attachment); if (attachment) row.append(attachment);
      const meta = doc.createElement('footer'); meta.append(elText(doc, 'span', '', dateLabel(message.createdAt)));
      if (message.sender === 'ADMIN') meta.append(elText(doc, 'span', '', message.readAt ? 'O‘qildi' : 'Yuborildi'));
      row.append(meta); messages.append(row);
    }
    detail.append(messages);
    if (state.selectedTicket?.status !== 'CLOSED') {
      const composer = doc.createElement('form'); composer.className = 'uw-admin-support-composer';
      const area = doc.createElement('textarea'); area.className = 'uw-field__control'; area.rows = 3; area.maxLength = 2000; area.placeholder = 'Javob yozing…'; area.setAttribute('aria-label', 'Support javobi');
      const send = createButton({ label: state.sending ? 'Yuborilmoqda…' : 'Javob yuborish', type: 'submit', busy: state.sending }, doc);
      composer.append(area, send); composer.addEventListener('submit', (event) => { event.preventDefault(); const body = area.value; controller.sendReply(body).then((result) => { if (result.ok) area.value = ''; }); }); detail.append(composer);
    }
  }
  layout.append(master, detail); root.append(layout); return root;
}
