// USTORE — "mini app qotib qoladi" sinfidagi xatolarga qarshi himoya testlari.
//
// Bu fayldagi har bir test AYNAN bir marta HAQIQATAN yuz bergan (yoki yuz
// berishi mumkin bo'lgan) qotish sababini qulflab qo'yadi. Ularning umumiy
// jihati: xatoning o'zi kichkina, lekin oqibati og'ir — ilova butunlay javob
// bermay qoladi va foydalanuvchi sababini bilolmaydi.
//
// Bir qismi HAQIQIY ishga tushiriladigan testlar (readStoredJson/
// safeCreateIcons manbadan ajratib olinib, boshqariladigan muhitda
// bajariladi) — statik matn qidirish emas, chunki bu funksiyalarning
// xatoni YUTISHI kodning matnida emas, xatti-harakatida.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(__dirname, '..', 'ustore-shop-app.js');
const app = fs.readFileSync(APP_PATH, 'utf8');

// Manbadan bitta funksiyani (qavslarni sanab) ajratib oladi — shu bilan
// funksiyani haqiqatan ishga tushirib ko'rish mumkin bo'ladi.
function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `manbada "${signature}" topilmadi`);
  let depth = 0, i = source.indexOf('{', start);
  assert.notEqual(i, -1, `"${signature}" uchun tana topilmadi`);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error(`"${signature}" yopilmagan`);
}

// ---------------------------------------------------------------------------
// A) Ilova ishga tushishini butunlay to'xtatadigan xatolar.
// ---------------------------------------------------------------------------

test('Supabase klienti fayl yuklanayotganda EMAS, faqat kerak bo'
  + 'lganda yaratiladi — CDN javob bermasa ham ilova ishga tushaveradi', () => {
  // Avval bu `const sb = supabase.createClient(...)` sifatida faylning eng
  // boshida turardi: cdn.jsdelivr.net yiqilsa `supabase` global'i bo'lmaydi va
  // shu qator BUTUN faylni to'xtatib qo'yardi — boot() umuman chaqirilmasdi.
  assert.doesNotMatch(app, /^\s*const sb = supabase\.createClient\(/m,
    'Supabase klienti hech qachon modul darajasida yaratilmasligi kerak');
  assert.match(app, /async function sbClient\(\) \{[\s\S]{0,1200}?if \(!window\.supabase\?\.createClient\)/,
    'sbClient() kerak bo‘lganda SDK yuklanishini kutishi kerak');
  assert.match(app, /let _sbClient = null;/, 'klient bir marta yaratilib keshlanishi kerak');
  // Ikkala haqiqiy foydalanish nuqtasi ham lazy klientdan o'tishi shart.
  const rawUses = app.match(/(?<!function )\bsb\.storage\b/g) || [];
  assert.equal(rawUses.length, 0, 'hech qayerda eski global `sb` ishlatilmasligi kerak');
  assert.equal((app.match(/\(await sbClient\(\)\)\.storage/g) || []).length, 3,
    'Mahsulot, chek va support rasmi yuklashlari sbClient() orqali o\'tishi kerak');
});

test('localStorage\'dan o\'qiladigan HECH BIR JSON xom JSON.parse bilan o\'qilmaydi — buzuq qiymat ilovani doimiy o\'ldirmaydi', () => {
  // Bu eng yomon sinf edi: buzuq qiymat xotirada qolgani uchun ilovani
  // yopib-qayta ochish ham yordam bermasdi — telefon butunlay "o'lik" bo'lib
  // qolardi.
  const rawStorageParses = app.match(/JSON\.parse\(\s*(?:local|session)Storage\.getItem/g) || [];
  assert.deepEqual(rawStorageParses, [],
    'storage qiymatlari faqat readStoredJson/readStoredObject orqali o\'qilishi kerak');
  for (const [name, key] of [['cart', 'cart'], ['bundleCart', 'bundleCart'], ['registeredUser', 'registeredUser'], ['checkoutDraft', 'checkoutDraft']]) {
    assert.match(app, new RegExp(`let ${name} = readStoredObject\\(scopedKey\\('${key}'\\)`),
      `${name} himoyalangan o'qish orqali yuklanishi kerak`);
  }
});

test('readStoredJson HAQIQATAN buzuq JSON\'da xato bermaydi, standart qiymat qaytaradi va buzuq yozuvni tozalaydi', () => {
  const store = new Map([
    ['ok', '{"a":1}'],
    ['buzuq', '{not json at all'],
    ['bosh', ''],
    ['null', 'null'],
  ]);
  const removed = [];
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    removeItem: (k) => { removed.push(k); store.delete(k); },
  };
  const fn = new Function('localStorage', `${extractFunction(app, 'function readStoredJson(key, fallback)')}; return readStoredJson;`)(localStorage);

  assert.deepEqual(fn('ok', 'FALLBACK'), { a: 1 }, 'to\'g\'ri JSON o\'zgarishsiz qaytishi kerak');
  assert.equal(fn('buzuq', 'FALLBACK'), 'FALLBACK', 'buzuq JSON xato bermay, standart qiymat qaytarishi kerak');
  assert.deepEqual(removed, ['buzuq'], 'buzuq yozuv keyingi safar ham xalaqit bermasligi uchun o\'chirilishi kerak');
  assert.equal(fn('bosh', 'FALLBACK'), 'FALLBACK', 'bo\'sh qiymat standart qiymatga tushishi kerak');
  assert.equal(fn('null', 'FALLBACK'), 'FALLBACK', '"null" saqlangan bo\'lsa ham standart qiymat qaytishi kerak');
  assert.equal(fn('umuman-yoq', 'FALLBACK'), 'FALLBACK', 'kalit yo\'q bo\'lsa standart qiymat qaytishi kerak');
});

test('readStoredObject turi noto\'g\'ri bo\'lgan (massiv/matn/son) qiymatni ham rad etadi — Object.entries("abc") savatni jimgina axlatga aylantirmasligi uchun', () => {
  const store = new Map([['massiv', '[]'], ['matn', '"abc"'], ['son', '5'], ['obyekt', '{"x":1}']]);
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), removeItem: () => {} };
  const src = `${extractFunction(app, 'function readStoredJson(key, fallback)')};${extractFunction(app, 'function readStoredObject(key, fallback)')}; return readStoredObject;`;
  const fn = new Function('localStorage', src)(localStorage);

  assert.deepEqual(fn('obyekt', 'FB'), { x: 1 });
  assert.equal(fn('massiv', 'FB'), 'FB', 'massiv obyekt sifatida qabul qilinmasligi kerak');
  assert.equal(fn('matn', 'FB'), 'FB', 'matn qabul qilinmasligi kerak — aks holda Object.entries harflar bo\'yicha aylanadi');
  assert.equal(fn('son', 'FB'), 'FB', 'son qabul qilinmasligi kerak');
});

// ---------------------------------------------------------------------------
// B) Har bir render\'ni to'xtatadigan tashqi kutubxona xatosi.
// ---------------------------------------------------------------------------

test('lucide hech qayerda to\'g\'ridan-to\'g\'ri chaqirilmaydi — hammasi safeCreateIcons() orqali, shu jumladan render() ichida', () => {
  // CDN (unpkg.com) sekin/bloklangan bo'lsa `lucide` global'i bo'lmaydi.
  // Avval 6 joyda himoya yo'q edi, eng muhimi render() ichida — natijada
  // har bir bosishda xato chiqib, ilova qotgandek ko'rinardi.
  const codeLines = app.split('\n').filter((l) => !l.trim().startsWith('//'));
  const direct = codeLines.filter((l) => /lucide\.createIcons\(\)/.test(l) && !/window\.lucide\.createIcons\(\)/.test(l));
  assert.deepEqual(direct, [], 'xom lucide.createIcons() chaqiruvi qolmasligi kerak');

  const renderStart = app.indexOf('function render() {');
  assert.notEqual(renderStart, -1);
  const renderBody = app.slice(renderStart, app.indexOf('\n    }', renderStart));
  assert.match(renderBody, /safeCreateIcons\(\);/, 'render() himoyalangan variantni ishlatishi kerak');
});

test('safeCreateIcons HAQIQATAN xatoni yutadi va O\'ZINI chaqirmaydi (cheksiz rekursiya bo\'lmasligi kerak)', () => {
  const body = extractFunction(app, 'function safeCreateIcons()');
  // Rekursiya qulfi: bu xato bir marta haqiqatan yuz bergan (ommaviy almashtirish
  // funksiyaning o'z ichini ham o'zgartirib, window.safeCreateIcons() qilib qo'ygan).
  assert.doesNotMatch(body, /window\.safeCreateIcons|[^a-zA-Z]safeCreateIcons\(\)\s*;/,
    'safeCreateIcons hech qachon o\'zini chaqirmasligi kerak');

  const warnings = [];
  const makeFn = (lucide) => new Function('window', 'console', `${body}; return safeCreateIcons;`)(
    { lucide }, { warn: (...a) => warnings.push(a) },
  );

  // 1) Kutubxona umuman yuklanmagan.
  assert.doesNotThrow(() => makeFn(undefined)(), 'lucide yo\'q bo\'lsa xato bermasligi kerak');
  // 2) Yuklangan, lekin createIcons() o'zi yiqiladi (lucide@latest yangilanib buzilsa).
  let called = 0;
  assert.doesNotThrow(() => makeFn({ createIcons: () => { called++; throw new Error('lucide ichki xatosi'); } })(),
    'createIcons() xato bersa ham ilova to\'xtamasligi kerak');
  assert.equal(called, 1, 'kutubxona bor bo\'lsa u haqiqatan chaqirilishi kerak');
  assert.equal(warnings.length, 1, 'xato jimgina yo\'qolmasdan, konsolga yozilishi kerak');
  // 3) Normal holat.
  let ok = 0;
  makeFn({ createIcons: () => { ok++; } })();
  assert.equal(ok, 1);
});

// ---------------------------------------------------------------------------
// C) Ekranni bloklab qoladigan holatlar.
// ---------------------------------------------------------------------------

test('submitOrder: showLoader()dan keyingi barcha kod try ichida — to\'liq ekranli oyna hech qachon osilib qolmaydi', () => {
  const start = app.indexOf('showLoader(tr("Buyurtma qabul qilinmoqda...');
  assert.notEqual(start, -1);
  const tryIdx = app.indexOf('try {', start);
  const between = app.slice(start, tryIdx);
  // showLoader va try orasida faqat izoh/bo'sh qator bo'lishi mumkin —
  // bironta bajariladigan ifoda ham bo'lmasligi kerak, chunki u yerdagi xato
  // `finally`ni butunlay chetlab o'tadi va oyna abadiy qolib ketadi.
  const executable = between.split('\n').slice(1).map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'));
  assert.deepEqual(executable, [], 'showLoader() va try orasida bajariladigan kod bo\'lmasligi kerak');
  // Va tozalash haqiqatan finally'da bo'lishi kerak.
  const submitBlock = app.slice(start, start + 9000);
  assert.match(submitBlock, /\} finally \{\s*\n\s*submittingOrder = false;\s*\n\s*hideLoader\(\);/,
    'submittingOrder va loader har qanday holatda ham tozalanishi kerak');
});

test('umumiy xato tarmog\'i: error va unhandledrejection ikkalasi ham ushlanadi, faylning eng boshida ulanadi va osilgan loader\'ni majburan yopadi', () => {
  assert.match(app, /window\.addEventListener\('error',[\s\S]{0,120}?reportFatalAppError/);
  assert.match(app, /window\.addEventListener\('unhandledrejection',[\s\S]{0,120}?reportFatalAppError/);

  // Eng boshida bo'lishi SHART — undan keyingi qatorlardagi xatoni tutishi uchun.
  const handlerIdx = app.indexOf('function reportFatalAppError');
  const loaderIdx = app.indexOf('function showLoader');
  assert.ok(handlerIdx !== -1 && handlerIdx < loaderIdx,
    'xato tarmog\'i ilovaning qolgan kodidan OLDIN ulanishi kerak');

  const body = extractFunction(app, 'function reportFatalAppError(source, error)');
  assert.match(body, /getElementById\('global-loader'\)\?\.classList\.add\('hidden'\)/,
    'xatodan keyin bloklovchi oyna majburan yopilishi kerak');
  assert.match(body, /appReady/, 'ishlab turgan ilovada bitta mayda xato butun ekranni egallamasligi kerak');
  assert.match(body, /catch \(_\) \{/, 'xato ishlovchisining o\'zi yangi xato tug\'dirmasligi kerak');
  // Ishga tushmagan holatdagi to'liq ekranli xabar index.html'dagi
  // "boot fail-safe" ning ishi — bu ishlovchi unga TEGMASLIGI kerak,
  // aks holda ikkita turli xabar bir-birini bosib qoladi.
  assert.doesNotMatch(body, /app-content|location\.reload\(\)/,
    'ishga tushmagan holatdagi ekranni index.html fail-safe boshqaradi, bu yerda takrorlanmasligi kerak');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /window\.addEventListener\('error', \(event\) => \{[\s\S]*setTimeout\(showBootFailure, 0\)/,
    'index.html fail-safe hali ham mavjud bo\'lishi kerak (ikkalasi bir-birini to\'ldiradi)');
  assert.match(html, /setTimeout\(showBootFailure, 15000\)/,
    'boot hech qachon tugamasa ham 15 soniyadan keyin xabar chiqishi kerak');
});

test('xato xabari uchun ishlatiladigan toast holati (data-state="error") CSS\'da haqiqatan mavjud — aks holda xabar ko\'rinmaydi', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /#action-toast\[data-state="error"\]\s*\{[^}]*\}/,
    'error holati stillanmagan bo\'lsa, foydalanuvchi xabarni umuman ko\'rmaydi');
  assert.match(app, /toast\.dataset\.state = 'error';/);
});

// ---------------------------------------------------------------------------
// D) Sekin to'planib boradigan muammolar.
// ---------------------------------------------------------------------------

test('startStaffAccessSync quloq soluvchilarni faqat BIR MARTA ulaydi — boot() qayta ishga tushsa ham nusxalar to\'planmaydi', () => {
  const body = extractFunction(app, 'function startStaffAccessSync()');
  assert.match(body, /if \(staffAccessTimer\) clearInterval\(staffAccessTimer\);/,
    'taymer qayta ulanishdan oldin tozalanishi kerak');
  assert.match(body, /if \(staffAccessListenersBound\) return;\s*\n\s*staffAccessListenersBound = true;/,
    'listener\'lar qo\'shilishidan oldin bir martalik qulf tekshirilishi kerak');
  // Qulf listener qo'shishdan OLDIN turishi shart.
  assert.ok(body.indexOf('staffAccessListenersBound = true;') < body.indexOf('addEventListener'),
    'qulf addEventListener\'dan oldin o\'rnatilishi kerak');
});

test('fon polling taymeri qayta ulanishdan oldin doim tozalanadi (ikkinchi nusxa ishlamasligi uchun)', () => {
  const body = extractFunction(app, 'function startBackgroundPolling()');
  assert.match(body, /if \(pollTimer\) clearInterval\(pollTimer\);/);
  assert.ok(body.indexOf('clearInterval(pollTimer)') < body.indexOf('setInterval'),
    'eski taymer yangisidan oldin to\'xtatilishi kerak');
});
