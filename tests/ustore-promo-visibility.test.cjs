// USTORE — yashirin (reklama/blogger) promo-kodlar + marketing formalaridagi
// yoqish/o'chirish qatorlarining tartiblanishi.
//
// Asosiy invariant: "yashirin" degani FAQAT ommaviy ro'yxatda ko'rinmaslik.
// Kodning O'ZI ishlashda davom etishi SHART — aks holda blogger reklamasini
// ko'rgan mijoz kodni yozganda chegirma tushmaydi va butun g'oya buziladi.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '040_promo_visibility.sql'), 'utf8');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');

// ---------------------------------------------------------------------------
// Sxema
// ---------------------------------------------------------------------------

test('040 migratsiyasi additive va standart qiymati OCHIQ — mavjud promo-kodlar avvalgidek ko\'rinishda qoladi', () => {
  assert.match(migration, /add column if not exists is_public boolean not null default true/);
  assert.doesNotMatch(migration, /drop column|drop table|update public\.promotions set/i,
    'mavjud ma\'lumotga tegilmasligi kerak');
});

// ---------------------------------------------------------------------------
// Eng muhim invariant: yashirin kod ISHLAYDI
// ---------------------------------------------------------------------------

test('KRITIK: checkout\'dagi promo tekshiruvi (resolvePromoDiscount) is_public\'ga UMUMAN qaramaydi — yashirin kod yozilsa chegirma tushadi', () => {
  const start = api.indexOf('async function resolvePromoDiscount');
  assert.notEqual(start, -1);
  const end = api.indexOf('\nasync function ', start + 10);
  const body = api.slice(start, end > start ? end : start + 4000);
  assert.match(body, /\.eq\("code", code\)/, 'kod bo\'yicha qidirilishi kerak');
  assert.doesNotMatch(body, /is_public/,
    'yashirin kod checkout\'da ishlashi SHART — bu yerda is_public tekshirilmasligi kerak');
});

// ---------------------------------------------------------------------------
// Yashirin kod ommaviy joylarda ko'rinmaydi
// ---------------------------------------------------------------------------

test('ommaviy aksiyalar ro\'yxati (get_marketing_campaigns) yashirin kodlarni chiqarib tashlaydi', () => {
  const start = api.indexOf('case "get_marketing_campaigns"');
  const body = api.slice(start, start + 2000);
  assert.match(body, /db\.from\("promotions"\)[\s\S]{0,200}?\.eq\("is_public", true\)/,
    'ommaviy ro\'yxat faqat ochiq kodlarni ko\'rsatishi kerak');
});

test('yashirin kodning ommaviy DETAL sahifasi ham ochilmaydi — banner unga havola qilsa ham', () => {
  // Aks holda kimdir id\'ni bilsa (masalan eski banner havolasi orqali)
  // yashirin kod ochiq ko'rinib qolardi.
  const idx = api.indexOf('const { data, error } = await db.from("promotions").select("*").eq("shop_id", shopId).eq("id", id)');
  assert.notEqual(idx, -1, 'get_campaign_detail promo tarmog\'i topilishi kerak');
  const line = api.slice(idx, api.indexOf('\n', idx));
  assert.match(line, /\.eq\("is_public", true\)/);
});

test('admin ro\'yxati (promo_list) esa YASHIRIN kodlarni ham ko\'rsatadi — do\'kon egasi o\'z kodlarini boshqara olishi kerak', () => {
  const start = api.indexOf('case "promo_list"');
  const body = api.slice(start, start + 700);
  assert.doesNotMatch(body, /is_public/,
    'admin ro\'yxatida filtr bo\'lmasligi kerak — aks holda yashirin kodni tahrirlab bo\'lmaydi');
  assert.match(body, /usedCount/, 'reklama samarasini o\'lchash uchun ishlatilish soni qaytishi kerak');
});

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

test('promo_create standart holatda OCHIQ kod yaratadi, promo_update esa faqat aniq yuborilganda o\'zgartiradi', () => {
  const createBlock = api.slice(api.indexOf('case "promo_create"'), api.indexOf('case "promo_update"'));
  assert.match(createBlock, /is_public: payload\.isPublic !== undefined \? !!payload\.isPublic : true/,
    'yangi kod standart holatda ochiq bo\'lishi kerak (mavjud xatti-harakat bilan bir xil)');
  const updateBlock = api.slice(api.indexOf('case "promo_update"'), api.indexOf('case "promo_delete"'));
  assert.match(updateBlock, /if \(payload\.isPublic !== undefined\) patch\.is_public = !!payload\.isPublic;/,
    'yuborilmagan maydon tasodifan o\'zgarmasligi kerak');
});

test('mapPromoForClient isPublic\'ni qaytaradi va ustun hali qo\'shilmagan eski qatorni OCHIQ deb hisoblaydi', () => {
  const start = app.length && api.indexOf('function mapPromoForClient');
  const body = api.slice(start, start + 1400);
  assert.match(body, /isPublic: p\.is_public !== false/,
    'undefined (migratsiya hali ishlamagan) holatda ochiq deb hisoblanishi kerak');
});

// ---------------------------------------------------------------------------
// Frontend
// ---------------------------------------------------------------------------

test('promo formasida yashirish tumbleri bor va u draft/saqlash zanjiriga to\'liq ulangan', () => {
  assert.match(app, /id="promo-f-public"/, 'forma elementi bo\'lishi kerak');
  assert.match(app, /promoDraft\.isPublic = !!document\.getElementById\('promo-f-public'\)\.checked/,
    'qayta render bo\'lganda tanlov yo\'qolmasligi kerak (draft sync)');
  assert.match(app, /isPublic: !!document\.getElementById\('promo-f-public'\)\?\.checked/,
    'saqlashda serverga yuborilishi kerak');
  assert.match(app, /isPublic: existing\.isPublic !== false/,
    'tahrirlashda mavjud qiymat to\'g\'ri yuklanishi kerak');
  // Yangi kod ochilganda standart — ochiq.
  assert.match(app, /allowStacking: false, isPublic: true, isActive: true/);
});

test('admin promo detalida kod ochiq yoki yashirin ekani aniq yozilgan', () => {
  assert.match(app, /p\.isPublic === false \? tr\("Yashirin/);
});

// ---------------------------------------------------------------------------
// Marketing formalaridagi qatorlarning tartiblanishi (foydalanuvchi shikoyati:
// "bir biriga yopishib nima ekanligi bilinmay qolgan")
// ---------------------------------------------------------------------------

test('.fc-settings-toggle-row CSS qoidasi HAQIQATAN mavjud — avval u faqat HTML\'da ishlatilib, ustore.css\'da umuman ta\'riflanmagan edi (shuning uchun qatorlar stilsiz yopishib chiqardi)', () => {
  const rule = css.match(/\.fc-settings-toggle-row\s*\{[^}]*\}/);
  assert.ok(rule, 'qoida ustore.css\'da bo\'lishi shart');
  assert.match(rule[0], /display:\s*flex/);
  assert.match(rule[0], /justify-content:\s*space-between/, 'tumbler o\'ngda turishi kerak');
  assert.match(rule[0], /border:/, 'har bir qator alohida karta bo\'lib ajralib turishi kerak');
  assert.match(rule[0], /padding:/, 'ichki bo\'shliq bo\'lmasa qatorlar yopishib qoladi');
  // Sarlavha va izoh uslublari ham bo'lishi kerak.
  assert.match(css, /\.fc-settings-toggle-row small\s*\{[^}]*font-size/);
  assert.match(css, /\.fc-settings-toggle-row b\s*\{[^}]*font-size/);
});

test('marketing formalaridagi HAMMA "Faol" qatori endi bir xil uslubda — avval ular boshqa (stilsiz) markup bilan yozilgan va qolganlaridan ajralib turardi', () => {
  assert.doesNotMatch(app, /flex items-center justify-between p-1"><span class="text-xs font-bold text-gray-600">/,
    'eski nomutanosib "Faol" markup\'i qolmasligi kerak');
  for (const id of ['banner-f-active', 'bundle-f-active', 'reward-f-active', 'promo-f-active']) {
    const idx = app.indexOf(`id="${id}"`);
    assert.notEqual(idx, -1, `${id} topilishi kerak`);
    // Shu input o'zidan oldingi eng yaqin ochiluvchi teg fc-settings-toggle-row bo'lsin.
    const before = app.slice(Math.max(0, idx - 600), idx);
    const lastRow = before.lastIndexOf('<label class="fc-settings-toggle-row"');
    const lastDiv = before.lastIndexOf('<div class=');
    assert.ok(lastRow > lastDiv, `${id} bir xil fc-settings-toggle-row qatorida bo\'lishi kerak`);
  }
});

// 3-paket, 7.UI.4-band: bosqichli chegirma guruhining "Holati" ATAYLAB
// toggle EMAS — spec/screenshot aniq "Faol / Nofaol segmented" talab qiladi
// (reference: 2.1/2.2 bosqichli chegirma.png), shuning uchun `tier-f-active`
// endi yo'q — o'rniga `setTierDraftActive(true/false)` ikki tugmali tab.
test("bosqichli chegirma guruhining Holati — screenshot bo'yicha segmented Faol/Nofaol tugmalari (toggle emas)", () => {
  assert.doesNotMatch(app, /id="tier-f-active"/);
  assert.match(app, /setTierDraftActive\(true\)/);
  assert.match(app, /setTierDraftActive\(false\)/);
  const start = app.indexOf("function setTierDraftActive");
  assert.match(app.slice(start, start + 200), /tierDraft\.isActive = active/);
});

test('har bir toggle qatori sarlavha bilan birga IZOH ham beradi — admin qaysi tumbler nimani anglatishini bilishi uchun', () => {
  const rows = app.match(/<label class="fc-settings-toggle-row">[\s\S]{0,700}?<\/label>/g) || [];
  assert.ok(rows.length >= 9, `kamida 9 ta toggle qatori kutilgan edi, topildi: ${rows.length}`);
  for (const row of rows) {
    assert.match(row, /<b>/, 'sarlavha bo\'lishi kerak');
    assert.match(row, /<small>/, 'izoh bo\'lishi kerak — aks holda tumbler nimaligi tushunarsiz qoladi');
    assert.match(row, /class="fc-toggle(?:\s+[^"]*)?"/, 'tumblerning o\'zi bo\'lishi kerak');
  }
});
