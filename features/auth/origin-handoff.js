import { createButton, createStatePanel } from '../../components/ui.js';

const STORE_KEY = 'ustore:web:origin-handoff:v1';

function randomVerifier(cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.getRandomValues) throw new Error('Secure random generator kerak.');
  const bytes = new Uint8Array(32);
  cryptoRef.getRandomValues(bytes);
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function challengeFor(verifier, cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.subtle?.digest) throw new Error('Web Crypto SHA-256 kerak.');
  const digest = await cryptoRef.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let binary = '';
  for (const value of new Uint8Array(digest)) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function safeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\u0000-\u0020\u007f]/.test(value);
}

export function createOriginHandoffStore(storage = globalThis.sessionStorage) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) throw new TypeError('sessionStorage-compatible storage kerak');
  return Object.freeze({
    get() { try { return JSON.parse(storage.getItem(STORE_KEY) || 'null'); } catch (_) { return null; } },
    set(value) { storage.setItem(STORE_KEY, JSON.stringify(value)); },
    clear() { storage.removeItem(STORE_KEY); },
  });
}

export async function beginCustomDomainLogin({ authPort, returnTo = '/', store = createOriginHandoffStore(), cryptoRef = globalThis.crypto, onRedirect } = {}) {
  if (!authPort?.beginOriginHandoff) throw new TypeError('authPort.beginOriginHandoff kerak');
  if (!safeReturnTo(returnTo)) throw new Error('Qaytish yo‘li same-origin relative bo‘lishi kerak.');
  const codeVerifier = randomVerifier(cryptoRef);
  const codeChallenge = await challengeFor(codeVerifier, cryptoRef);
  const result = await authPort.beginOriginHandoff({ returnTo, codeChallenge });
  if (!result?.ok) return result;
  const { state, authorizeUrl, expiresAt, targetOrigin } = result.data || {};
  if (!state || !authorizeUrl || !expiresAt) return { ok: false, error: { code: 'CONTRACT_MISMATCH', message: 'Handoff javobi noto‘liq.', retryable: false } };
  store.set({ state, codeVerifier, expiresAt, targetOrigin: targetOrigin || null, fallbackOrigin: result.data?.fallbackOrigin || null, returnTo });
  onRedirect?.(authorizeUrl);
  return result;
}

export function createCentralOriginHandoffController({ authPort, state, onRedirect } = {}) {
  if (!authPort?.getOriginHandoff || !authPort?.authorizeOriginHandoff) throw new TypeError('Origin handoff auth port kerak');
  const handoffState = String(state || '');
  let snapshot = { status: 'idle', handoff: null, error: null, busy: false };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn({ ...snapshot }));
  const set = (patch) => { snapshot = { ...snapshot, ...patch }; emit(); return snapshot; };
  return Object.freeze({
    getState: () => ({ ...snapshot }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async load() {
      set({ busy: true, error: null });
      const result = await authPort.getOriginHandoff({ state: handoffState });
      if (!result.ok) { set({ busy: false, status: 'error', error: result.error }); return result; }
      set({ busy: false, status: result.data.status || 'pending', handoff: result.data, error: null });
      return result;
    },
    async authorize() {
      if (snapshot.busy) return null;
      set({ busy: true, error: null });
      const result = await authPort.authorizeOriginHandoff({ state: handoffState });
      if (!result.ok) {
        if (result.error?.code === 'DOMAIN_NOT_VERIFIED') {
          const refreshed = await authPort.getOriginHandoff({ state: handoffState });
          if (refreshed?.ok) set({ busy: false, status: refreshed.data.status || 'DOMAIN_UNAVAILABLE', handoff: refreshed.data, error: result.error });
          else set({ busy: false, error: result.error });
        } else set({ busy: false, error: result.error });
        return result;
      }
      set({ busy: false, status: 'authorized' });
      onRedirect?.(result.data.redirectUrl);
      return result;
    },
  });
}

export async function completeCustomDomainLogin({ authPort, url = globalThis.location?.href || '', store = createOriginHandoffStore(), historyRef = globalThis.history } = {}) {
  if (!authPort?.exchangeOriginHandoff) throw new TypeError('authPort.exchangeOriginHandoff kerak');
  const parsed = new URL(url, globalThis.location?.origin || 'https://invalid.example');
  const state = parsed.searchParams.get('state') || '';
  const code = parsed.searchParams.get('code') || '';
  // Remove short-lived secrets even on mismatch, expiry, network or domain failure.
  if (historyRef?.replaceState) {
    const clean = new URL(parsed.href);
    clean.searchParams.delete('state'); clean.searchParams.delete('code');
    historyRef.replaceState(historyRef.state || null, '', `${clean.pathname}${clean.search}${clean.hash}`);
  }
  const pending = store.get();
  if (!pending || pending.state !== state || !pending.codeVerifier || !code || pending.targetOrigin !== parsed.origin || !(Date.parse(pending.expiresAt) > Date.now())) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Login handoff ma’lumotlari mos emas.', retryable: false } };
  }
  const result = await authPort.exchangeOriginHandoff({ state, code, codeVerifier: pending.codeVerifier });
  if (!result.ok) {
    let validFallback = false;
    try { const origin = new URL(pending.fallbackOrigin); validFallback = origin.protocol === 'https:' && origin.origin === pending.fallbackOrigin; } catch (_) {}
    // A removed origin can fail CORS before the browser sees DOMAIN_NOT_VERIFIED.
    // Offer the previously server-issued fallback on network failure too.
    if (['DOMAIN_NOT_VERIFIED', 'NETWORK_ERROR'].includes(result.error?.code) && validFallback && safeReturnTo(pending.returnTo || '/')) {
      const fallbackUrl = new URL(pending.returnTo || '/', `${pending.fallbackOrigin}/`).toString();
      if (result.error?.code === 'DOMAIN_NOT_VERIFIED') store.clear();
      return { ...result, fallbackUrl };
    }
    return result;
  }
  store.clear();
  return result;
}

export function createCentralOriginHandoffView({ controller, state = controller?.getState?.() || {} } = {}, documentRef) {
  const doc = documentRef || globalThis.document;
  if (!doc?.createElement || !controller) throw new TypeError('DOM document va controller kerak');
  const root = doc.createElement('section'); root.className = 'uw-auth uw-origin-handoff'; root.dataset.feature = 'origin-handoff';
  const title = doc.createElement('h1'); title.textContent = 'Do‘konga xavfsiz kirish'; root.append(title);
  if (state.error) root.append(createStatePanel({ kind: 'error', title: 'Kirish davom etmadi', message: state.error.message || 'Qayta urinib ko‘ring.' }, doc));
  const handoff = state.handoff;
  if (handoff?.targetHostname) {
    const info = doc.createElement('p');
    info.textContent = `${handoff.shopName || 'UStorE do‘koni'} — ${handoff.targetHostname}`;
    root.append(info);
  }
  if (handoff?.status === 'EXPIRED' || handoff?.status === 'DOMAIN_UNAVAILABLE' || handoff?.status === 'CANCELLED' || handoff?.status === 'CONSUMED') {
    root.append(createStatePanel({ kind: 'error', title: 'Havola yaroqsiz', message: 'Kirishni do‘kon saytidan qayta boshlang.' }, doc));
    if (handoff?.fallbackUrl) {
      const fallback = doc.createElement('a'); fallback.href = handoff.fallbackUrl; fallback.className = 'uw-btn uw-btn--secondary';
      fallback.textContent = 'UStorE subdomenidan ochish'; fallback.rel = 'noopener noreferrer';
      root.append(fallback);
    }
    return { element: root };
  }
  root.append(createButton({ label: state.busy ? 'Tasdiqlanmoqda…' : 'Shu do‘konga qaytish', busy: state.busy, onClick: () => controller.authorize() }, doc));
  return { element: root };
}

export function createCustomDomainSignInController({ authPort, returnTo = '/', store = createOriginHandoffStore(), cryptoRef = globalThis.crypto, onRedirect } = {}) {
  let snapshot = { busy: false, error: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn({ ...snapshot }));
  const set = (patch) => { snapshot = { ...snapshot, ...patch }; emit(); return snapshot; };
  return Object.freeze({
    getState: () => ({ ...snapshot }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async begin() {
      if (snapshot.busy) return null;
      set({ busy: true, error: null });
      let result;
      try { result = await beginCustomDomainLogin({ authPort, returnTo, store, cryptoRef, onRedirect }); }
      catch (error) { result = { ok: false, error: { code: 'CAPABILITY_UNAVAILABLE', message: error?.message || 'Markaziy kirish oqimi mavjud emas.', retryable: false } }; }
      set({ busy: false, error: result?.ok ? null : result?.error || null });
      return result;
    },
  });
}

export function createCustomDomainSignInView({ controller, state = controller?.getState?.() || {} } = {}, documentRef) {
  const doc = documentRef || globalThis.document;
  if (!doc?.createElement || !controller) throw new TypeError('DOM document va controller kerak');
  const root = doc.createElement('section'); root.className = 'uw-auth uw-origin-signin'; root.dataset.feature = 'origin-signin';
  const title = doc.createElement('h1'); title.textContent = 'Kirish'; root.append(title);
  const copy = doc.createElement('p'); copy.textContent = 'Kirish UStorE’ning markaziy xavfsiz sahifasida tasdiqlanadi.'; root.append(copy);
  if (state.error) root.append(createStatePanel({ kind: 'error', title: 'Kirishni boshlab bo‘lmadi', message: state.error.message || 'Qayta urinib ko‘ring.' }, doc));
  root.append(createButton({ label: state.busy ? 'Ochilmoqda…' : 'UStorE orqali kirish', busy: state.busy, onClick: () => controller.begin() }, doc));
  return { element: root };
}

export function createOriginCallbackView({ result, onNavigate } = {}, documentRef) {
  const doc = documentRef || globalThis.document;
  if (!doc?.createElement) throw new TypeError('DOM document kerak');
  const root = doc.createElement('section'); root.className = 'uw-auth uw-origin-callback'; root.dataset.feature = 'origin-callback';
  if (result?.ok) {
    const panel = createStatePanel({ kind: 'success', title: 'Kirish yakunlandi', message: 'Do‘konga xavfsiz qaytishingiz mumkin.' }, doc);
    root.append(panel);
    const target = safeReturnTo(result.data?.returnTo || '/') ? (result.data?.returnTo || '/') : '/';
    root.append(createButton({ label: 'Do‘konga qaytish', onClick: () => onNavigate?.(target) }, doc));
    return { element: root };
  }
  root.append(createStatePanel({ kind: 'error', title: 'Kirish yakunlanmadi', message: result?.error?.message || 'Login handoff bajarilmadi.' }, doc));
  if (result?.fallbackUrl) {
    const fallback = doc.createElement('a'); fallback.href = result.fallbackUrl; fallback.className = 'uw-btn uw-btn--secondary';
    fallback.textContent = 'Standart subdomendan ochish'; fallback.rel = 'noopener noreferrer'; root.append(fallback);
  }
  return { element: root };
}

export { challengeFor as createPkceChallenge, randomVerifier as createPkceVerifier };
