const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'platform/platform-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'platform/platform.css'), 'utf8');

test('task14: annual pricing is always 10 months with 12-month original price', () => {
  assert.match(app, /function annualOfferPrice\(monthly\) \{ return Math\.round\(\(Number\(monthly\) \|\| 0\) \* 10\); \}/);
  assert.match(app, /function annualOriginalPrice\(monthly\) \{ return Math\.round\(\(Number\(monthly\) \|\| 0\) \* 12\); \}/);
  assert.match(app, /annualOriginalPrice\(t\.price\)/);
  assert.match(app, /annualOfferPrice\(t\.price\)/);
  assert.match(app, /annualSaving/);
});

test('task14: billing control exposes monthly and annual discount clearly', () => {
  assert.match(app, /plat-pricing-period-toggle/);
  assert.match(app, />Oylik</);
  assert.match(app, /Yillik <span class="plat-billing-free-badge">−17%<\/span>/);
  assert.match(app, /10 oylik to‘lov bilan 12 oy/);
});

test('task14: premium cards emphasize product limit, savings and recommendation', () => {
  assert.match(app, /plat-pricing-card/);
  assert.match(app, /plat-tariff-limit-hero/);
  assert.match(app, /ta mahsulotgacha/);
  assert.match(app, /Cheksiz/);
  assert.match(app, /2 oy bepul/);
  assert.match(app, /tejaysiz/);
  assert.match(app, /Tavsiya etiladi/);
  assert.match(app, /slice\(0, 4\)/);
});

test('task14: cards are responsive for phone tablet and desktop', () => {
  assert.match(css, /2026-10-05 TASK 14 — premium tariff cards/);
  assert.match(css, /@media \(min-width:1200px\)[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(min-width:768px\) and \(max-width:1199px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:767px\)[\s\S]*plat-tariff-carousel-item\{flex:0 0 min\(87vw,355px\)/);
  assert.match(css, /plat-pricing-card\{[\s\S]*display:flex;flex-direction:column;height:100%/);
});
