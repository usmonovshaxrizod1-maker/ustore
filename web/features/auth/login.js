import { createButton, createCard, createTextField, createStatePanel } from '../../components/ui.js';

const AUTH_ERROR_COPY = Object.freeze({
  INVALID_CREDENTIALS: { title: 'Kirish amalga oshmadi', message: 'Login yoki parol noto‘g‘ri.' },
  RATE_LIMITED: { title: 'Urinishlar ko‘p', message: 'Birozdan keyin qayta urinib ko‘ring.' },
  SESSION_EXPIRED: { title: 'Sessiya tugagan', message: 'Qayta kirishingiz kerak.' },
  NETWORK_ERROR: { title: 'Tarmoq xatosi', message: 'Internet aloqasini tekshirib, qayta urinib ko‘ring.' },
  CAPABILITY_UNAVAILABLE: { title: 'Hozircha mavjud emas', message: 'Bu kirish usuli vaqtincha mavjud emas.' },
});

function getDocument(documentRef) {
  const doc = documentRef ?? globalThis.document;
  if (!doc?.createElement) throw new Error('Auth UI uchun DOM document kerak.');
  return doc;
}

export function mapAuthError(error) {
  if (!error) return null;
  const base = AUTH_ERROR_COPY[error.code] || { title: 'Kirish amalga oshmadi', message: 'Kutilmagan xato yuz berdi. Qayta urinib ko‘ring.' };
  return { ...base, code: error.code || 'UNKNOWN', fieldErrors: error.fieldErrors || {}, requestId: error.requestId || null, retryable: error.retryable === true };
}

export function createLoginController({ authPort, returnTo = '/', onSignedIn, onRedirect } = {}) {
  if (!authPort) throw new TypeError('authPort kerak');
  let draft = { login: '', password: '' };
  let state = { tab: 'telegram', busy: false, passwordVisible: false, error: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener({ ...state }));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return state; };

  return {
    getState: () => ({ ...state }),
    getDraft: () => ({ ...draft }),
    updateDraft(patch) { draft = { ...draft, ...patch }; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setTab(tab) { if (!['telegram', 'password'].includes(tab)) throw new Error('Unknown auth tab'); return set({ tab, error: null }); },
    togglePassword() { return set({ passwordVisible: !state.passwordVisible }); },
    async loadSession() {
      if (state.busy) return null;
      set({ busy: true, error: null });
      const result = await authPort.getSession();
      if (!result.ok) { set({ busy: false, error: mapAuthError(result.error) }); return result; }
      set({ busy: false, error: null });
      return result;
    },
    async signInPassword({ login, password }) {
      if (state.busy) return null;
      set({ busy: true, error: null });
      const result = await authPort.signInPassword({ login: String(login || '').trim(), password: String(password || '') });
      if (!result.ok) { set({ busy: false, error: mapAuthError(result.error) }); return result; }
      set({ busy: false, error: null });
      draft = { login: '', password: '' };
      onSignedIn?.(result.data);
      return result;
    },
    async signInTelegram() {
      if (state.busy) return null;
      set({ busy: true, error: null });
      const result = await authPort.beginTelegramSignIn({ returnTo });
      if (!result.ok) { set({ busy: false, error: mapAuthError(result.error) }); return result; }
      set({ busy: false, error: null });
      onRedirect?.(result.data.redirectUrl);
      return result;
    },
  };
}

export function createLoginView({ controller, state = controller?.getState?.() || {}, initialLogin = '' } = {}, documentRef) {
  const doc = getDocument(documentRef);
  if (!controller) throw new TypeError('controller kerak');
  const root = doc.createElement('section');
  root.className = 'uw-auth';
  root.dataset.feature = 'login';

  const heading = doc.createElement('div');
  heading.className = 'uw-auth__heading';
  const title = doc.createElement('h1'); title.textContent = 'UStorE’ga kirish';
  const subtitle = doc.createElement('p'); subtitle.textContent = 'Do‘koningiz yoki xarid profilingizga xavfsiz kiring.';
  heading.append(title, subtitle);

  const tabs = doc.createElement('div');
  tabs.className = 'uw-auth-tabs';
  tabs.setAttribute('role', 'tablist');
  for (const [id, label] of [['telegram', 'Telegram orqali'], ['password', 'Login va parol']]) {
    const button = createButton({ label, variant: state.tab === id ? 'primary' : 'secondary', onClick: () => controller.setTab(id) }, doc);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', state.tab === id ? 'true' : 'false');
    button.dataset.authTab = id;
    tabs.append(button);
  }

  const body = doc.createElement('div');
  body.className = 'uw-auth__body';
  if (state.error) {
    body.append(createStatePanel({ kind: 'error', title: state.error.title, message: state.error.message }, doc));
  }

  if (state.tab === 'telegram') {
    const telegramAction = createButton({ label: state.busy ? 'Ochilmoqda…' : 'Telegram’da davom etish', busy: state.busy, onClick: () => controller.signInTelegram() }, doc);
    const telegram = createCard({ title: 'Telegram orqali kirish', description: 'Tasdiqlash UStorE’ning markaziy Telegram oqimida bajariladi.', body: telegramAction }, doc);
    telegram.dataset.authPanel = 'telegram';
    body.append(telegram);
  } else {
    const form = doc.createElement('form');
    form.className = 'uw-auth-form';
    form.dataset.authPanel = 'password';
    const loginField = createTextField({ label: 'Login', name: 'login', value: controller.getDraft?.().login || initialLogin, autocomplete: 'username', required: true, error: state.error?.fieldErrors?.login || '' }, doc);
    const passwordField = createTextField({ label: 'Parol', name: 'password', type: state.passwordVisible ? 'text' : 'password', value: controller.getDraft?.().password || '', autocomplete: 'current-password', required: true, error: state.error?.fieldErrors?.password || '' }, doc);
    loginField.input.addEventListener('input', () => controller.updateDraft?.({ login: loginField.input.value }));
    passwordField.input.addEventListener('input', () => controller.updateDraft?.({ password: passwordField.input.value }));
    const passwordRow = doc.createElement('div'); passwordRow.className = 'uw-auth-password-row';
    passwordRow.append(passwordField.element, createButton({ label: state.passwordVisible ? 'Yashirish' : 'Ko‘rsatish', variant: 'ghost', onClick: () => controller.togglePassword() }, doc));
    const submit = createButton({ label: state.busy ? 'Tekshirilmoqda…' : 'Kirish', type: 'submit', busy: state.busy }, doc);
    form.append(loginField.element, passwordRow, submit);
    form.addEventListener('submit', (event) => { event?.preventDefault?.(); controller.signInPassword({ login: loginField.input.value, password: passwordField.input.value }); });
    body.append(form);
  }

  root.append(heading, tabs, body);
  return { element: root };
}
