const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const start = app.indexOf('let qrDecoderLoadPromise = null;');
const end = app.indexOf('async function tryAutoFillQrPaymentUrlFromFile', start);
assert.ok(start >= 0 && end > start);

test('uploaded payment QR uses bundled jsQR when BarcodeDetector is unavailable', async () => {
  const file = { name: 'paynet.png' };
  const pixels = new Uint8ClampedArray(8 * 8 * 4);
  const requested = [];
  let closed = false;
  const window = {};
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: () => {},
      getImageData: () => ({ data: pixels }),
    }),
  };
  const context = {
    window,
    document: { createElement: (tag) => {
      assert.equal(tag, 'canvas');
      return canvas;
    } },
    createImageBitmap: async (input) => {
      assert.equal(input, file);
      return { width: 8, height: 8, close: () => { closed = true; } };
    },
    ensureScript: async (src) => {
      requested.push(src);
      window.jsQR = (data, width, height) => {
        assert.equal(data, pixels);
        assert.equal(width, 8);
        assert.equal(height, 8);
        return { data: 'https://paynet.uz/pay/example' };
      };
    },
    URL, Promise, Uint8ClampedArray,
  };
  const decode = vm.runInNewContext(`${app.slice(start, end)}\nreadQrValueFromFile`, context);
  assert.equal(await decode(file), 'https://paynet.uz/pay/example');
  assert.deepEqual(requested, ['./vendor/jsQR.js?v=1.4.0']);
  assert.equal(closed, true);
});

test('bundled QR reader and its license are included in the static release source', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'vendor/jsQR.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.jsQR, 'function');
  assert.match(fs.readFileSync(path.join(root, 'vendor/jsQR.LICENSE.txt'), 'utf8'), /Apache License/);
});
