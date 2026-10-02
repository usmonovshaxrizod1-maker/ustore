const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('Russian customer copy covers cart, checkout, orders and profile while preserving values', async () => {
  const { translateCustomerText } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'web/i18n/customer-copy.js')).href);
  assert.equal(translateCustomerText('Savatcha bo‘sh', 'ru'), 'Корзина пуста');
  assert.equal(translateCustomerText('Buyurtmani rasmiylashtirish', 'ru'), 'Оформление заказа');
  assert.equal(translateCustomerText('Buyurtma #123', 'ru'), 'Заказ #123');
  assert.equal(translateCustomerText('Domen va manzil', 'ru'), 'Домен и адрес');
  assert.equal(translateCustomerText('119 000 so‘m', 'ru'), '119 000 сум');
  assert.equal(translateCustomerText('Savatcha bo‘sh', 'uz'), 'Savatcha bo‘sh');
});
