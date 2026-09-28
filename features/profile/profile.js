import { createButton, createStatePanel, createTextField } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function text(value) { return String(value ?? '').trim(); }
function getDocument(documentRef) {
  const doc = documentRef ?? globalThis.document;
  if (!doc?.createElement) throw new Error('Profile UI uchun DOM kerak');
  return doc;
}
function node(doc, tag, className, value) {
  const el = doc.createElement(tag); el.className = className || ''; if (value != null) el.textContent = String(value); return el;
}
function dateLabel(value) {
  if (!value) return 'Noma’lum';
  try { return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch (_) { return String(value); }
}

export function validateProfilePatch(input = {}) {
  const firstName = text(input.firstName ?? input.name);
  const lastName = text(input.lastName);
  const phone = String(input.phone || '').replace(/\s+/g, '');
  const fieldErrors = {};
  if (!firstName) fieldErrors.firstName = 'Ismni kiriting.';
  if (!/^\+998\d{9}$/.test(phone)) fieldErrors.phone = 'Telefon +998XXXXXXXXX formatida bo‘lsin.';
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors, patch: { firstName, lastName: lastName || null, phone } };
}

export function createProfileController({ profilePort, initialAccountId = null } = {}) {
  if (!profilePort?.get || !profilePort?.update || !profilePort?.listFavorites || !profilePort?.setFavorite) throw new TypeError('profilePort to‘liq kerak');
  let state = { status: 'idle', accountId: initialAccountId, profile: null, favorites: [], error: null, saving: false, favoriteBusy: null };
  const listeners = new Set();
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };

  function resetPrivateState(nextAccountId = null) {
    state = { status: 'idle', accountId: nextAccountId, profile: null, favorites: [], error: null, saving: false, favoriteBusy: null };
    emit();
    return snapshot();
  }

  async function load({ accountId = state.accountId } = {}) {
    if (state.accountId && accountId && String(state.accountId) !== String(accountId)) resetPrivateState(accountId);
    else if (accountId && !state.accountId) state.accountId = accountId;
    set({ status: 'loading', error: null });
    const [profileResult, favoritesResult] = await Promise.all([profilePort.get(), profilePort.listFavorites()]);
    if (!profileResult.ok) { set({ status: 'error', error: profileResult.error, profile: null, favorites: [] }); return profileResult; }
    if (!favoritesResult.ok) { set({ status: 'error', error: favoritesResult.error, profile: null, favorites: [] }); return favoritesResult; }
    const resolvedAccountId = profileResult.data?.account?.id || accountId || null;
    set({ status: 'ready', accountId: resolvedAccountId, profile: profileResult.data, favorites: favoritesResult.data?.items || [], error: null });
    return ok({ profile: profileResult.data, favorites: favoritesResult.data?.items || [] });
  }

  async function save(input) {
    const checked = validateProfilePatch(input);
    if (!checked.valid) return fail('VALIDATION_ERROR', 'Profil ma’lumotlarini tekshiring.', { fieldErrors: checked.fieldErrors });
    set({ saving: true, error: null });
    const result = await profilePort.update({ patch: checked.patch });
    if (!result.ok) { set({ saving: false, error: result.error }); return result; }
    set({ saving: false, profile: { ...(state.profile || {}), ...result.data }, accountId: result.data?.account?.id || state.accountId, error: null });
    return result;
  }

  async function setFavorite(productId, favorite) {
    const id = text(productId);
    if (!id || typeof favorite !== 'boolean') return fail('VALIDATION_ERROR', 'Sevimli mahsulot ma’lumoti noto‘g‘ri.');
    set({ favoriteBusy: id, error: null });
    const result = await profilePort.setFavorite({ productId: id, favorite });
    if (!result.ok) { set({ favoriteBusy: null, error: result.error }); return result; }
    const current = state.favorites.filter((row) => String(row.productId) !== id);
    if (favorite) current.unshift({ productId: id, createdAt: new Date().toISOString() });
    set({ favoriteBusy: null, favorites: current, error: null });
    return result;
  }

  return Object.freeze({
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    load, save, setFavorite, resetPrivateState,
  });
}

export function createSessionsController({ authPort, onSignedOut } = {}) {
  if (!authPort?.listSessions || !authPort?.revokeSession || !authPort?.revokeAllSessions || !authPort?.signOut) throw new TypeError('authPort session metodlari kerak');
  let state = { status: 'idle', items: [], error: null, busySessionId: null, signingOut: false };
  const listeners = new Set();
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };

  async function load() {
    set({ status: 'loading', error: null });
    const result = await authPort.listSessions();
    if (!result.ok) { set({ status: 'error', items: [], error: result.error }); return result; }
    set({ status: 'ready', items: result.data?.items || [], error: null });
    return result;
  }
  async function revoke(sessionId) {
    const id = text(sessionId);
    if (!id) return fail('VALIDATION_ERROR', 'Sessiya ID kerak.');
    const target = state.items.find((row) => String(row.id) === id);
    if (target?.current) return fail('CONFLICT', 'Joriy sessiyani bu yerdan bekor qilmang; chiqish tugmasidan foydalaning.');
    set({ busySessionId: id, error: null });
    const result = await authPort.revokeSession({ sessionId: id });
    if (!result.ok) { set({ busySessionId: null, error: result.error }); return result; }
    set({ busySessionId: null, items: state.items.filter((row) => String(row.id) !== id), error: null });
    return result;
  }
  async function revokeOthers() {
    set({ busySessionId: '__all__', error: null });
    const result = await authPort.revokeAllSessions();
    if (!result.ok) { set({ busySessionId: null, error: result.error }); return result; }
    set({ busySessionId: null, items: state.items.filter((row) => row.current), error: null });
    return result;
  }
  async function signOut() {
    set({ signingOut: true, error: null });
    const result = await authPort.signOut();
    if (!result.ok) { set({ signingOut: false, error: result.error }); return result; }
    state = { status: 'idle', items: [], error: null, busySessionId: null, signingOut: false };
    emit(); onSignedOut?.();
    return result;
  }
  return Object.freeze({ getState: snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, load, revoke, revokeOthers, signOut });
}

export function createProfileView({ controller, state = controller?.getState?.() || {}, onOpenProduct, onOpenSessions } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const root = doc.createElement('section'); root.className = 'uw-profile';
  root.append(node(doc, 'h1', '', 'Profil'));
  if (state.status === 'loading') { root.append(createStatePanel({ kind: 'loading', title: 'Profil yuklanmoqda', message: 'Bir oz kuting.' }, doc)); return root; }
  if (state.error) root.append(createStatePanel({ kind: 'error', title: 'Profilni ochib bo‘lmadi', message: state.error.message || 'Qayta urinib ko‘ring.', actionLabel: 'Qayta urinish', onAction: () => controller.load() }, doc));
  if (!state.profile) { if (!state.error) root.append(createStatePanel({ kind: 'empty', title: 'Profil ma’lumoti yo‘q', message: 'Profilni qayta yuklab ko‘ring.' }, doc)); return root; }

  const layout = doc.createElement('div'); layout.className = 'uw-profile-layout';
  const form = doc.createElement('form'); form.className = 'uw-profile-card';
  form.append(node(doc, 'h2', '', 'Shaxsiy ma’lumotlar'));
  const displayName = state.profile?.shopProfile?.name || state.profile?.account?.displayName || '';
  const parts = displayName.split(/\s+/).filter(Boolean);
  const firstName = createTextField({ label: 'Ism', name: 'firstName', value: parts[0] || '', autocomplete: 'given-name', required: true }, doc);
  const lastName = createTextField({ label: 'Familiya', name: 'lastName', value: parts.slice(1).join(' '), autocomplete: 'family-name' }, doc);
  const phone = createTextField({ label: 'Telefon', name: 'phone', value: state.profile?.shopProfile?.phone || '', autocomplete: 'tel', required: true }, doc);
  form.append(firstName.element, lastName.element, phone.element, createButton({ label: state.saving ? 'Saqlanmoqda…' : 'Saqlash', type: 'submit', busy: state.saving }, doc));
  form.addEventListener('submit', (event) => { event?.preventDefault?.(); controller.save({ firstName: firstName.input.value, lastName: lastName.input.value, phone: phone.input.value }); });
  const addressNote = node(doc, 'p', 'uw-profile-note', 'Saqlangan manzillar joriy DB kontraktida yo‘q; bu alohida keyingi feature sifatida qoladi.');
  form.append(addressNote);
  if (typeof onOpenSessions === 'function') form.append(createButton({ label: 'Faol sessiyalar', variant: 'secondary', onClick: () => onOpenSessions() }, doc));
  layout.append(form);

  const favorites = doc.createElement('section'); favorites.className = 'uw-profile-card'; favorites.append(node(doc, 'h2', '', 'Sevimlilar'));
  if (!state.favorites?.length) favorites.append(createStatePanel({ kind: 'empty', title: 'Sevimlilar bo‘sh', message: 'Yoqtirgan mahsulotlaringiz shu yerda ko‘rinadi.' }, doc));
  else {
    const list = doc.createElement('div'); list.className = 'uw-favorites-list';
    for (const favorite of state.favorites) {
      const row = doc.createElement('div'); row.className = 'uw-favorite-row';
      const info = doc.createElement('div'); info.append(node(doc, 'b', '', favorite.name || favorite.productName || `Mahsulot ${favorite.productId}`));
      if (favorite.createdAt) info.append(node(doc, 'small', '', `Qo‘shilgan: ${dateLabel(favorite.createdAt)}`));
      const actions = doc.createElement('div'); actions.className = 'uw-favorite-row__actions';
      if (typeof onOpenProduct === 'function') actions.append(createButton({ label: 'Ochish', variant: 'secondary', onClick: () => onOpenProduct(favorite.productId) }, doc));
      actions.append(createButton({ label: 'Olib tashlash', variant: 'ghost', busy: state.favoriteBusy === String(favorite.productId), onClick: () => controller.setFavorite(favorite.productId, false) }, doc));
      row.append(info, actions); list.append(row);
    }
    favorites.append(list);
  }
  layout.append(favorites); root.append(layout); return root;
}

export function createSessionsView({ controller, state = controller?.getState?.() || {} } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const root = doc.createElement('section'); root.className = 'uw-sessions';
  const header = doc.createElement('header'); header.className = 'uw-sessions__header';
  header.append(node(doc, 'div', '', 'Faol sessiyalar'), createButton({ label: state.signingOut ? 'Chiqilmoqda…' : 'Chiqish', variant: 'danger', busy: state.signingOut, onClick: () => controller.signOut() }, doc));
  root.append(header);
  if (state.status === 'loading') { root.append(createStatePanel({ kind: 'loading', title: 'Sessiyalar yuklanmoqda', message: 'Bir oz kuting.' }, doc)); return root; }
  if (state.error) root.append(createStatePanel({ kind: 'error', title: 'Sessiyalarni ochib bo‘lmadi', message: state.error.message || 'Qayta urinib ko‘ring.', actionLabel: 'Qayta urinish', onAction: () => controller.load() }, doc));
  const list = doc.createElement('div'); list.className = 'uw-session-list';
  for (const session of state.items || []) {
    const row = doc.createElement('article'); row.className = 'uw-session-row'; row.dataset.current = session.current ? 'true' : 'false';
    const info = doc.createElement('div'); info.append(node(doc, 'b', '', session.current ? 'Joriy qurilma' : (session.deviceLabel || 'Boshqa sessiya')), node(doc, 'small', '', `Oxirgi faollik: ${dateLabel(session.lastSeenAt || session.createdAt)}`));
    row.append(info);
    if (!session.current) row.append(createButton({ label: 'Bekor qilish', variant: 'secondary', busy: state.busySessionId === String(session.id), onClick: () => controller.revoke(session.id) }, doc));
    list.append(row);
  }
  if (!state.items?.length && state.status === 'ready') list.append(createStatePanel({ kind: 'empty', title: 'Faol sessiya topilmadi', message: 'Qayta kirish talab qilinishi mumkin.' }, doc));
  root.append(list);
  if ((state.items || []).some((row) => !row.current)) root.append(createButton({ label: 'Boshqa barcha sessiyalarni bekor qilish', variant: 'secondary', busy: state.busySessionId === '__all__', onClick: () => controller.revokeOthers() }, doc));
  return root;
}
