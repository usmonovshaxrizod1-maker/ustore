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

test('task2 supersedes task15: landing renders persistent admin-controlled image slides, not old mockups', () => {
  assert.match(app, /landingSlides\.slice\(0,10\)/);
  assert.match(app, /plat-photo-slide/);
  assert.doesNotMatch(app, /LANDING_SHOWCASE_SLIDES/);
  assert.match(app, /adminLandingSave/);
  assert.match(app, /adminLandingShift/);
});

test('task2: slider autoplays every five seconds, buttons and swipe remain usable', () => {
  assert.match(app, /setInterval\(/);
  assert.match(app, /5000\)/);
  assert.match(app, /landingShowcaseStep\(-1\)/);
  assert.match(app, /landingShowcaseStep\(1\)/);
  assert.match(app, /landingShowcaseGo\(\$\{i\}\)/);
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
