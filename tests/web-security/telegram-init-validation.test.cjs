const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { verifyTelegramInitData } = require('../../supabase/functions/_shared/telegram.ts');
const { json } = require('../../supabase/functions/_shared/http.ts');
const token = 'test-bot-token';
function signed(fields) {
  const params = new URLSearchParams(fields);
  const check = [...params.keys()].sort().map(k => `${k}=${params.get(k)}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
const fields = () => ({ auth_date: String(Math.floor(Date.now()/1000)), user: JSON.stringify({id: 1752760704}) });
test('Mini App credential responses explicitly prevent browser and proxy caching', async () => {
  const response = json({password:'one-time-test-value'});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('pragma'),'no-cache');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
});
test('Mini App signed identity succeeds only with the correct bot token', async () => {
  const init = signed(fields());
  assert.equal((await verifyTelegramInitData(init, token)).tgId, '1752760704');
  assert.equal((await verifyTelegramInitData(init, 'other-bot')).ok, false);
});
test('Mini App rejects signed future, nonfinite, fractional and expired dates', async () => {
  for (const date of ['Infinity', 'NaN', '1.5', String(Math.floor(Date.now()/1000)+600), '1']) {
    assert.equal((await verifyTelegramInitData(signed({...fields(), auth_date: date}), token)).ok, false, date);
  }
});
test('Mini App rejects ambiguous duplicated identity fields and invalid user IDs', async () => {
  const duplicate = new URLSearchParams(fields()); duplicate.append('user', JSON.stringify({id: 999999}));
  assert.equal((await verifyTelegramInitData(signed(duplicate), token)).ok, false);
  for (const id of [-1, 1.5, '1752760704', 9007199254740992]) {
    assert.equal((await verifyTelegramInitData(signed({...fields(), user: JSON.stringify({id})}), token)).ok, false);
  }
});
