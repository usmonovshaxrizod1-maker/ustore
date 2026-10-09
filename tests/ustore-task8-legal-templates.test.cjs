const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const moduleText = fs.readFileSync(path.join(root, 'supabase/functions/_shared/shop-legal-templates.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const OPTIONAL = ['OFFER','RETURNS','DELIVERY','PAYMENT','WARRANTY'];
// This data-only TS module is TS-free apart from the export and `as const`.
const templateData = vm.runInNewContext(moduleText.replace('export const OPTIONAL_LEGAL_TEMPLATES = ', 'globalThis.OUT = ').replace(/ as const;\s*$/, ';') + '\nOUT', { });

test('five optional documents have substantive Uzbek and Russian templates (not blank)', () => {
  assert.deepEqual(Object.keys(templateData).sort(), OPTIONAL.slice().sort());
  for (const type of OPTIONAL) {
    const doc = templateData[type];
    assert.ok(doc.contentUz.length > 600, `${type}: Uzbek template too short`);
    assert.ok(doc.contentRu.length > 600, `${type}: Russian template too short`);
    assert.ok(doc.contentUz.includes('UMUMIY SHABLON'), `${type}: merchant review warning missing`);
    assert.ok(doc.contentRu.includes('ОБЩИЙ ШАБЛОН'), `${type}: merchant review warning missing`);
    assert.ok(!doc.contentUz.includes('${'), `${type}: no unresolved interpolation in draft`);
  }
});

test('API uses one centralized source for the new templates and keeps optional docs disabled by default', () => {
  for (const type of OPTIONAL) assert.match(api, new RegExp(`${type}: \\{ titleUz: [^\\n]+\\.\\.\\.OPTIONAL_LEGAL_TEMPLATES\\.${type} \\}`));
  assert.match(api, /function defaultLegalDocument\(type: LegalDocType\)[\s\S]{0,250}enabled: false/);
  assert.match(api, /contentUz: String\(row\.content_uz \|\| base\.contentUz\)/);
  assert.match(api, /contentRu: String\(row\.content_ru \|\| base\.contentRu\)/);
  assert.match(api, /content_uz: contentUz \|\| base\.contentUz/);
  assert.match(api, /content_ru: contentRu \|\| base\.contentRu/);
  assert.match(api, /const existing = await readShopLegalDocuments\(db, shopId\)/);
  assert.match(api, /const prev: any = existingByType\.get\(type\)/);
});

test('only Privacy and Terms require consent; optional documents can be published to customers', () => {
  assert.match(api, /const LEGAL_CONSENT_TYPES = new Set<LegalDocType>\(\["PRIVACY", "TERMS"\]\)/);
  assert.match(app, /const consentDoc = doc\?\.type === 'PRIVACY' \|\| doc\?\.type === 'TERMS'/);
  assert.match(app, /\['OFFER','DELIVERY','PAYMENT','WARRANTY'\]\.map\(type =>/);
  assert.match(app, /storefrontLegalDocByType\(type\)/);
  assert.match(app, /openStorefrontLegalDocument\('\$\{type\}'\)/);
  assert.doesNotMatch(app, /if \(type === 'DELIVERY' \|\| type === 'PAYMENT'\) return openStorefrontInfoPage\('delivery'\)/);
});

test('new shop app JS asset version is referenced to prevent stale legal-document UI', () => {
  assert.match(html, /ustore-shop-app\.js\?v=333/);
});
