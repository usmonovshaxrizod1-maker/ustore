const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');

test('task 1: storefront banner carousel starts on the third banner whenever it exists and renders one position indicator per rendered banner', () => {
  const renderStart = app.indexOf('function renderBannerCarouselHtml()');
  const renderBlock = app.slice(renderStart, app.indexOf('let homeBannerDrag', renderStart));
  assert.match(renderBlock, /const banners = activeBanners\.slice\(0,5\);/);
  assert.match(renderBlock, /id="fc-banner-indicators"/);
  assert.match(renderBlock, /banners\.map\(\(_, i\) => `<button[^`]+data-banner-index="\$\{i\}"[^`]+scrollHomeBannerTo\(\$\{i\}, event\)/);

  const initStart = app.indexOf('function initBannerCarousel()');
  const initBlock = app.slice(initStart, initStart + 3000);
  assert.match(initBlock, /const initialIndex = Math\.min\(2, originalCards\.length - 1\);/);
  assert.match(initBlock, /indicators\.forEach\(\(dot, i\) =>/);
  assert.match(initBlock, /dot\.classList\.toggle\('is-active', i === realIndex\)/);
  assert.match(css, /\.fc-banner-indicator\.is-active\{width:1\.08rem;/);
});

test('task 2: return/cancel settings are a dedicated Store settings menu directly below Payment settings, not embedded inside Delivery settings', () => {
  const settingsStart = app.indexOf('function renderSettingsPage(container)');
  const settingsEnd = app.indexOf('async function saveOrderPolicies', settingsStart);
  const settingsBlock = app.slice(settingsStart, settingsEnd);
  const paymentPos = settingsBlock.indexOf('openPaymentSettingsPage()');
  const policyPos = settingsBlock.indexOf('openOrderPolicySettingsPage()');
  const legalPos = settingsBlock.indexOf('openLegalSettingsPage()');
  assert.ok(paymentPos >= 0 && policyPos > paymentPos && legalPos > policyPos, 'return/cancel menu must sit immediately after Payment settings and before Legal documents');
  assert.match(settingsBlock, /Qaytarish va bekor qilish/);

  const deliveryStart = app.indexOf('function renderDeliverySettingsPage(container)');
  const deliveryEnd = app.indexOf('function renderOrderPolicySettingsPage(container)', deliveryStart);
  const deliveryBlock = app.slice(deliveryStart, deliveryEnd);
  assert.doesNotMatch(deliveryBlock, /renderOrderPolicySettingsPanel\(\)/);

  const policyStart = app.indexOf('function renderOrderPolicySettingsPage(container)');
  const policyEnd = app.indexOf('function renderPaymentSettingsPage(container)', policyStart);
  const policyBlock = app.slice(policyStart, policyEnd);
  assert.match(policyBlock, /renderOrderPolicySettingsPanel\(\)/);
  assert.match(policyBlock, /Qaytarish va bekor qilish/);
  assert.match(app, /case 'ORDER_POLICY_SETTINGS': renderOrderPolicySettingsPage\(container\); break;/);
  assert.match(app, /function openOrderPolicySettingsPage\(\) \{[\s\S]{0,180}openPage\('ORDER_POLICY_SETTINGS'\);/);
});
