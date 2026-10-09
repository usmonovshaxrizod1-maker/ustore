import { createButton, createCard, createTextField, createStatePanel } from '../../components/ui.js';

const AUTH_ERROR_COPY = Object.freeze({
  INVALID_CREDENTIALS: { title: 'Kirish amalga oshmadi', message: 'Login yoki parol noto‘g‘ri.' },
  RATE_LIMITED: { title: 'Urinishlar ko‘p', message: 'Birozdan keyin qayta urinib ko‘ring.' },
  SESSION_EXPIRED: { title: 'Sessiya tugagan', message: 'Qayta kirishingiz kerak.' },
  NETWORK_ERROR: { title: 'Tarmoq xatosi', message: 'Internet aloqasini tekshirib, qayta urinib ko‘ring.' },
  FORBIDDEN: { title: 'Kirishga ruxsat berilmadi', message: 'Bu sayt manzili Telegram orqali kirish uchun serverda ruxsat etilmagan.' },
  CAPABILITY_UNAVAILABLE: { title: 'Telegram orqali kirish yakunlanmadi', message: 'Telegram tasdiqlash xizmatini hozir ochib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.' },
  VALIDATION_ERROR: { title: 'Kirish havolasi yaroqsiz', message: 'Do‘kon sahifasiga qaytib, Telegram orqali kirishni qayta boshlang.' },
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

export function createLoginController({ authPort, returnTo = '/', initialTab = 'telegram', onSignedIn, onRedirect } = {}) {
  if (!authPort) throw new TypeError('authPort kerak');
  let draft = { login: '', password: '' };
  let state = { tab: initialTab === 'password' ? 'password' : 'telegram', panelOpen: initialTab !== 'chooser', busy: false, busyAction: null, passwordVisible: false, error: null, telegramPhase: 'idle', telegramAccount: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener({ ...state }));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return state; };

  return {
    getState: () => ({ ...state }),
    getDraft: () => ({ ...draft }),
    updateDraft(patch) { draft = { ...draft, ...patch }; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setTab(tab) { if (!['telegram', 'password'].includes(tab)) throw new Error('Unknown auth tab'); return set({ tab, panelOpen: true, error: null }); },
    togglePassword() { return set({ passwordVisible: !state.passwordVisible }); },
    async loadSession() {
      if (state.busy) return null;
      set({ busy: true, busyAction: 'session', error: null });
      const result = await authPort.getSession();
      if (!result.ok) { set({ busy: false, busyAction: null, error: mapAuthError(result.error) }); return result; }
      set({ busy: false, busyAction: null, error: null });
      return result;
    },
    async signInPassword({ login, password }) {
      if (state.busy) return null;
      set({ busy: true, busyAction: 'password', error: null });
      const result = await authPort.signInPassword({ login: String(login || '').trim(), password: String(password || '') });
      if (!result.ok) { set({ busy: false, busyAction: null, error: mapAuthError(result.error) }); return result; }
      set({ busy: false, busyAction: null, error: null });
      draft = { login: '', password: '' };
      onSignedIn?.(result.data);
      return result;
    },
    async signInTelegram() {
      if (state.busy) return null;
      set({ busy: true, busyAction: 'telegram', error: null, telegramPhase: 'starting', telegramAccount: null });
      const result = await authPort.beginOfficialTelegramSignIn({ returnTo });
      if (!result.ok) { set({ busy: false, busyAction: null, telegramPhase: 'idle', error: mapAuthError(result.error) }); return result; }
      set({ busy: false, busyAction: null, error: null, telegramPhase: 'redirecting' });
      onRedirect?.(result.data.redirectUrl);
      return result;
    },
    hasPendingTelegramSignIn() { return authPort.hasPendingTelegramSignIn?.() === true; },
    async resumeTelegramSignIn() {
      if (!authPort.hasPendingTelegramSignIn?.()) return null;
      if (state.telegramPhase === 'idle') set({ tab: 'telegram', telegramPhase: 'waiting', error: null });
      return this.checkTelegramSignIn();
    },
    async checkTelegramSignIn() {
      if (state.busy || state.telegramPhase === 'approved' || !authPort.hasPendingTelegramSignIn?.()) return null;
      if (typeof authPort.getTelegramSignInStatus !== 'function') return null;
      set({ busy: true, busyAction: 'telegram-check', error: null, telegramPhase: 'checking' });
      const result = await authPort.getTelegramSignInStatus();
      if (!result.ok) { set({ busy: false, busyAction: null, telegramPhase: 'waiting', error: mapAuthError(result.error) }); return result; }
      const challenge = result.data || {};
      if (challenge.status === 'APPROVED' && challenge.approvedAccountId && challenge.requiresExplicitConfirmation === true) {
        set({ busy: false, busyAction: null, telegramPhase: 'approved', telegramAccount: {
          id: challenge.approvedAccountId, name: challenge.displayName || 'Telegram foydalanuvchisi', hint: challenge.telegramHint || '',
        } });
      } else if (challenge.status === 'PENDING') {
        set({ busy: false, busyAction: null, telegramPhase: 'waiting', telegramAccount: null });
      } else {
        set({ busy: false, busyAction: null, telegramPhase: 'idle', telegramAccount: null, error: {
          title: 'Telegram tasdig‘i tugadi', message: 'Kirish so‘rovi muddati tugagan yoki yaroqsiz. Qayta boshlang.', code: 'SESSION_EXPIRED',
        } });
      }
      return result;
    },
    async confirmTelegramSignIn() {
      const accountId = state.telegramAccount?.id;
      if (state.busy || state.telegramPhase !== 'approved' || !accountId) return null;
      set({ busy: true, busyAction: 'telegram-confirm', error: null });
      const result = await authPort.completeTelegramSignIn({ approvedAccountId: accountId, confirmed: true });
      if (!result.ok) { set({ busy: false, busyAction: null, error: mapAuthError(result.error) }); return result; }
      set({ busy: false, busyAction: null, telegramPhase: 'idle', telegramAccount: null });
      onSignedIn?.(result.data);
      return result;
    },
  };
}

export function createLoginView({ controller, state = controller?.getState?.() || {}, initialLogin = '', shopBotUsername = '', locale = 'uz', singleMethod = false, platformStyle = false } = {}, documentRef) {
  const doc = getDocument(documentRef);
  if (!controller) throw new TypeError('controller kerak');
  const tr = (uz, ru) => locale === 'ru' ? ru : uz;
  const root = doc.createElement('section');
  root.className = 'uw-auth';
  root.dataset.feature = 'login';
  if (platformStyle) root.classList.add('uw-auth--platform-style');

  const authIcon = (name) => {
    const icons = {
      user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
      telegram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
      key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.8-8.8"/><path d="m15 8 2 2"/><path d="m17 6 2 2"/></svg>',
      chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    };
    return icons[name] || '';
  };

  // Task 16: mirror the Shop App guest-profile login visual language on ustr.uz.
  const heading = doc.createElement('div');
  heading.className = 'uw-auth__heading uw-auth-profile-card';
  const avatar = doc.createElement('span');
  avatar.className = 'uw-auth-profile-card__avatar';
  avatar.innerHTML = authIcon('user');
  const headingCopy = doc.createElement('div');
  headingCopy.className = 'uw-auth-profile-card__copy';
  const eyebrow = doc.createElement('div');
  eyebrow.className = 'uw-auth-profile-card__eyebrow';
  eyebrow.textContent = tr('Profil', 'Профиль');
  const title = doc.createElement('h1');
  title.textContent = tr('Profilga kirish', 'Войти в профиль');
  const subtitle = doc.createElement('p');
  subtitle.textContent = tr('Buyurtmalar, sevimlilar va shaxsiy ma’lumotlaringiz uchun tizimga kiring.', 'Войдите, чтобы открыть заказы, избранное и личные данные.');
  if (platformStyle) subtitle.textContent = tr('Do‘konlaringiz, to‘lovlar va shaxsiy ma’lumotlaringiz uchun tizimga kiring.', 'Войдите для доступа к вашим магазинам, платежам и личным данным.');
  headingCopy.append(eyebrow, title, subtitle);
  heading.append(avatar, headingCopy);

  const tabs = doc.createElement('div');
  tabs.className = 'uw-auth-tabs uw-auth-profile-menu';
  tabs.setAttribute('role', 'tablist');
  for (const [id, label, iconName, hint] of [
    ['telegram', tr('Telegram orqali kirish', 'Войти через Telegram'), 'telegram', tr('Telegram profilingiz bilan davom eting', 'Продолжить с профилем Telegram')],
    ['password', tr('Login va parol bilan kirish', 'Войти по логину и паролю'), 'key', tr('Mini App’dan olingan ma’lumotlar bilan', 'С данными, полученными в Mini App')],
  ]) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `uw-auth-profile-menu__row${state.tab === id && state.panelOpen ? ' is-active' : ''}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', state.tab === id && state.panelOpen ? 'true' : 'false');
    button.dataset.authTab = id;
    button.addEventListener('click', () => controller.setTab(id));
    const icon = doc.createElement('span'); icon.className = 'uw-auth-profile-menu__icon'; icon.innerHTML = authIcon(iconName);
    const copy = doc.createElement('span'); copy.className = 'uw-auth-profile-menu__copy';
    const rowTitle = doc.createElement('strong'); rowTitle.textContent = label;
    const rowHint = doc.createElement('small'); rowHint.textContent = hint;
    copy.append(rowTitle, rowHint);
    const chevron = doc.createElement('span'); chevron.className = 'uw-auth-profile-menu__chevron'; chevron.innerHTML = authIcon('chevron');
    button.append(icon, copy, chevron);
    tabs.append(button);
  }

  const body = doc.createElement('div');
  body.className = 'uw-auth__body';
  const inlineError = () => {
    if (!state.error) return null;
    const box = doc.createElement('div'); box.className = 'uw-auth-inline-error'; box.setAttribute('role','alert');
    const strong = doc.createElement('strong'); strong.textContent = state.error.title || 'Kirish amalga oshmadi';
    const msg = doc.createElement('p'); msg.textContent = state.error.message || 'Qayta urinib ko‘ring.';
    box.append(strong,msg); return box;
  };

  if (state.tab === 'telegram') {
    const telegramBody = doc.createElement('div'); telegramBody.className='uw-auth-telegram-body';
    telegramBody.append(createButton({ label: state.busyAction === 'telegram' ? tr('Telegram ochilmoqda…', 'Открывается Telegram…') : tr('Telegram’da davom etish', 'Продолжить через Telegram'), busy: state.busyAction === 'telegram', onClick: () => controller.signInTelegram() }, doc));
    const telegramError = inlineError(); if (telegramError) telegramBody.append(telegramError);
    const telegram = createCard({ title: tr('Telegram orqali kirish', 'Вход через Telegram'), description: tr('Telegram profilingiz bilan tasdiqlang. Tasdiqdan keyin saytga avtomatik qaytasiz.', 'Подтвердите вход в Telegram. Затем вы автоматически вернётесь на сайт.'), body: telegramBody }, doc);
    telegram.classList.add('uw-auth-profile-panel');
    telegram.dataset.authPanel = 'telegram';
    body.append(telegram);
  } else {
    const form = doc.createElement('form');
    form.className = 'uw-auth-form uw-auth-profile-panel';
    form.dataset.authPanel = 'password';
    const loginField = createTextField({ label: tr('Login', 'Логин'), name: 'login', value: controller.getDraft?.().login || initialLogin, autocomplete: 'username', required: true, error: state.error?.fieldErrors?.login || '' }, doc);
    const passwordField = createTextField({ label: tr('Parol', 'Пароль'), name: 'password', type: state.passwordVisible ? 'text' : 'password', value: controller.getDraft?.().password || '', autocomplete: 'current-password', required: true, error: state.error?.fieldErrors?.password || '' }, doc);
    loginField.input.addEventListener('input', () => controller.updateDraft?.({ login: loginField.input.value }));
    passwordField.input.addEventListener('input', () => controller.updateDraft?.({ password: passwordField.input.value }));
    const passwordRow = doc.createElement('div'); passwordRow.className = 'uw-auth-password-row';
    const reveal = createButton({ label: '', variant: 'ghost', onClick: () => controller.togglePassword() }, doc);
    reveal.innerHTML = state.passwordVisible
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c4.7 0 8.5 3.2 10 7a10.7 10.7 0 0 1-3.1 4.4"/><path d="M6.2 6.2A10.8 10.8 0 0 0 2 12c1.5 3.8 5.3 7 10 7a10.5 10.5 0 0 0 4.2-.9"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    reveal.setAttribute('aria-label', state.passwordVisible ? tr('Parolni yashirish', 'Скрыть пароль') : tr('Parolni ko‘rsatish', 'Показать пароль'));
    passwordRow.append(passwordField.element, reveal);
    const submit = createButton({ label: state.busyAction === 'password' ? tr('Tekshirilmoqda…', 'Проверка…') : tr('Kirish', 'Войти'), type: 'submit', busy: state.busyAction === 'password' }, doc);
    const passwordError = inlineError(); if (passwordError) form.append(passwordError);
    form.append(loginField.element, passwordRow, submit);
    form.addEventListener('submit', (event) => { event?.preventDefault?.(); controller.signInPassword({ login: loginField.input.value, password: passwordField.input.value }); });
    const helpBody = doc.createElement('div');
    helpBody.className = 'uw-auth-credential-help';
    const steps = doc.createElement('ol');
    for (const step of [
      shopBotUsername ? 'Shu do‘kon botiga /login yuboring yoki uning Mini App’ini oching.' : 'Telegramdagi do‘kon botingiz yoki UStorE platforma botining Mini App’ini oching.',
      'Mini App’da Profil → Web login va parol bo‘limini bosing.',
      'Tizim bergan login va parolni shu saytga kiriting.',
    ]) {
      const item = doc.createElement('li'); item.textContent = locale === 'ru' ? ({
        [shopBotUsername ? 'Shu do‘kon botiga /login yuboring yoki uning Mini App’ini oching.' : 'Telegramdagi do‘kon botingiz yoki UStorE platforma botining Mini App’ini oching.']: shopBotUsername ? 'Отправьте /login боту этого магазина или откройте его Mini App.' : 'Откройте Mini App бота магазина или платформы UStorE.',
        'Mini App’da Profil → Web login va parol bo‘limini bosing.': 'В Mini App откройте Профиль → Логин и пароль для сайта.',
        'Tizim bergan login va parolni shu saytga kiriting.': 'Введите полученные логин и пароль на этом сайте.',
      })[step] || step : step; steps.append(item);
    }
    const note = doc.createElement('p');
    note.textContent = tr('Parol faqat yaratilganda ko‘rsatiladi. Unutsangiz, botga /reset yuboring yoki Mini App’da yangisini yarating. O‘zingiz qo‘ygan parol o‘zgartirmaguningizcha saqlanadi. Telegram orqali kirish ham ayni akkauntingizni ochadi.', 'Пароль показывается только при создании. Если забыли его, отправьте боту /reset или задайте новый в Mini App. Ваш пароль хранится до следующего изменения. Вход через Telegram открывает тот же аккаунт.');
    helpBody.append(steps, note);
    const bot = String(shopBotUsername || globalThis.APP_CONFIG?.USTORE_PLATFORM_BOT_USERNAME || '').replace(/^@/, '');
    if (/^[A-Za-z0-9_]{5,32}$/.test(bot)) {
      const link = doc.createElement('a');
      link.className = 'uw-button uw-button--secondary uw-button--md';
      link.href = `https://t.me/${bot}?start=credentials`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = shopBotUsername ? tr('Do‘kon botini ochish ↗', 'Открыть бота магазина ↗') : tr('UStorE Mini App botini ochish ↗', 'Открыть бот UStorE ↗');
      helpBody.append(link);
    }
    const help = doc.createElement('details');
    const summary = doc.createElement('summary');
    summary.textContent = tr('Login va parolni qayerdan olaman?', 'Где взять логин и пароль?');
    help.append(summary, helpBody);
    help.dataset.authHelp = 'credentials';
    body.append(form, help);
  }

  if (singleMethod) root.append(heading, body);
  else { root.append(heading, tabs); if (!platformStyle || state.panelOpen) root.append(body); }
  return { element: root };
}
