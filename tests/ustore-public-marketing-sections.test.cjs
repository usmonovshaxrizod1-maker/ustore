const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '036_public_marketing_and_reward_period.sql'), 'utf8');

test('reward rules support a real optional rolling purchase period', () => {
  assert.match(migration, /add column if not exists period_days integer/);
  const start = api.indexOf('async function checkAndIssueRewards');
  const end = api.indexOf('function mapSupportTicketForClient', start);
  const block = api.slice(start, end);
  assert.match(block, /periodTotalByDays/);
  assert.match(block, /gte\("created_at", cutoff\)/);
  assert.match(block, /period_days/);
  assert.match(app, /id="coupon-period-days"/);
  assert.match(app, /periodDays, transferable, isActive: true/);
});

test('public API returns only active current marketing grouped source data', () => {
  const start = api.indexOf('case "get_marketing_campaigns"');
  const end = api.indexOf('case "get_campaign_detail"', start);
  const block = api.slice(start, end);
  for (const table of ['bundles', 'promotions', 'discount_tiers', 'reward_rules', 'automatic_gift_rules', 'customer_discounts']) assert.ok(block.includes(`from("${table}")`));
  assert.match(block, /eq\("tg_id", tgId\)/);
  assert.match(block, /personalDiscounts/);
  assert.match(block, /rewardRules/);
  assert.match(block, /giftRules/);
});

// 4-paket: User "Aksiyalar va chegirmalar" endi aynan 6 ta ajratilgan
// section — eski birlashtirilgan "Chegirmalar" (tier+personal) ikkiga
// bo'lindi ("Bosqichli chegirmalar" / "Shaxsiy takliflar"), kupon (reward
// rule) esa "Promo-kodlar va kuponlar"dan "Avtomatik sovg'alar"ga ko'chdi
// (admin tarafdagi 4-tur unifikatsiyasiga mos).
//
// 2026-08-27: bosh sahifa endi hammasini INLINE ko'rsatmaydi — faqat 6 ta
// KIRISH qatori (hub), har biri o'z ALOHIDA sahifasiga o'tadi (Marketing
// Hub admin naqshi bilan bir xil) — foydalanuvchi "bitta sahifada hammasi
// ochilib qolyapti" deb shikoyat qilgandan keyin.
test('customer marketing hub links to 6 separate subpages instead of listing everything inline', () => {
  const hubStart = app.indexOf('function renderCampaignsPage(container)');
  const hubEnd = app.indexOf('function openPersonalOfferDetail', hubStart);
  const hub = app.slice(hubStart, hubEnd);
  assert.match(hub, /tr\('Aksiyalar'/);
  assert.match(hub, /tr\('Promo-kodlar va kuponlar'/);
  assert.match(hub, /tr\('Bosqichli chegirmalar'/);
  assert.match(hub, /tr\('Avtomatik sovg‘alar'/);
  assert.match(hub, /tr\('Shaxsiy takliflar'/);
  // Hub o'zi kartochka HTML yig'maydi — faqat har bir bo'limga KIRISH tugmasi.
  for (const key of ['MYPROMO', 'BUNDLES', 'PROMO', 'TIERS', 'GIFTS', 'PERSONAL']) {
    assert.match(hub, new RegExp(`openCampaignsSection\\('${key}'\\)`));
  }
  assert.doesNotMatch(hub, /promotions\.map/, 'hub endi kartochka ro\'yxatini o\'zi qurmasligi kerak — bu alohida sahifaga ko\'chgan');

  // Har bir bo'lim endi o'z ALOHIDA renderCampaigns*Page funksiyasida, umumiy
  // renderCampaignsSubpageShell() orqali orqaga hub'ga (openCampaignsPage())
  // qaytaradi.
  assert.match(app, /function renderCampaignsSubpageShell\(container, title, cardsHtml, emptyText\)/);
  const shellStart = app.indexOf('function renderCampaignsSubpageShell');
  const shellBlock = app.slice(shellStart, shellStart + 700);
  assert.match(shellBlock, /onBack: "openCampaignsPage\(\)"/, 'subpages must return to the hub');
  for (const fn of ['renderCampaignsMyPromoPage', 'renderCampaignsBundlesPage', 'renderCampaignsPromoPage', 'renderCampaignsTiersPage', 'renderCampaignsGiftsPage', 'renderCampaignsPersonalPage']) {
    const start = app.indexOf(`function ${fn}(container)`);
    assert.ok(start >= 0, `${fn} must exist`);
    const block = app.slice(start, start + 400);
    assert.match(block, /renderCampaignsSubpageShell\(/, `${fn} must use the shared subpage shell`);
  }
  assert.match(app, /function promoCardsHtml\(promotions\)/, 'promo card-building logic itself must still exist somewhere');
  assert.match(app, /publicRewardRuleText/);
  assert.match(app, /publicGiftConditionText/);
  assert.match(css, /\.fc-public-marketing-section/);
  assert.match(css, /\.fc-public-offer-card/);
});
