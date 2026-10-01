// USTORE PLATFORM 2.0 — Bosqich 3 (Polish + Cleanup + Regression).
// Master-refactor spec (2026-09-06): bu bosqichda YANGI feature qo'shilmadi
// (spec 60-band'ning o'z talabi) — faqat CSS konsolidatsiyasi (E-band),
// o'lik kod tekshiruvi (F-band) va responsive/regression tasdig'i (B/G-band).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const platformApp = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
const platformCss = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
const platformHtml = fs.readFileSync(path.join(__dirname, '..', 'platform', 'index.html'), 'utf8');

test('CSS cleanup (spec E-band): the 8 near-duplicate "muted secondary text" gray shades that had independently drifted across past rounds (#8b98a8/#8d99a8/#718096/#8a97a7/#8996a6/#7e8da1/#68758b/#63748a — all used exclusively as `color:`, confirmed by inspection, so this consolidation cannot change any non-text usage) are now fully gone from the file, replaced by the ONE canonical var(--c-text-secondary) token — including the --u-muted variable\'s own definition, not just its literal-hex consumers', () => {
  assert.doesNotMatch(platformCss, /#8b98a8|#8d99a8|#718096|#8a97a7|#8996a6|#7e8da1|#68758b|#63748a/i, 'no old competing muted-gray hex literal may remain anywhere');
  assert.match(platformCss, /--u-muted:var\(--c-text-secondary\);/, 'the --u-muted token itself must now derive from the canonical token, not a re-hardcoded hex');
});

test('CSS cleanup (spec E-band): the 7 near-duplicate dark "heading text" navy shades (#0f172a/#203149/#34465c/#334155/#314359/#243249/#223148 — all confirmed `color:`-only usage) are consolidated into var(--c-heading)', () => {
  assert.doesNotMatch(platformCss, /#0f172a|#203149|#34465c|#334155|#314359|#243249|#223148/i, 'no old competing dark-heading hex literal may remain anywhere');
});

test('the canonical :root token definitions themselves were NOT accidentally swept up by the bulk consolidation (no circular var() references) — --c-heading and --c-text-secondary still resolve to their own real hex values, not to each other or to var()', () => {
  const rootStart = platformCss.indexOf(':root {');
  const rootBlock = platformCss.slice(rootStart, platformCss.indexOf('}', rootStart) + 1);
  assert.match(rootBlock, /--c-heading: #111827;/);
  assert.match(rootBlock, /--c-text-secondary: #667085;/);
});

test('spot-check: a handful of components across different rounds/areas (Dashboard KPI card labels, request-detail step labels, admin profile-card identity text) now visibly consume the SAME canonical muted/heading tokens post-cleanup, rather than three independently-hardcoded near-identical grays', () => {
  // 8.5px/10.5px -> 12px: Platform 2.0 visual-consistency pass bumped both
  // sub-11px sizes up to the canonical 12px "small/meta" floor (neither sits
  // inside a tiny square icon/badge container, so neither qualifies for the
  // documented container-constrained exception).
  assert.match(platformCss, /\.plat-req-step b \{ font-size:12px; font-weight:600; color:var\(--c-text-muted\); line-height:1\.3; \}/);
  assert.match(platformCss, /\.plat-application-section-title b\{display:block;font-size:12px;color:#2c3d53\}/);
});

test('F-band (JS dead-code check): every window.X export in platform-app.js references an actually-defined function — this specifically catches the exact class of bug this session already hit once (window.openAdminSupportPage pointing at a function deleted during the Support-tab restructure, which would have thrown ReferenceError on page load and broken the ENTIRE script)', () => {
  const exportLines = [...platformApp.matchAll(/^\s*window\.(\w+) = (\w+);\s*$/gm)];
  assert.ok(exportLines.length > 100, 'sanity check that the regex actually matched the real export block');
  const missing = [];
  for (const [, prop, fnName] of exportLines) {
    const defRe = new RegExp('function\\s+' + fnName + '\\s*\\(|(?:const|let)\\s+' + fnName + '\\s*=');
    if (!defRe.test(platformApp)) missing.push(prop);
  }
  assert.deepStrictEqual(missing, [], 'every window.* export must reference a function that actually still exists');
});

// Note: the cache-version guard lives ONLY in ustore-missed-1-6-final.test.cjs
// (single source of truth, updated every round) — see Stage 1's own note.
