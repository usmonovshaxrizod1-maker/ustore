const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/112_managed_subdomains_live_and_identity_consistency.sql','utf8');
const helper = fs.readFileSync('supabase/functions/_shared/shop-domains.ts','utf8');
const platform = fs.readFileSync('supabase/functions/platform-api/index.ts','utf8');

test('112 replaces opaque allocator hashes with readable numeric suffixes for old and new shops', () => {
  assert.match(migration, /v_attempt=0 then v_base[\s\S]*v_attempt\+1/);
  assert.doesNotMatch(migration, /gen_random_uuid\(\).*substr/s);
  assert.match(migration, /\[0-9a-f\]\{10\}/);
  assert.match(migration, /update public\.shop_domains set hostname=v_candidate\|\|'\.ustr\.uz'/);
});

test('managed wildcard subdomains become ACTIVE+routing_ready for existing and future shops', () => {
  assert.match(migration, /create or replace function public\.ustore_activate_shop_subdomain/);
  assert.match(migration, /routing_ready=true,status='ACTIVE'/);
  assert.match(migration, /where d\.shop_id=s\.id and d\.kind='SUBDOMAIN' and d\.hostname like '%\.ustr\.uz'/);
  assert.match(platform, /USTORE_WILDCARD_READY/);
  assert.match(platform, /ustore_activate_shop_subdomain/);
  assert.match(helper, /routing_ready: true/);
  assert.match(helper, /ustore_activate_shop_subdomain/);
});

test('112 reconciles historic Telegram-linked account ownership so web and Mini App share history', () => {
  assert.match(migration, /update public\.app_users u set account_id=i\.account_id/);
  assert.match(migration, /update public\.orders x set account_id=u\.account_id/);
  assert.match(migration, /update public\.user_favorites x set account_id=u\.account_id/);
  assert.match(migration, /update public\.cart_logs x set account_id=u\.account_id/);
});
