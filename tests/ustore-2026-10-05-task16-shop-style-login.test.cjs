const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'web/features/auth/login.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web/styles/features.css'), 'utf8');

test('task16: ustr login uses Shop App guest-profile visual structure', () => {
  assert.match(login, /uw-auth-profile-card/);
  assert.match(login, /Profilga kirish/);
  assert.match(login, /Buyurtmalar, sevimlilar va shaxsiy ma’lumotlaringiz uchun tizimga kiring/);
  assert.match(login, /uw-auth-profile-menu/);
  assert.match(login, /Telegram orqali kirish/);
  assert.match(login, /Login va parol bilan kirish/);
});

test('task16: auth behavior remains controller-driven while visual tabs become profile rows', () => {
  assert.match(login, /button\.addEventListener\('click', \(\) => controller\.setTab\(id\)\)/);
  assert.match(login, /controller\.signInTelegram\(\)/);
  assert.match(login, /controller\.signInPassword/);
  assert.match(login, /dataset\.authPanel/);
});

test('task16: profile menu is responsive and uses inline SVG icons instead of system emoji', () => {
  assert.match(login, /<svg viewBox=/);
  assert.match(css, /\.uw-auth:is\(\[data-feature="login"\],\[data-feature="origin-signin"\]\) \.uw-auth-profile-menu__row/);
  assert.match(css, /\.uw-auth:is\(\[data-feature="login"\],\[data-feature="origin-signin"\]\) \.uw-auth-profile-card/);
  assert.match(css, /@media\(max-width:640px\)/);
});
