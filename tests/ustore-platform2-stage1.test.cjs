// USTORE PLATFORM 2.0 — Bosqich 1 (Design Foundation + User Platform).
// Master-refactor spec (2026-09-06): mavjud backend/business logic 100%
// saqlanadi, faqat information architecture + visual design qayta tashkil
// qilinadi. Bu fayl shu bosqichda qo'shilgan/o'zgargan ANIQ narsalarni
// tekshiradi — statik-tahlil testlari (bu loyihada boshqa .test.cjs
// fayllar bilan bir xil uslub, live browser/Supabase yo'q).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const platformApp = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
const platformCss = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
const platformHtml = fs.readFileSync(path.join(__dirname, '..', 'platform', 'index.html'), 'utf8');

test('platform.css now has ONE canonical :root design-token block (colors/spacing/radius/shadow) matching the master-refactor spec section 4 exact hex values, declared once at the top of the file', () => {
  const rootStart = platformCss.indexOf(':root {');
  assert.ok(rootStart >= 0 && rootStart < 2000, 'the canonical token block must be declared near the top of the file');
  const rootBlock = platformCss.slice(rootStart, platformCss.indexOf('}', rootStart) + 1);
  assert.match(rootBlock, /--c-bg: #F6F8FB;/);
  assert.match(rootBlock, /--c-primary: #2684FF;/);
  assert.match(rootBlock, /--c-primary-hover: #1672E8;/);
  assert.match(rootBlock, /--c-primary-active: #0F63D5;/);
  assert.match(rootBlock, /--c-success-text: #16803C; --c-success-bg: #ECFDF3; --c-success-border: #C6F1D5;/);
  assert.match(rootBlock, /--c-danger-text: #C4320A;/);
  assert.match(rootBlock, /--c-frozen-text: #475467;/);
  assert.match(rootBlock, /--r-card: 14px;/);
  assert.match(rootBlock, /--sp-4: 16px;/);
  assert.match(rootBlock, /--sh-card: 0 4px 14px rgba\(16,24,40,\.055\);/);
});

test('the five previously-competing accent-blue hex shades (from separate, uncoordinated past rounds: #5b8def, #4f7fe0, #3b82f6, #2f76ed, #2563eb) are fully consolidated into the ONE canonical primary — a real, live UX bug (button color actually shown to users depended on which of 5 independent :root/.plat-user-mode overrides happened to win the CSS cascade) is now fixed, not just newly-declared tokens sitting unused alongside the old ones', () => {
  assert.doesNotMatch(platformCss, /#5b8def|#5B8DEF|#4f7fe0|#4F7FE0|#3b82f6|#3B82F6|#2f76ed|#2F76ED|#2563eb|#2563EB/, 'no old competing accent-blue hex literal may remain anywhere in the file');
});

test('button.primary/.secondary/.danger, inputs, .card, .notice and .status-pill all consume the new canonical tokens (var(--c-...)) instead of re-hardcoded hex, and match the spec\'s exact sizing (44px min-height controls, 10px button/input radius, 14px card radius)', () => {
  const btnPrimary = platformCss.slice(platformCss.indexOf('button.primary {'), platformCss.indexOf('button.primary:disabled'));
  assert.match(btnPrimary, /background: var\(--c-primary\);/);
  assert.match(btnPrimary, /min-height: 44px;/);
  assert.match(btnPrimary, /border-radius: var\(--r-btn\);/);
  assert.match(platformCss, /button\.primary:hover \{ background: var\(--c-primary-hover\); \}/);
  assert.match(platformCss, /button\.primary:active \{ background: var\(--c-primary-active\); transform: scale\(0\.98\); \}/);
  assert.match(platformCss, /button\.danger \{/, 'a dedicated danger-button class must exist per spec section 11, distinct from primary blue');
  assert.match(platformCss, /\.card \{\s*\n\s*background: var\(--c-surface\); border: 1px solid var\(--c-border\); border-radius: var\(--r-card\);/);
  assert.match(platformCss, /\.status-ACTIVE \{ background: var\(--c-success-bg\); color: var\(--c-success-text\); \}/);
  assert.match(platformCss, /\.status-FROZEN \{ background: var\(--c-frozen-bg\); color: var\(--c-frozen-text\); \}/);
  assert.match(platformCss, /\.status-TERMINATING \{ background: var\(--c-frozen-bg\); color: var\(--c-frozen-text\); \}/, 'the transient TERMINATING status must also have a readable pill, not fall through unstyled');
});

test('the user bottom nav is now 4 items (Bosh sahifa/Do\'konlarim/To\'lovlar/Yordam) — Profil is no longer a bottom-nav tab per spec section 2, while the ADMIN nav (untouched, stage-2 scope) still has its original 5', () => {
  const start = platformApp.indexOf('function renderBottomNav()');
  const block = platformApp.slice(start, platformApp.indexOf('function renderTabBody', start));
  const userTabsMatch = block.match(/const userTabs = \[([\s\S]*?)\];/);
  assert.ok(userTabsMatch, 'userTabs array must exist');
  const userTabCount = (userTabsMatch[1].match(/\[/g) || []).length;
  assert.strictEqual(userTabCount, 4, 'user nav must have exactly 4 items now (profile moved to header avatar)');
  assert.doesNotMatch(userTabsMatch[1], /'profile'/, 'profile must not be a user bottom-nav tab any more');
  assert.match(userTabsMatch[1], /\['subscription', 'diamond', "To'lovlar"\]/, 'the subscription tab keeps its internal id (zero routing/state risk) but is now labeled "To\'lovlar" per spec');
  const adminTabsMatch = block.match(/const adminTabs = \[([\s\S]*?)\];/);
  const adminTabCount = (adminTabsMatch[1].match(/\[/g) || []).length;
  assert.strictEqual(adminTabCount, 5, 'admin nav is untouched in Stage 1 — its restructure is explicitly Stage 2 scope');
});

test('togglePersonMenu (header avatar): in USER mode, a non-superadmin now opens Profil directly (previously did nothing — a dead click for ~100% of users, since Profil had no other entry point once removed from the bottom nav); a superadmin in USER mode gets a popover with BOTH "Profilni ochish" and the pre-existing "Admin rejimiga o\'tish" (nothing lost); ADMIN-mode behavior is completely unchanged (still gated to isSuperAdmin, still only the mode-toggle option)', () => {
  const start = platformApp.indexOf('function togglePersonMenu(event)');
  const block = platformApp.slice(start, platformApp.indexOf('\n  }', start) + 4);
  assert.match(block, /if \(!isSuperAdmin\) \{ switchTab\('profile'\); return; \}/);
  assert.match(block, /Profilni ochish/);
  assert.match(block, /onclick="document\.getElementById\('plat-role-popover'\)\.classList\.add\('hidden'\); switchTab\('profile'\);"/, 'the popover\'s profile option must actually call switchTab, not just show text');
  assert.match(block, /if \(isAdminMode\) \{/, 'admin-mode branch must be checked first and kept separate');
  const adminBranchStart = block.indexOf('if (isAdminMode) {');
  const adminBranchTail = block.slice(adminBranchStart);
  const adminBranch = adminBranchTail.slice(0, adminBranchTail.search(/return;\r?\n    }/));
  assert.match(adminBranch, /if \(!isSuperAdmin\) return;/, 'admin-mode gating must be untouched — only superadmin sees the popover there, exactly as before');
  assert.doesNotMatch(adminBranch, /Profilni ochish/, 'admin mode must NOT gain a redundant profile-open option — it already has Profil as a full bottom-nav tab');
});

test('the header avatar button shows the real Telegram profile photo (tg.initDataUnsafe.user.photo_url) when available, in USER mode only — falls back to the existing generic user icon otherwise (admin mode untouched, still always the icon)', () => {
  assert.match(platformApp, /!isAdminMode && tg\?\.initDataUnsafe\?\.user\?\.photo_url \? `<img src="\$\{escapeHtml\(tg\.initDataUnsafe\.user\.photo_url\)\}" class="plat-header-avatar-img" alt="">` : pIcon\('user', 17\)/);
  assert.match(platformCss, /\.plat-header-avatar-img \{ width: 100%; height: 100%; border-radius: inherit; object-fit: cover; \}/);
});

test('the subscription-request detail page now shows a numbered step-progress (spec 22/40-band) built ONLY from real backend fields (status/paymentClaimedAt/shopCreated) — no fabricated "bot ulanadi" step with its own tracked timestamp that does not exist server-side, and it is skipped entirely for REJECTED requests (which already have their own clear rejection notice)', () => {
  const start = platformApp.indexOf('function renderRequestStepProgress(r)');
  assert.ok(start >= 0, 'renderRequestStepProgress must exist');
  const block = platformApp.slice(start, platformApp.indexOf('\n  }', start) + 4);
  assert.match(block, /if \(r\.status === 'REJECTED'\) return '';/);
  assert.match(block, /done: !!r\.paymentClaimedAt/);
  assert.match(block, /done: !!r\.shopCreated/);
  assert.doesNotMatch(block, /botConnectedAt|botConnectedStep/, 'must not invent a bot-connection timestamp the backend never provides');
  assert.match(platformApp, /\$\{renderRequestStepProgress\(r\)\}/, 'must actually be called from renderMyRequestDetailsBody, not just defined and unused');
});

// Note: the cache-version guard itself lives ONLY in
// ustore-missed-1-6-final.test.cjs (single source of truth, updated every
// round) — duplicating an exact "?v=N" check here would go stale the very
// next round that bumps it further, as happened once already.
