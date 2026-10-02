import process from 'node:process';
const nativeFetch = globalThis.fetch;
const fetch = (url, options={}) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password) throw Error('https_url_without_credentials_required');
  return nativeFetch(u, {...options, redirect:'error', signal:AbortSignal.timeout(15000)});
};

const dryRun=process.argv.includes('--dry-run');
const base=(process.env.USTORE_STAGING_WEB_URL||'').trim().replace(/\/$/,'');
const platformApi=(process.env.USTORE_STAGING_PLATFORM_API_URL||'').trim();
const expectedHost=(process.env.USTORE_STAGING_EXPECTED_HOST||'').trim();
if (dryRun) {
  console.log('ASTRA 10a staging smoke dry-run only. Required:');
  console.log('- USTORE_STAGING_WEB_URL');
  console.log('- USTORE_STAGING_PLATFORM_API_URL');
  console.log('- optional USTORE_STAGING_EXPECTED_HOST');
  console.log('No network request was made.');
  process.exit(0);
}
if (!base || !platformApi) {
  console.error('staging_not_configured: set USTORE_STAGING_WEB_URL and USTORE_STAGING_PLATFORM_API_URL');
  process.exit(2);
}
const checks=[];
async function check(name, fn) {
  try { const detail=await fn(); checks.push({name,ok:true,detail}); }
  catch (e) { checks.push({name,ok:false,error:String(e?.message||e)}); }
}
await check('platform_html', async()=>{
  const r=await fetch(`${base}/platform`,{redirect:'manual'});
  if (r.status<200 || r.status>=300) throw new Error(`http_${r.status}`);
  if (!(r.headers.get('content-type') || '').includes('text/html')) throw Error('html_content_type_required');
  const text=await r.text();
  if (!/UStorE/i.test(text)) throw new Error('ustore_marker_missing');
  return {status:r.status,contentType:r.headers.get('content-type')};
});
await check('security_headers', async()=>{
  const r=await fetch(`${base}/platform`,{redirect:'manual'});
  const csp=r.headers.get('content-security-policy');
  const xcto=r.headers.get('x-content-type-options');
  if (!csp) throw new Error('csp_header_missing');
  if ((xcto||'').toLowerCase()!=='nosniff') throw new Error('x_content_type_options_missing');
  return {csp:true,xContentTypeOptions:xcto};
});
await check('public_tariffs', async()=>{
  const r=await fetch(platformApi,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'platform_public_catalog',payload:{}})});
  if (!r.ok) throw new Error(`http_${r.status}`);
  const j=await r.json();
  if (!Array.isArray(j?.tariffs)) throw new Error('tariffs_array_missing');
  const forbidden=['shops','subscriptions','actor','role','telegram_user_id','tg_id','isSuperAdmin'];
  for (const k of forbidden) if (k in j) throw new Error(`private_field_exposed:${k}`);
  return {status:r.status,tariffCount:j.tariffs.length};
});
if (expectedHost) await check('expected_host', async()=>{
  const u=new URL(base);
  if (u.hostname!==expectedHost) throw new Error(`host_mismatch:${u.hostname}`);
  return {hostname:u.hostname};
});
console.log(JSON.stringify({target:base,checks},null,2));
if (checks.some(c=>!c.ok)) process.exit(1);
