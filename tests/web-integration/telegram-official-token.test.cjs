const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, createSign, createHash } = require('node:crypto');
const { verifyTelegramIdToken, beginOfficialTelegramLogin, exchangeOfficialTelegramLogin } = require('../../supabase/functions/_shared/telegram-oidc.ts');

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'telegram-key', use: 'sig', alg: 'RS256' };
const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const nonce = 'a'.repeat(43);
const clientId = '123456789';
function signedToken(patch = {}, header = { alg: 'RS256', kid: 'telegram-key' }) {
  const claims = { iss: 'https://oauth.telegram.org', aud: clientId, sub: 'opaque-telegram-subject',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
    id: 1752760704, name: 'Fitcore Owner', nonce, ...patch };
  const input = `${b64(header)}.${b64(claims)}`;
  const signature = createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url');
  return `${input}.${signature}`;
}
const keysFetch = async (url) => {
  assert.equal(url, 'https://oauth.telegram.org/.well-known/jwks.json');
  return { ok: true, json: async () => ({ keys: [jwk] }) };
};

test('Telegram RS256 ID token binds numeric Mini App ID, audience, issuer, expiration and nonce', async () => {
  const verified = await verifyTelegramIdToken(signedToken(), clientId, hash(nonce), keysFetch);
  assert.deepEqual(verified, { telegramUserId: '1752760704', displayName: 'Fitcore Owner' });
  for (const claim of [
    { aud: 'another-app' }, { iss: 'https://evil.example' }, { nonce: 'wrong' },
    { exp: Math.floor(Date.now() / 1000) - 1 }, { id: 'not-a-telegram-id' },
  ]) {
    await assert.rejects(verifyTelegramIdToken(signedToken(claim), clientId, hash(nonce), keysFetch), /VALIDATION_ERROR/);
  }
  await assert.rejects(verifyTelegramIdToken(signedToken({}, { alg: 'none', kid: 'telegram-key' }), clientId, hash(nonce), keysFetch), /VALIDATION_ERROR/);
  const altered = signedToken().split('.'); altered[1] = b64({ id: 999999999, nonce });
  await assert.rejects(verifyTelegramIdToken(altered.join('.'), clientId, hash(nonce), keysFetch), /VALIDATION_ERROR/);
});

test('authorization stays bound to the approved browser verifier and exact redirect URI', async () => {
  let inserted;
  const fakeDb = {
    from(table) {
      assert.equal(table, 'web_telegram_oidc_challenges');
      return {
        async insert(row) { inserted = row; return { error: null }; },
        select() { return { eq() { return { eq() { return { async maybeSingle() { return { data: inserted, error: null }; } }; } }; } }; },
      };
    },
  };
  const challenge = await beginOfficialTelegramLogin(fakeDb, {
    origin: 'https://usmonovshaxrizod1-maker.github.io', returnTo: '/platform/app',
    codeChallenge: 'z'.repeat(43), clientId,
  });
  const url = new URL(challenge.redirectUrl);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://usmonovshaxrizod1-maker.github.io/ustore/web/');
  assert.equal(url.searchParams.get('nonce') && hash(url.searchParams.get('nonce')), inserted.nonce_hash);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const central = await beginOfficialTelegramLogin(fakeDb, {
    origin: 'https://ustr.uz', returnTo: '/platform/app',
    codeChallenge: 'z'.repeat(43), clientId,
  });
  assert.equal(new URL(central.redirectUrl).searchParams.get('redirect_uri'), 'https://ustr.uz/');
  let requested = 0;
  // The fake row deliberately has no matching state lookup because the real
  // server query hashes both state and browser verifier. PKCE mismatch is
  // rejected before contacting Telegram even with a forged callback code.
  const rejected = await exchangeOfficialTelegramLogin(fakeDb, {
    origin: 'https://usmonovshaxrizod1-maker.github.io', state: challenge.state,
    browserVerifier: challenge.browserVerifier, code: 'fake-code', codeVerifier: 'x'.repeat(43),
    clientId, clientSecret: 'test-secret',
  }, async () => { requested++; throw Error('unexpected network'); });
  assert.equal(rejected.ok, false);
  assert.equal(requested, 0);
  await assert.rejects(beginOfficialTelegramLogin(fakeDb, {
    origin: 'https://evil.example', returnTo: '//evil.example', codeChallenge: 'z'.repeat(43), clientId,
  }), /VALIDATION_ERROR/);
});
