const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(key, handler) { this.listeners[key] = handler; }
}
const doc = { createElement(tag) { return new Node(tag); } };
const nodes = (node) => [node, ...(node.children || []).flatMap((child) => child instanceof Node ? nodes(child) : [])];

test('password tab explains either Mini App credential flow and keeps a configured bot shortcut', async () => {
  const previous = globalThis.APP_CONFIG;
  globalThis.APP_CONFIG = { USTORE_PLATFORM_BOT_USERNAME: 'ustoreuz_bot' };
  try {
    const { createLoginController, createLoginView } = await import(pathToFileURL(path.join(root, 'web/features/auth/login.js')).href);
    const controller = createLoginController({ authPort: {} });
    controller.setTab('password');
    const rendered = nodes(createLoginView({ controller }, doc).element);
    assert.ok(rendered.some((n) => n.tagName === 'FORM' && n.dataset.authPanel === 'password'));
    const help = rendered.find((n) => n.dataset.authHelp === 'credentials');
    assert.ok(help);
    const content = nodes(help).map((n) => n.textContent).join(' ');
    assert.match(content, /do‘kon botingiz yoki UStorE platforma botining Mini App/);
    assert.match(content, /Profil → Web login va parol/);
    assert.match(content, /Telegram orqali kirish ham ayni akkauntingizni ochadi/);
    const link = nodes(help).find((n) => n.tagName === 'A');
    assert.equal(link.href, 'https://t.me/ustoreuz_bot?start=credentials');
    assert.equal(link.rel, 'noopener noreferrer');
    assert.equal(link.target, '_blank');
  } finally { globalThis.APP_CONFIG = previous; }
});

test('login help does not generate an untrusted bot link', async () => {
  const previous = globalThis.APP_CONFIG;
  globalThis.APP_CONFIG = { USTORE_PLATFORM_BOT_USERNAME: 'evil/redirect?x=1' };
  try {
    const { createLoginController, createLoginView } = await import(pathToFileURL(path.join(root, 'web/features/auth/login.js')).href);
    const controller = createLoginController({ authPort: {} }); controller.setTab('password');
    const rendered = nodes(createLoginView({ controller }, doc).element);
    assert.ok(rendered.some((n) => n.dataset.authHelp === 'credentials'));
    assert.equal(rendered.some((n) => n.tagName === 'A'), false);
  } finally { globalThis.APP_CONFIG = previous; }
});

test('all Mini App profiles offer own credentials and only a verified shop Telegram identity can issue them', () => {
  const shop = read('ustore-shop-app.js');
  const platform = read('platform/platform-app.js');
  const platformApi = read('supabase/functions/platform-api/index.ts');
  const shopApi = read('supabase/functions/shop-api/index.ts');
  assert.match(shop, /const commonTailMenu = `[\s\S]*?Web login va parol[\s\S]*?openShopWebCredentials\(\)/);
  assert.match(shop, /callApi\('shop_web_credentials_open'/);
  assert.match(shop, /case 'WEB_CREDENTIALS': renderWebCredentialsPage\(container\)/);
  assert.match(shop, /function closePage\(\) \{\s*forgetWebCredentialSecret\(\)/);
  const resetBody = shop.slice(shop.indexOf('async function resetShopWebCredentials()'), shop.indexOf('async function changeShopWebLogin()'));
  assert.doesNotMatch(resetBody, /await fcConfirm\(/);
  assert.match(platform, /async function openWebCredentialsFromProfile\(\)[\s\S]*?callPlatformApi\('platform_prepare_web_credentials'/);
  assert.match(platform, /function closeWebCredentialFlow\(\)[\s\S]*?issuedPassword: null/);
  assert.match(platformApi, /verifyTelegramInitData\(initData, PLATFORM_BOT_TOKEN\)/);
  assert.match(platformApi, /TELEGRAM_REAUTH_ACTIONS[\s\S]*?platform_prepare_web_credentials[\s\S]*?authMode === "web"/);
  assert.match(shopApi, /resolveShopContext\(db, req, body, BOT_TOKEN_MASTER_KEY\)/);
  assert.match(read('supabase/functions/_shared/shop-context.ts'), /botToken = await decryptBotToken\(masterKey, tenant\.tokenCiphertext, tenant\.tokenIv\)[\s\S]*?verifyTelegramInitData\(String\(body\?\.initData \|\| ''\), botToken\)/);
  assert.match(shopApi, /async function shopWebCredentialStatus\(\)[\s\S]*?ensureTelegramAccount\(db, tgId, displayName\)/);
  assert.match(shopApi, /case "shop_web_credentials_issue"[\s\S]*?issueInitialCredentials\(db,/);
  assert.match(shopApi, /case "shop_web_credentials_reset"[\s\S]*?resetCredentialsForTelegram\(db, \{ accountId: status\.accountId/);
  assert.match(shopApi, /case "shop_web_credentials_change_login"[\s\S]*?changeLogin\(db, status\.accountId/);
  assert.match(shopApi, /if \(!sharedCustomerAction && !WEB_ADMIN_ACTIONS\.has\(String\(action \|\| ""\)\)\) return json\(\{ error: "web_action_not_allowed" \}, 403\)/);
  assert.match(shopApi, /if \(isWebAdminRequest\) return json\(\{ error: "forbidden:telegram_reauthentication_required" \}, 403\)/);
  assert.doesNotMatch(shopApi, /claimShopWebCredentialEntry/);
  assert.doesNotMatch(shop, /localStorage\.setItem\([^\n]*issuedPassword|sessionStorage\.setItem\([^\n]*issuedPassword/);
});
