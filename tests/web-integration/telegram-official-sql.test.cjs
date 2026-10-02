const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('108 grants a single Telegram-identity-bound web session and rejects challenge replay', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table accounts(id uuid primary key, status text not null, session_version integer not null);
      create table account_identities(account_id uuid, provider text, provider_subject text);
      create table web_sessions(id uuid primary key default gen_random_uuid(),account_id uuid,token_hash text,
        created_via text,expires_at timestamptz,session_version integer);
      create table web_auth_audit(account_id uuid,event_type text,metadata jsonb);`);
    await db.exec(fs.readFileSync('supabase/migrations/108_telegram_official_oidc.sql', 'utf8'));
    const account = '00000000-0000-0000-0000-000000000001';
    await db.query("insert into accounts values ($1,'ACTIVE',1)", [account]);
    await db.query("insert into account_identities values ($1,'TELEGRAM','1752760704')", [account]);
    await db.query(`insert into web_telegram_oidc_challenges(state_hash,browser_verifier_hash,code_challenge,nonce_hash,return_origin,return_path,redirect_uri,expires_at)
      values ('state-hash','browser-hash','pkce','nonce-hash','https://ustr.uz','/platform/app','https://ustr.uz/',now()+interval '5 minutes')`);
    const finish = async (subject, state = 'state-hash') => (await db.query(
      `select * from ustore_finish_telegram_oidc($1,$2,$3,$4,$5,$6,$7,$8)`,
      [state, 'browser-hash', 'pkce', 'nonce-hash', 'https://ustr.uz', account, subject, 'token-hash'],
    )).rows[0];
    assert.equal((await finish('another-telegram-id')).result, 'IDENTITY_MISMATCH');
    assert.equal((await finish('1752760704', 'bad-state')).result, 'INVALID');
    assert.equal((await finish('1752760704')).result, 'OK');
    assert.equal((await finish('1752760704')).result, 'CONSUMED');
    assert.equal((await db.query('select count(*)::int as n from web_sessions')).rows[0].n, 1);
    await db.exec('set role anon');
    await assert.rejects(finish('1752760704'), /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});
