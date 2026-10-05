const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

function functionBody(name) {
  const start = app.indexOf(`async function ${name}()`);
  assert.notEqual(start, -1, `${name} topilmadi`);
  const next = app.indexOf('\n    // ====================', start);
  return app.slice(start, next === -1 ? start + 2200 : next);
}

test('task 3: web profile logout asks for confirmation before signing out', () => {
  const body = functionBody('performWebProfileSignOut');
  const confirmAt = body.indexOf('await appConfirm(');
  const signOutAt = body.indexOf("browserBridge.request('web_sign_out'");
  assert.ok(confirmAt >= 0, 'logout confirmation missing');
  assert.ok(signOutAt > confirmAt, 'sign out must happen only after confirmation');
  assert.match(body, /Akkauntdan chiqishni xohlaysizmi\?/);
  assert.match(body, /confirmLabel:\s*tr\('Chiqish'/);
  assert.match(body, /cancelLabel:\s*tr\('Bekor qilish'/);
  assert.match(body, /if \(!confirmed\) return;/);
});
