const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'platform/platform-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'platform/platform.css'), 'utf8');

test('task15: landing explicitly presents both web and Telegram Mini App', () => {
  assert.match(app, /Web \+ Telegram Mini App savdo platformasi/);
  assert.match(app, /Bitta do‘kon\. <span>Ikki kanal\.<\/span>/);
  assert.match(app, /Web sayt va Telegram Mini App orqali soting/);
});

test('task15: showcase contains all eight agreed product stories', () => {
  for (const key of ['channels','catalog','orders','inventory','marketing','checkout','analytics','branding']) {
    assert.match(app, new RegExp(`key:'${key}'`));
  }
  assert.match(app, /LANDING_SHOWCASE_SLIDES\.map/);
  assert.match(app, /Telegram Mini App/);
  assert.match(app, /O‘z domeningiz/);
});

test('task15: carousel autoplays every three seconds and supports manual navigation', () => {
  assert.match(app, /setInterval\(\(\) => \{/);
  assert.match(app, /\}, 3000\);/);
  assert.match(app, /landingShowcaseStep\(-1\)/);
  assert.match(app, /landingShowcaseStep\(1\)/);
  assert.match(app, /landingShowcaseGo\(\$\{index\}\)/);
  assert.match(app, /landingShowcaseTouchStart/);
  assert.match(app, /landingShowcaseTouchEnd/);
});

test('task15: responsive showcase is implemented for phone tablet and desktop web', () => {
  assert.match(css, /2026-10-05 TASK 15 — Web \+ Telegram Mini App landing showcase/);
  assert.match(css, /@media\(max-width:767px\)[\s\S]*\.plat-landing-hero\{grid-template-columns:1fr/);
  assert.match(css, /@media\(min-width:768px\) and \(max-width:1199px\)[\s\S]*plat-landing-hero/);
  assert.match(css, /@media\(min-width:1200px\)[\s\S]*body\.ustore-browser-mode \.plat-landing-hero/);
  assert.match(css, /\.plat-showcase-track\{[\s\S]*transition:transform \.62s cubic-bezier/);
});
