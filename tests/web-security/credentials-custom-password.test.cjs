const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Mini Apps auto-issue first credentials and expose verified custom password changes', () => {
  const helper=fs.readFileSync('supabase/functions/_shared/web-auth.ts','utf8');
  const shop=fs.readFileSync('supabase/functions/shop-api/index.ts','utf8');
  const platform=fs.readFileSync('supabase/functions/platform-api/index.ts','utf8');
  const shopUi=fs.readFileSync('ustore-shop-app.js','utf8');
  const platformUi=fs.readFileSync('platform/platform-app.js','utf8');
  assert.match(helper,/Array\.from\(password\)\.length >= 6 && bytes <= 72/);
  assert.match(helper,/setCredentialsPasswordForTelegram/);
  assert.match(helper,/insertError\?\.code[\s\S]*?23505[\s\S]*?account_id[\s\S]*?maybeSingle/);
  assert.match(shop,/case "shop_web_credentials_open"[\s\S]*?issueInitialCredentials/);
  assert.match(platform,/case "platform_prepare_web_credentials"[\s\S]*?issueInitialCredentials/);
  assert.match(shop,/case "shop_web_credentials_set_password"[\s\S]*?shopWebCredentialStatus\(\)[\s\S]*?setCredentialsPasswordForTelegram/);
  assert.doesNotMatch(shop,/claimShopWebCredentialEntry/);
  assert.match(platform,/case "platform_set_web_password"[\s\S]*?claimCredentialEntry[\s\S]*?setCredentialsPasswordForTelegram/);
  for(const ui of [shopUi,platformUi]) {
    assert.match(ui,/autocomplete="new-password"/);
    assert.match(ui,/minlength="6"/);
    assert.match(ui,/Parolni (?:almashtirish|saqlash)/);
  }
});

test('domain UI offers own-domain connection and explicit free-subdomain change path', () => {
  const ui=fs.readFileSync('web/features/domains/domains.js','utf8');
  const api=fs.readFileSync('supabase/functions/shop-api/index.ts','utf8');
  const shared=fs.readFileSync('supabase/functions/_shared/shop-domains.ts','utf8');
  assert.match(ui,/O‘z domenimni ulash/);
  assert.match(ui,/Subdomenni almashtirish/);
  assert.match(ui,/Bu subdomen band\. Boshqa nom tanlang\./);
  assert.match(api,/case "domains_change_slug"/);
  assert.match(shared,/ustore_change_shop_subdomain/);
});

test('shop bot only discloses a newly issued password in a private Telegram chat', () => {
  const api = fs.readFileSync('supabase/functions/shop-api/index.ts', 'utf8');
  const start = api.indexOf('const isLoginCommand =');
  const end = api.indexOf('if (chatId && isStartCommand && webhookShopRow.status', start);
  const handler = api.slice(start, end);
  assert.match(handler, /message\?\.chat\?\.type !== "private"/);
  assert.match(handler, /String\(chatId\) !== String\(message\?\.from\?\.id/);
  assert.match(handler, /isResetCommand[\s\S]*?resetCredentialsForTelegram/);
  assert.match(handler, /existing \? null : await issueInitialCredentials/);
  assert.match(handler, /issued\?\.password \?/);
  assert.doesNotMatch(handler, /password_hash/);
});


