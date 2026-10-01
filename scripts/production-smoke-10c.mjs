import process from 'node:process';
const nativeFetch = globalThis.fetch;
const fetch = (url, options={}) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password) throw Error('https_url_without_credentials_required');
  return nativeFetch(u, {...options, redirect:'error', signal:AbortSignal.timeout(15000)});
};

const platformBase = (process.env.USTORE_PRODUCTION_WEB_URL || '').trim().replace(/\/$/, '');
const platformApi = (process.env.USTORE_PRODUCTION_PLATFORM_API_URL || '').trim();
const shopUrl = (process.env.USTORE_PRODUCTION_SHOP_URL || '').trim().replace(/\/$/, '');
const customDomainUrl = (process.env.USTORE_PRODUCTION_CUSTOM_DOMAIN_URL || '').trim().replace(/\/$/, '');
const miniAppUrl = (process.env.USTORE_PRODUCTION_MINI_APP_URL || '').trim().replace(/\/$/, '');
const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  console.log('10c production smoke dry-run only. Network checks require:');
  console.log('- USTORE_PRODUCTION_WEB_URL');
  console.log('- USTORE_PRODUCTION_PLATFORM_API_URL');
  console.log('- USTORE_PRODUCTION_SHOP_URL');
  console.log('- USTORE_PRODUCTION_CUSTOM_DOMAIN_URL');
  console.log('- USTORE_PRODUCTION_MINI_APP_URL');
  console.log('Authenticated checkout/login/OWNER/STAFF evidence must be captured separately in ASTRA_10C_EXTERNAL_EVIDENCE.json.');
  process.exit(0);
}

if (!platformBase || !platformApi || !shopUrl || !customDomainUrl || !miniAppUrl) {
  console.error('10c_production_smoke_not_configured');
  process.exit(2);
}

const checks = [];
async function check(name, fn) {
  try { checks.push({ name, ok: true, detail: await fn() }); }
  catch (e) { checks.push({ name, ok: false, error: String(e?.message || e) }); }
}
async function fetchHtml(url) {
  const r = await fetch(url, { redirect: 'manual' });
  if (r.status < 200 || r.status >= 300) throw new Error(`http_${r.status}`);
  if (!(r.headers.get('content-type') || '').includes('text/html')) throw Error('html_content_type_required');
  const body = await r.text();
  if (!/UStorE/i.test(body)) throw new Error('ustore_marker_missing');
  return { r, body };
}

await check('platform_html', async () => {
  const { r } = await fetchHtml(`${platformBase}/platform`);
  return { status: r.status, contentType: r.headers.get('content-type') };
});

await check('security_headers', async () => {
  const r = await fetch(`${platformBase}/platform`, { redirect: 'manual' });
  const csp = r.headers.get('content-security-policy') || '';
  const xcto = (r.headers.get('x-content-type-options') || '').toLowerCase();
  if (!csp || !/frame-ancestors/i.test(csp)) throw new Error('csp_missing_or_incomplete');
  if (xcto !== 'nosniff') throw new Error('x_content_type_options_missing');
  return { csp: true, xContentTypeOptions: xcto };
});

await check('public_tariffs', async () => {
  const r = await fetch(platformApi, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'platform_public_catalog', payload: {} }),
  });
  if (!r.ok) throw new Error(`http_${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j?.tariffs)) throw new Error('tariffs_array_missing');
  const forbidden = ['shops','subscriptions','applications','actor','role','telegram_user_id','tg_id','isSuperAdmin'];
  for (const key of forbidden) if (key in j) throw new Error(`private_field_exposed:${key}`);
  return { tariffCount: j.tariffs.length };
});

await check('shop_catalog_html', async () => {
  const { r } = await fetchHtml(shopUrl);
  return { status: r.status, hostname: new URL(shopUrl).hostname };
});

await check('custom_domain_tls_html', async () => {
  const u = new URL(customDomainUrl);
  if (u.protocol !== 'https:') throw new Error('custom_domain_not_https');
  const { r } = await fetchHtml(customDomainUrl);
  return { status: r.status, hostname: u.hostname, https: true };
});

await check('mini_app_html', async () => {
  const { r } = await fetchHtml(miniAppUrl);
  return { status: r.status, hostname: new URL(miniAppUrl).hostname };
});

console.log(JSON.stringify({ task: 'ASTRA-10c', checks }, null, 2));
if (checks.some((c) => !c.ok)) process.exit(1);
