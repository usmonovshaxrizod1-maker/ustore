const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureTelegramAccount } = require('../../supabase/functions/_shared/account-identity.ts');
function database({race = false, linkError = null, insertError = {code:'23505'}, winner = 'winner'} = {}) {
  let reads = 0; const links = []; const deleted = [];
  return { links, deleted, from(table) {
    const query = {
      select() { return this; }, eq(key, value) { if (this.deleting) deleted.push(value); return this; },
      is() { return Promise.resolve({error: linkError}); },
      update(value) { links.push({table, accountId: value.account_id}); return this; },
      delete() { this.deleting = true; return this; },
      insert() { return table === 'account_identities' ? Promise.resolve({error: insertError}) : this; },
      single() { return Promise.resolve({data: {id:'loser'}}); },
      maybeSingle() { return Promise.resolve({data: race && reads++ === 0 ? null : {account_id:winner}}); },
    }; return query;
  }};
}
test('simultaneous identity creation links both Mini App records to the winning account', async () => {
  const db = database({race: true});
  assert.equal(await ensureTelegramAccount(db, '1752760704'), 'winner');
  assert.deepEqual(db.links, [{table:'app_users',accountId:'winner'}, {table:'shop_memberships',accountId:'winner'}]);
  assert.deepEqual(db.deleted, ['loser']);
});
test('identity linking failure cannot silently report successful synchronization', async () => {
  const failure = new Error('database unavailable');
  for (const race of [false, true]) {
    await assert.rejects(ensureTelegramAccount(database({race, linkError: failure}), '1752760704'), /database unavailable/);
  }
});
test('uncertain identity insert failure never deletes a possibly committed account', async () => {
  const db = database({race:true, insertError:new Error('network interrupted')});
  await assert.rejects(ensureTelegramAccount(db,'1752760704'),/network interrupted/);
  assert.deepEqual(db.deleted,[]);
});
test('conflict lookup that finds the same account never deletes its identity', async () => {
  const db = database({race:true,winner:'loser'});
  assert.equal(await ensureTelegramAccount(db,'1752760704'),'loser');
  assert.deepEqual(db.deleted,[]);
});
