import { fail, ok } from '../ports/result.js';
import { validatePasswordSignInInput } from '../ports/auth.js';
import { loadJsonFixture } from './fixture-loader.js';

function isSafeLocalReturnTo(value) {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\');
}

export function createMockAuthAdapter({ session = 'signedOut' } = {}) {
  let currentSession = session;
  const sessions = [{ id: 'session-demo-current', createdAt: '2026-09-20T08:00:00.000Z', lastSeenAt: '2026-09-22T05:00:00.000Z', current: true }];

  return {
    async getSession() {
      if (currentSession === 'expired') return loadJsonFixture('auth/session-expired.json');
      const file = currentSession === 'customer' ? 'auth/customer.json' : 'auth/signed-out.json';
      return ok(await loadJsonFixture(file));
    },
    async signInPassword(input) {
      if (!validatePasswordSignInInput(input)) return fail('VALIDATION_ERROR', 'Login va parolni kiriting.', { fieldErrors: { login: 'Loginni tekshiring.', password: 'Parolni kiriting.' } });
      if (input.login === 'rate-limited') return loadJsonFixture('auth/rate-limited.json');
      if (input.login !== 'demo.customer' || input.password !== 'DemoOnly-123!') return loadJsonFixture('auth/invalid-credentials.json');
      currentSession = 'customer';
      const fixture = await loadJsonFixture('auth/customer.json');
      return ok({ actor: fixture.actor });
    },
    async beginTelegramSignIn(input) {
      if (!input || !isSafeLocalReturnTo(input.returnTo)) return fail('VALIDATION_ERROR', 'Qaytish manzili noto‘g‘ri.');
      return ok({ redirectUrl: `https://auth.example/telegram?flow=demo&return=${encodeURIComponent(input.returnTo)}` });
    },
    async beginOfficialTelegramSignIn(input) {
      if (!input || !isSafeLocalReturnTo(input.returnTo)) return fail('VALIDATION_ERROR', 'Qaytish manzili noto‘g‘ri.');
      return ok({ redirectUrl: `https://auth.example/oidc?flow=demo&return=${encodeURIComponent(input.returnTo)}` });
    },
    async beginCredentialIssue(input) {
      if (!input || !['ISSUE', 'RESET'].includes(input.mode) || !isSafeLocalReturnTo(input.returnTo)) {
        return fail('VALIDATION_ERROR', 'Credential oqimi noto‘g‘ri.');
      }
      return ok({ redirectUrl: `https://auth.example/credentials?flow=demo&mode=${input.mode}&return=${encodeURIComponent(input.returnTo)}` });
    },
    async beginOriginHandoff(input) {
      if (!input || !isSafeLocalReturnTo(input.returnTo) || !/^[A-Za-z0-9_-]{43}$/.test(String(input.codeChallenge || ''))) {
        return fail('VALIDATION_ERROR', 'Origin handoff noto‘g‘ri.');
      }
      return ok({ state: 'demo-origin-state-abcdefghijklmnopqrstuvwxyz123456', authorizeUrl: 'https://auth.example/auth/handoff?state=demo-origin-state-abcdefghijklmnopqrstuvwxyz123456', expiresAt: '2026-09-22T21:00:00.000Z', targetOrigin: 'https://shop.example' });
    },
    async getOriginHandoff(input) {
      if (!input?.state) return fail('VALIDATION_ERROR', 'State kerak.');
      return ok({ status: 'PENDING', targetOrigin: 'https://shop.example', targetHostname: 'shop.example', shopName: 'Demo Shop', returnTo: '/', expiresAt: '2026-09-22T21:00:00.000Z' });
    },
    async authorizeOriginHandoff(input) {
      if (currentSession !== 'customer') return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
      if (!input?.state) return fail('VALIDATION_ERROR', 'State kerak.');
      return ok({ redirectUrl: `https://shop.example/auth/callback?state=${encodeURIComponent(input.state)}&code=demo_authorization_code_abcdefghijklmnopqrstuvwxyz`, expiresAt: '2026-09-22T21:00:00.000Z', targetOrigin: 'https://shop.example' });
    },
    async exchangeOriginHandoff(input) {
      if (!input?.state || !input?.code || !input?.codeVerifier) return fail('VALIDATION_ERROR', 'Handoff ma’lumotlari to‘liq emas.');
      currentSession = 'customer';
      return ok({ accountId: 'account-demo', session: { id: 'session-origin-demo', token: 'demo-session-token', expiresAt: '2026-10-22T21:00:00.000Z' }, returnTo: '/', shopId: 'shop-demo' });
    },
    async signOut() {
      currentSession = 'signedOut';
      return ok({ signedOut: true });
    },
    async listSessions() {
      if (currentSession !== 'customer') return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
      return ok({ items: structuredClone(sessions), nextCursor: null, total: sessions.length });
    },
    async revokeSession(input) {
      if (currentSession !== 'customer') return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
      if (!input?.sessionId) return fail('VALIDATION_ERROR', 'Session ID kerak.');
      return ok({ revoked: true });
    },
    async revokeAllSessions() {
      if (currentSession !== 'customer') return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
      return ok({ revokedCount: Math.max(0, sessions.length - 1) });
    },
  };
}
