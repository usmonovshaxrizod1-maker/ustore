const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Workers Static Assets applies ALL matching rules, not just the last block.
// Match its delete-before-append behavior to catch contradictory frame policies.
function assetHeaders(pathname) {
  const headers = new Headers();
  const source = fs.readFileSync(path.resolve(__dirname, '../../web/_headers'), 'utf8');
  let active = false;
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      active = new RegExp('^' + line.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '.*') + '$').test(pathname);
    } else if (active) {
      const value = line.trim();
      if (value.startsWith('! ')) headers.delete(value.slice(2));
      else { const colon = value.indexOf(':'); headers.append(value.slice(0, colon), value.slice(colon + 1).trim()); }
    }
  }
  return headers;
}

test('platform iframe has one same-origin policy and working legacy buttons', () => {
  for (const url of ['/platform-ui/', '/platform-ui/index.html']) {
    const h = assetHeaders(url);
    assert.equal(h.get('x-frame-options'), 'SAMEORIGIN');
    const csp = h.get('content-security-policy');
    assert.equal((csp.match(/frame-ancestors/g) || []).length, 1);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.doesNotMatch(csp, /frame-ancestors 'none'/);
    assert.match(csp, /script-src-attr 'unsafe-inline'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.doesNotMatch(csp, /script-src 'self' 'unsafe-inline'/);
  }
});
test('public, login and callback pages keep frame denial and strict scripts', () => {
  for (const url of ['/', '/platform/app', '/platform/login', '/auth/callback', '/profile']) {
    const h = assetHeaders(url);
    assert.equal(h.get('x-frame-options'), 'DENY');
    assert.match(h.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.doesNotMatch(h.get('content-security-policy'), /unsafe-inline/);
  }
});
