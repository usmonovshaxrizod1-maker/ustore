const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync('supabase/migrations/111_backfill_existing_shop_subdomains.sql', 'utf8');

test('111 backfills one stable subdomain for existing resumable shops only', () => {
  assert.match(sql, /status in \('PROVISIONING','ACTIVE','DISABLED','FROZEN'\)/);
  assert.match(sql, /not exists \(\s*select 1 from public\.shop_domains d\s*where d\.shop_id=s\.id and d\.kind='SUBDOMAIN'/s);
  assert.match(sql, /perform public\.ustore_ensure_shop_subdomain\(r\.id,r\.source_name,'ustr\.uz'\)/);
  assert.doesNotMatch(sql, /TERMINATED|TERMINATING/);
});

test('111 allocator remains collision-safe and never replaces an existing subdomain', () => {
  assert.match(sql, /select \* into v_row from public\.shop_domains where shop_id=p_shop_id and kind='SUBDOMAIN';\s*if found then return to_jsonb\(v_row\);/s);
  assert.match(sql, /insert into public\.shop_slug_registry\(slug,shop_id\)/);
  assert.match(sql, /exception when unique_violation/);
  assert.match(sql, /v_attempt>=999/);
});
