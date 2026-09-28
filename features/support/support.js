import { createButton, createStatePanel } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

const MESSAGE_STATUS = Object.freeze({ PENDING: 'PENDING', SENT: 'SENT', FAILED: 'FAILED' });
const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function clone(value) { return value == null ? value : structuredClone(value); }
function text(value) { return String(value ?? '').trim(); }
function idText(value) { return value == null ? null : String(value); }
function normalizeThread(raw = {}) {
  return {
    ...raw,
    id: idText(raw.id),
    subject: text(raw.subject) || (String(raw.ticketType || '').toUpperCase() === 'RETURN' ? 'Qaytarish / muammo' : 'Qo‘llab-quvvatlash'),
    unreadCount: Number(raw.unreadCount || 0),
    updatedAt: raw.updatedAt || raw.lastMessageAt || raw.answeredAt || raw.createdAt || null,
  };
}
function normalizeAttachment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    path: raw.path || null,
    name: raw.name || 'Biriktirilgan fayl',
    mimeType: raw.mimeType || raw.type || '',
    size: Number(raw.size || 0),
    visibility: raw.visibility || 'PRIVATE',
    previewUrl: raw.previewUrl || raw.url || null,
    localPreview: raw.localPreview === true,
  };
}
function normalizeMessage(raw = {}) {
  return {
    ...raw,
    id: idText(raw.id) || null,
    threadId: idText(raw.threadId ?? raw.ticketId),
    clientMessageId: raw.clientMessageId || null,
    sender: String(raw.sender || '').toUpperCase() === 'USER' ? 'CUSTOMER' : String(raw.sender || 'CUSTOMER').toUpperCase(),
    text: raw.text ?? raw.body ?? null,
    attachment: normalizeAttachment(raw.attachment),
    status: Object.values(MESSAGE_STATUS).includes(String(raw.status || '').toUpperCase()) ? String(raw.status).toUpperCase() : MESSAGE_STATUS.SENT,
    createdAt: raw.createdAt || null,
    readAt: raw.readAt || null,
    retryable: raw.retryable !== false,
    error: raw.error || null,
  };
}
function sanitizeAttachmentForSend(attachment) {
  if (!attachment) return null;
  const clean = {};
  for (const key of ['path', 'name', 'mimeType', 'size', 'id', 'visibility']) if (attachment[key] != null) clean[key] = attachment[key];
  return clean;
}
function defaultClientMessageId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function defaultNow() { return new Date().toISOString(); }

export function createSupportController({ supportPort, createClientMessageId = defaultClientMessageId, now = defaultNow, createObjectUrl, revokeObjectUrl } = {}) {
  if (!supportPort?.listThreads || !supportPort?.getMessages || !supportPort?.sendMessage || !supportPort?.uploadAttachment) throw new TypeError('supportPort to‘liq kerak');
  const createUrl = createObjectUrl || ((file) => globalThis.URL?.createObjectURL ? globalThis.URL.createObjectURL(file) : null);
  const revokeUrl = revokeObjectUrl || ((url) => { try { globalThis.URL?.revokeObjectURL?.(url); } catch (_) {} });
  let state = { status: 'idle', threads: [], selectedThreadId: null, messages: [], error: null, draftText: '', draftContext: null };
  const listeners = new Set();
  const retryPayloads = new Map();
  const localPreviewUrls = new Set();
  let privateGeneration = 0;
  let viewGeneration = 0;
  const staleResult = () => fail('CONFLICT', 'So‘rov holati o‘zgargan.');
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };
  const replaceMessage = (clientMessageId, patch) => {
    state.messages = state.messages.map((row) => row.clientMessageId === clientMessageId ? { ...row, ...patch } : row);
    emit();
  };
  const rememberPreview = (file) => {
    if (!file || !String(file.type || '').startsWith('image/')) return null;
    try {
      const url = createUrl(file);
      if (url) localPreviewUrls.add(url);
      return url || null;
    } catch (_) { return null; }
  };

  async function loadThreads() {
    const generation = privateGeneration;
    set({ status: 'loading', error: null });
    const result = await supportPort.listThreads({ cursor: null });
    if (generation !== privateGeneration) return staleResult();
    if (!result.ok) { set({ status: 'error', error: result.error }); return result; }
    const threads = (result.data?.items || []).map(normalizeThread);
    set({ status: 'ready', threads, error: null });
    return ok({ items: threads, nextCursor: result.data?.nextCursor ?? null, total: result.data?.total ?? threads.length });
  }

  async function openThread(threadId) {
    const generation = privateGeneration;
    const view = ++viewGeneration;
    const id = idText(threadId);
    if (!id) return fail('VALIDATION_ERROR', 'Thread ID kerak.');
    set({ selectedThreadId: id, status: 'messages-loading', error: null });
    const result = await supportPort.getMessages({ threadId: id, cursor: null });
    if (generation !== privateGeneration || view !== viewGeneration) return staleResult();
    if (!result.ok) { set({ status: 'error', error: result.error }); return result; }
    const messages = (result.data?.items || []).map(normalizeMessage);
    set({ status: 'ready', messages, selectedThreadId: id, error: null });
    return ok({ items: messages, nextCursor: result.data?.nextCursor ?? null, total: result.data?.total ?? messages.length });
  }

  function setDraft(draftText = '', draftContext = null) {
    set({ draftText: String(draftText ?? ''), draftContext: draftContext ? clone(draftContext) : null });
    return snapshot();
  }

  async function dispatch(payload) {
    const generation = privateGeneration;
    const view = viewGeneration;
    const clientMessageId = payload.clientMessageId;
    let attachment = payload.uploadedAttachment || null;
    if (!attachment && payload.file) {
      const uploaded = await supportPort.uploadAttachment({ file: payload.file });
      if (generation !== privateGeneration) return staleResult();
      if (!uploaded.ok) {
        replaceMessage(clientMessageId, { status: MESSAGE_STATUS.FAILED, retryable: uploaded.error?.retryable !== false, error: uploaded.error });
        return uploaded;
      }
      attachment = uploaded.data?.attachment || null;
      payload.uploadedAttachment = attachment;
    }
    const result = await supportPort.sendMessage({
      threadId: payload.threadId,
      text: payload.text || null,
      attachment: sanitizeAttachmentForSend(attachment),
      clientMessageId,
    });
    if (generation !== privateGeneration) return staleResult();
    if (!result.ok) {
      replaceMessage(clientMessageId, { status: MESSAGE_STATUS.FAILED, retryable: result.error?.retryable !== false, error: result.error });
      return result;
    }
    const server = normalizeMessage(result.data || {});
    const local = state.messages.find((row) => row.clientMessageId === clientMessageId);
    replaceMessage(clientMessageId, {
      ...server,
      id: server.id || local?.id,
      threadId: server.threadId || payload.threadId || local?.threadId || null,
      clientMessageId,
      text: server.text ?? payload.text ?? local?.text ?? null,
      attachment: server.attachment || (attachment ? { ...normalizeAttachment(attachment), previewUrl: local?.attachment?.previewUrl || null, localPreview: !!local?.attachment?.localPreview } : local?.attachment || null),
      status: MESSAGE_STATUS.SENT,
      retryable: false,
      error: null,
    });
    retryPayloads.delete(clientMessageId);
    if (!payload.threadId && server.threadId && view === viewGeneration) set({ selectedThreadId: server.threadId });
    return ok(state.messages.find((row) => row.clientMessageId === clientMessageId));
  }

  async function send({ text: body = '', file = null, threadId = state.selectedThreadId } = {}) {
    const bodyText = text(body);
    if (!bodyText && !file) return fail('VALIDATION_ERROR', 'Xabar yoki fayl kerak.');
    const clientMessageId = String(createClientMessageId());
    const previewUrl = rememberPreview(file);
    const optimistic = normalizeMessage({
      id: `local:${clientMessageId}`,
      threadId: threadId || null,
      clientMessageId,
      sender: 'CUSTOMER',
      text: bodyText || null,
      attachment: file ? { name: file.name || 'Fayl', mimeType: file.type || '', size: Number(file.size || 0), visibility: 'PRIVATE', previewUrl, localPreview: !!previewUrl } : null,
      status: MESSAGE_STATUS.PENDING,
      createdAt: now(),
      retryable: true,
    });
    state.messages = [...state.messages, optimistic];
    state.draftText = '';
    state.error = null;
    emit();
    const payload = { clientMessageId, threadId: threadId || null, text: bodyText || null, file, uploadedAttachment: null };
    retryPayloads.set(clientMessageId, payload);
    return dispatch(payload);
  }

  async function retry(clientMessageId) {
    const id = String(clientMessageId || '');
    const payload = retryPayloads.get(id);
    if (!payload) return fail('NOT_FOUND', 'Qayta yuborish uchun lokal xabar topilmadi.');
    const row = state.messages.find((item) => item.clientMessageId === id);
    if (!row || row.status !== MESSAGE_STATUS.FAILED || row.retryable === false) return fail('CONFLICT', 'Bu xabarni qayta yuborib bo‘lmaydi.');
    replaceMessage(id, { status: MESSAGE_STATUS.PENDING, error: null });
    return dispatch(payload);
  }

  function resetPrivateState() {
    privateGeneration++;
    viewGeneration++;
    for (const url of localPreviewUrls) revokeUrl(url);
    localPreviewUrls.clear(); retryPayloads.clear();
    state = { status: 'idle', threads: [], selectedThreadId: null, messages: [], error: null, draftText: '', draftContext: null };
    emit();
  }

  return Object.freeze({
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    loadThreads, openThread, send, retry, setDraft, resetPrivateState,
    selectNewThread() { viewGeneration++; set({ selectedThreadId: null, messages: [], error: null }); },
  });
}

export function createOrderReturnSupportHandler({ supportController, navigate } = {}) {
  if (!supportController?.setDraft) throw new TypeError('supportController kerak');
  return async (order = {}) => {
    const orderId = idText(order.id);
    if (!orderId) return fail('VALIDATION_ERROR', 'Buyurtma ID kerak.');
    supportController.setDraft(`Buyurtma #${orderId} bo‘yicha qaytarish / muammo: `, { type: 'ORDER_RETURN', orderId });
    const href = `/support?order=${encodeURIComponent(orderId)}`;
    if (typeof navigate === 'function') await navigate(href);
    return ok({ routed: true, href, orderId });
  };
}

function getDocument(documentRef) {
  const doc = documentRef ?? globalThis.document;
  if (!doc?.createElement) throw new Error('Support UI uchun DOM kerak');
  return doc;
}
function appendText(doc, tag, className, value) { const el = doc.createElement(tag); el.className = className; el.textContent = String(value ?? ''); return el; }
function dateLabel(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  catch (_) { return String(value); }
}
function renderAttachment(doc, attachment) {
  const wrap = doc.createElement('div'); wrap.className = 'uw-support-attachment'; wrap.dataset.visibility = attachment?.visibility || 'PRIVATE';
  const url = attachment?.previewUrl;
  if (url && SAFE_IMAGE_TYPES.has(String(attachment.mimeType || '').toLowerCase())) {
    const image = doc.createElement('img'); image.src = url; image.alt = attachment.name || 'Biriktirilgan rasm'; image.width = 640; image.height = 480; image.loading = 'lazy'; image.decoding = 'async'; image.fetchPriority = 'low'; image.referrerPolicy = 'no-referrer'; wrap.append(image);
  } else if (url) {
    const link = doc.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; link.textContent = attachment.name || 'Faylni ochish'; wrap.append(link);
  } else wrap.append(appendText(doc, 'span', '', attachment?.name || 'Biriktirilgan fayl'));
  const note = appendText(doc, 'small', '', 'Private fayl'); note.setAttribute('aria-label', 'Private attachment'); wrap.append(note);
  return wrap;
}

export function createSupportView({ controller, state = controller?.getState?.() || {} } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const root = doc.createElement('section'); root.className = 'uw-support';
  const header = doc.createElement('header'); header.className = 'uw-support__header';
  header.append(appendText(doc, 'h1', '', 'Yordam va xabarlar'), createButton({ label: 'Yangi murojaat', variant: 'secondary', onClick: () => controller.selectNewThread() }, doc));
  root.append(header);

  if (state.status === 'loading') { root.append(createStatePanel({ kind: 'loading', title: 'Murojaatlar yuklanmoqda', message: 'Bir oz kuting.' }, doc)); return root; }
  if (state.error && !state.messages?.length) { root.append(createStatePanel({ kind: 'error', title: 'Yordam bo‘limini ochib bo‘lmadi', message: state.error.message || 'Qayta urinib ko‘ring.', actionLabel: 'Qayta urinish', onAction: () => controller.loadThreads() }, doc)); return root; }

  const layout = doc.createElement('div'); layout.className = 'uw-support-layout';
  const aside = doc.createElement('aside'); aside.className = 'uw-support-threads'; aside.setAttribute('aria-label', 'Murojaatlar');
  if (!state.threads?.length) aside.append(createStatePanel({ kind: 'empty', title: 'Murojaat yo‘q', message: 'Yangi savol yoki muammo yuborishingiz mumkin.' }, doc));
  for (const thread of state.threads || []) {
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'uw-support-thread'; button.dataset.active = String(thread.id) === String(state.selectedThreadId) ? 'true' : 'false';
    const main = doc.createElement('span'); main.append(appendText(doc, 'strong', '', thread.subject), appendText(doc, 'small', '', dateLabel(thread.updatedAt)));
    button.append(main);
    if (thread.unreadCount > 0) button.append(appendText(doc, 'span', 'uw-support-thread__badge', thread.unreadCount));
    button.addEventListener('click', () => controller.openThread(thread.id)); aside.append(button);
  }

  const chat = doc.createElement('section'); chat.className = 'uw-support-chat'; chat.setAttribute('aria-label', 'Support chat');
  const messages = doc.createElement('div'); messages.className = 'uw-support-messages'; messages.setAttribute('aria-live', 'polite');
  if (state.status === 'messages-loading') messages.append(createStatePanel({ kind: 'loading', title: 'Xabarlar yuklanmoqda', message: 'Bir oz kuting.' }, doc));
  else if (!state.messages?.length) messages.append(createStatePanel({ kind: 'empty', title: 'Suhbatni boshlang', message: 'Savolingizni yozing yoki rasm biriktiring.' }, doc));
  for (const message of state.messages || []) {
    const bubble = doc.createElement('article'); bubble.className = 'uw-support-message'; bubble.dataset.sender = message.sender === 'ADMIN' ? 'ADMIN' : 'CUSTOMER'; bubble.dataset.status = message.status || 'SENT';
    if (message.text) bubble.append(appendText(doc, 'p', 'uw-support-message__text', message.text));
    if (message.attachment) bubble.append(renderAttachment(doc, message.attachment));
    const meta = doc.createElement('footer'); meta.className = 'uw-support-message__meta';
    const statusLabel = message.status === 'PENDING' ? 'Yuborilmoqda…' : message.status === 'FAILED' ? 'Yuborilmadi' : message.readAt ? 'O‘qildi' : 'Yuborildi';
    meta.append(appendText(doc, 'span', '', dateLabel(message.createdAt)), appendText(doc, 'span', '', statusLabel));
    if (message.status === 'FAILED' && message.retryable !== false && message.clientMessageId) meta.append(createButton({ label: 'Qayta yuborish', variant: 'ghost', size: 'sm', onClick: () => controller.retry(message.clientMessageId) }, doc));
    bubble.append(meta); messages.append(bubble);
  }
  chat.append(messages);

  const form = doc.createElement('form'); form.className = 'uw-support-composer';
  const textarea = doc.createElement('textarea'); textarea.className = 'uw-field__control uw-support-composer__text'; textarea.name = 'message'; textarea.rows = 3; textarea.maxLength = 2000; textarea.placeholder = 'Xabaringizni yozing…'; textarea.value = state.draftText || '';
  textarea.setAttribute('aria-label', 'Xabar');
  const file = doc.createElement('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp'; file.className = 'uw-support-composer__file'; file.setAttribute('aria-label', 'Rasm biriktirish');
  const actions = doc.createElement('div'); actions.className = 'uw-support-composer__actions';
  actions.append(file, createButton({ label: 'Yuborish', type: 'submit' }, doc)); form.append(textarea, actions);
  form.addEventListener('submit', (event) => { event.preventDefault(); controller.send({ text: textarea.value, file: file.files?.[0] || null }); });
  chat.append(form); layout.append(aside, chat); root.append(layout);
  return root;
}
