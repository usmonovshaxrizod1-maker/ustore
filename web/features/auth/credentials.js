import { createButton, createCard, createTextField, createStatePanel } from '../../components/ui.js';

function safeLocalReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

export function createCredentialFlowController({ authPort, mode = 'ISSUE', returnTo = '/', onRedirect, onCancel } = {}) {
  if (!authPort) throw new TypeError('authPort kerak');
  if (!['ISSUE', 'RESET'].includes(mode)) throw new TypeError('mode ISSUE yoki RESET bo‘lishi kerak');
  if (!safeLocalReturnTo(returnTo)) throw new TypeError('returnTo same-origin relative path bo‘lishi kerak');
  let state = { mode, phase: 'idle', error: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn({ ...state }));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return state; };
  async function start() {
    if (state.phase === 'starting') return null;
    set({ phase: 'starting', error: null });
    const result = await authPort.beginCredentialIssue({ mode, returnTo });
    if (!result.ok) { set({ phase: 'error', error: result.error }); return result; }
    set({ phase: 'waiting', error: null });
    onRedirect?.(result.data.redirectUrl);
    return result;
  }
  return {
    getState: () => ({ ...state }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start,
    retry: start,
    cancel() { set({ phase: 'cancelled', error: null }); onCancel?.(); },
    markReturned() { return set({ phase: 'returned', error: null }); },
  };
}

export function createCredentialFlowView({ controller, state = controller?.getState?.() || {} } = {}, documentRef = globalThis.document) {
  if (!documentRef?.createElement) throw new Error('Credential UI uchun DOM kerak');
  if (!controller) throw new TypeError('controller kerak');
  const doc = documentRef;
  const root = doc.createElement('section'); root.className = 'uw-auth uw-credential-flow'; root.dataset.feature = 'credential-flow';
  const isReset = state.mode === 'RESET';
  const body = doc.createElement('div'); body.className = 'uw-auth__body';

  if (state.phase === 'error') {
    body.append(createStatePanel({ kind: 'error', title: 'Oqimni boshlab bo‘lmadi', message: state.error?.message || 'Qayta urinib ko‘ring.' }, doc));
  } else if (state.phase === 'waiting') {
    body.append(createStatePanel({ kind: 'empty', title: 'Telegram tasdig‘i kutilmoqda', message: 'Telegram oynasida amaliyotni yakunlang, so‘ng saytga qayting.' }, doc));
  } else if (state.phase === 'returned') {
    body.append(createStatePanel({ kind: 'empty', title: 'Qaytish qabul qilindi', message: 'Sessiya holati serverdan tekshirilgach davom etiladi.' }, doc));
  }

  const actions = doc.createElement('div'); actions.className = 'uw-card__actions';
  actions.append(createButton({ label: state.phase === 'error' ? 'Qayta urinish' : 'Telegram’da davom etish', busy: state.phase === 'starting', onClick: () => state.phase === 'error' ? controller.retry() : controller.start() }, doc));
  actions.append(createButton({ label: 'Bekor qilish', variant: 'ghost', onClick: () => controller.cancel() }, doc));
  body.append(actions);
  const card = createCard({
    title: isReset ? 'Parolni tiklash' : 'Login-parol olish',
    description: isReset
      ? 'Yangi parol faqat tasdiqlangan Telegram oqimida server tomonidan yaratiladi.'
      : 'Boshlang‘ich login va parol tasdiqlangan Telegram oqimida server tomonidan beriladi.',
    body,
  }, doc);
  root.append(card);
  return { element: root };
}

export function createCredentialManagementController({ changeLogin, copyText } = {}) {
  let state = { busy: false, copyStatus: 'idle', error: null };
  const getState = () => ({ ...state });
  return {
    getState,
    async submitLogin(login) {
      if (typeof changeLogin !== 'function') {
        state = { ...state, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'Login almashtirish live auth adapter tayyor bo‘lganda yoqiladi.' } };
        return { ok: false, error: state.error };
      }
      state = { ...state, busy: true, error: null };
      const result = await changeLogin({ login: String(login || '').trim() });
      state = { ...state, busy: false, error: result.ok ? null : result.error };
      return result;
    },
    async copyIssuedPassword(value) {
      if (!value || typeof copyText !== 'function') {
        state = { ...state, copyStatus: 'error' };
        return false;
      }
      try { await copyText(value); state = { ...state, copyStatus: 'copied' }; return true; }
      catch (_) { state = { ...state, copyStatus: 'error' }; return false; }
    },
  };
}

export function createCredentialManagementView({ login = '', issuedPassword = null, controller = createCredentialManagementController(), canChangeLogin = false } = {}, documentRef = globalThis.document) {
  if (!documentRef?.createElement) throw new Error('Credential management UI uchun DOM kerak');
  const doc = documentRef;
  const root = doc.createElement('section'); root.className = 'uw-credential-management'; root.dataset.feature = 'credential-management';
  const loginField = createTextField({ label: 'Login', value: login, autocomplete: 'username', disabled: !canChangeLogin, help: canChangeLogin ? 'Saqlash live auth adapter orqali bajariladi.' : 'Login almashtirish live auth capability tayyor bo‘lganda yoqiladi.' }, doc);
  root.append(loginField.element);
  const saveLogin = createButton({ label: 'Loginni saqlash', variant: 'secondary', disabled: !canChangeLogin, onClick: () => controller.submitLogin(loginField.input.value) }, doc);
  root.append(saveLogin);
  if (issuedPassword != null) {
    const passwordField = createTextField({ label: 'Server bergan yangi parol', value: issuedPassword, type: 'text', autocomplete: 'new-password', disabled: true, help: 'Bu qiymat brauzerda generatsiya qilinmagan.' }, doc);
    passwordField.input.dataset.serverIssued = 'true';
    const copy = createButton({ label: controller.getState().copyStatus === 'copied' ? 'Nusxalandi' : 'Parolni nusxalash', variant: 'secondary', onClick: () => controller.copyIssuedPassword(issuedPassword) }, doc);
    root.append(passwordField.element, copy);
  }
  return { element: root, loginInput: loginField.input };
}
