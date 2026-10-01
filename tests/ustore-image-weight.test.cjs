// USTORE — rasm og'irligi (sahifa ochilganda rasmlar tez chiqishi uchun).
//
// Kontekst: mijozlar "rasmlar 3-4 soniya chiqmaydi" deb shikoyat qilgan.
// Brauzerda o'lchandi (1000px shovqinli fotosurat, haqiqiy canvas kodlash):
//     PNG            -> 2140 KB
//     JPEG q0.8      ->  261 KB
//     WebP 800 q0.75 ->  157 KB
//     WebP 320 q0.72 ->   25 KB
// Ya'ni PNG sifatida yuklangan rasm siqilmasdan qolib ketardi va bitta
// sahifadagi 10 ta kartochka 20 MB dan oshardi.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

function fnBody(signature) {
  const start = app.indexOf(signature);
  assert.notEqual(start, -1, `manbada "${signature}" topilmadi`);
  let depth = 0, i = app.indexOf('{', start);
  for (; i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}') { depth--; if (depth === 0) return app.slice(start, i + 1); }
  }
  throw new Error('yopilmagan');
}

test('KRITIK: PNG endi PNG bo\'lib saqlanmaydi — u WebP\'ga o\'giriladi, chunki PNG yo\'qotishsiz format va `quality` unga UMUMAN ta\'sir qilmaydi', () => {
  const body = fnBody('async function compressImage(file, maxDim, quality)');
  // Eski (muammoli) mantiq qaytib kelmasligi kerak.
  assert.doesNotMatch(body, /file\.type === 'image\/png' \? 'image\/png'/,
    'PNG kirsa PNG chiqarish — aynan shu rasmlarni megabaytlab qoldirardi');
  assert.doesNotMatch(body, /outputType === 'image\/png' \? undefined : quality/,
    'PNG uchun quality o\'tkazib yuborilishi (ya\'ni siqishsiz) qaytmasligi kerak');
  // Yangi mantiq.
  assert.match(body, /const mayNeedAlpha = file\.type === 'image\/png' \|\| file\.type === 'image\/webp';/);
  assert.match(body, /const requestedType = mayNeedAlpha \? 'image\/webp' : 'image\/jpeg';/,
    'shaffofligi bo\'lishi mumkin bo\'lganlar WebP, qolgani JPEG bo\'lishi kerak');
  assert.match(body, /canvasToBlob\(canvas, requestedType, quality\)/,
    'endi HAR DOIM quality uzatilishi kerak');
});

test('shaffoflik JPEG bilan yo\'q qilinmaydi — PNG/WebP uchun nishon format ham shaffoflikni qo\'llab-quvvatlaydi', () => {
  const body = fnBody('async function compressImage(file, maxDim, quality)');
  // PNG -> JPEG bo'lsa, fon shaffof mahsulot rasmlari qora/oq quti bo'lib qolardi.
  assert.doesNotMatch(body, /mayNeedAlpha \? 'image\/jpeg'/);
  assert.match(body, /mayNeedAlpha \? 'image\/webp'/);
});

test('brauzer WebP kodlashni qo\'llab-quvvatlamasa ham hech narsa buzilmaydi — haqiqiy format blob.type\'dan olinadi, taxmin qilinmaydi', () => {
  const body = fnBody('async function compressImage(file, maxDim, quality)');
  assert.match(body, /const outputType = blob\.type \|\| requestedType;/,
    'aks holda fayl kengaytmasi haqiqiy mazmuniga mos kelmay qolardi');
  // Kengaytma outputType'dan hisoblanishi kerak, requestedType'dan emas.
  assert.match(body, /const extension = outputType === 'image\/png' \? 'png' : \(outputType === 'image\/webp' \? 'webp' : 'jpg'\)/);
  assert.match(body, /type: outputType/);
});

test('mahsulot rasmi 800px/0.75 ga tushirildi, lekin BAYT CHEGARASI o\'zgarmadi — chegarani pasaytirish rasm yuklanmay qolish xavfini tug\'diradi', () => {
  assert.match(app, /captureAndPrepareImageV2\(file, TARGET_PRODUCT_IMAGE_BYTES, 800, 0\.75,/,
    'mahsulot/kategoriya rasmi 800px, sifat 0.75 bo\'lishi kerak');
  assert.doesNotMatch(app, /captureAndPrepareImageV2\(file, TARGET_PRODUCT_IMAGE_BYTES, 1000, 0\.8\)?/,
    'eski 1000px/0.8 chaqiruvi qolmasligi kerak');
  // Chegara ATAYLAB o'zgarmagan.
  assert.match(app, /const TARGET_PRODUCT_IMAGE_BYTES = 2 \* 1024 \* 1024;/,
    'bayt chegarasi pasaytirilmasligi kerak — aks holda katta rasm yuklanmay qoladi');
  assert.match(app, /const MAX_STORED_IMAGE_BYTES = 5 \* 1024 \* 1024;/);
});

test('do\'kon logotipi 512px — u hech qachon katta ko\'rsatilmaydi (header\'da 28px)', () => {
  assert.match(app, /captureAndPrepareImageV2\(file, TARGET_PRODUCT_IMAGE_BYTES, 512, 0\.8\)/);
});

test('chek rasmi (to\'lov tasdig\'i) ataylab TEGILMAGAN — u o\'qilishi kerak bo\'lgan hujjat, siqib yuborilmasligi kerak', () => {
  const receiptCalls = app.match(/captureAndPrepareImageV2\(file, MAX_RECEIPT_BYTES, \d+, [\d.]+/g) || [];
  assert.equal(receiptCalls.length, 2, 'ikkita chek yuklash nuqtasi bo\'lishi kerak');
  for (const call of receiptCalls) {
    assert.match(call, /MAX_RECEIPT_BYTES, 1600, 0\.85/,
      'chek rasmi sifati pasaytirilmasligi kerak — admin uni o\'qiy olishi shart');
  }
});

// ---------------------------------------------------------------------------
// Kichik nusxa (thumbnail) — kartochkalar uchun
// ---------------------------------------------------------------------------

test('041 migratsiyasi additive va thumb_img NULL bo\'la oladi — eski mahsulotlar avvalgidek ishlashda davom etadi', () => {
  const m = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '041_product_thumbnails.sql'), 'utf8');
  assert.match(m, /add column if not exists thumb_img text/);
  assert.doesNotMatch(m, /not null/i, 'ustun majburiy bo\'lsa mavjud qatorlar buzilardi');
  assert.doesNotMatch(m, /drop |update public\.products set/i);
});

test('KRITIK: kichik nusxa "iloji boricha" yaratiladi — uning xatosi HECH QACHON mahsulot saqlanishini to\'xtatmaydi', () => {
  const body = fnBody('async function uploadThumbnailSnapshot(snapshot)');
  assert.match(body, /try \{/, 'butun tana try bilan o\'ralgan bo\'lishi kerak');
  assert.match(body, /catch \(e\) \{[\s\S]{0,160}?return null;/,
    'xato yuqoriga chiqmasligi, null qaytishi kerak');
  // Asosiy yuklashga strict=false bilan boradi (ya'ni xatoda ham yiqilmaydi).
  assert.match(body, /uploadImageSnapshot\(\{ file: small, preparing: Promise\.resolve\(small\), url: null \}, null, false\)/);
  // Va faqat asosiy rasm muvaffaqiyatli bo'lgandagina chaqiriladi.
  const payloadFn = fnBody('async function productImagePayloadFromSnapshot(snapshot, requireImage = false)');
  assert.match(payloadFn, /const thumbImg = uploadedUrl \? await uploadThumbnailSnapshot\(snapshot\) : null;/,
    'asosiy rasm yuklanmagan bo\'lsa kichik nusxa bilan ovora bo\'lmasligi kerak');
});

test('kichraytirishdan foyda bo\'lmasa ikkinchi nusxa umuman saqlanmaydi (ortiqcha xotira sarflanmasin)', () => {
  const body = fnBody('async function uploadThumbnailSnapshot(snapshot)');
  assert.match(body, /if \(!small \|\| small === source \|\| small\.size >= source\.size\) return null;/);
});

test('kartochka oddiy mahsulotda thumbnail/main image, variativ mahsulotda esa birinchi rang + birinchi mavjud o‘lcham kontekstini ishlatadi', () => {
  const start = app.indexOf('function renderProductCardHTML');
  const block = app.slice(start, start + 4200);
  assert.match(block, /const defaultSelection = vars\.length \? defaultVariantSelection\(p\) : null;/);
  assert.match(block, /const fallbackVariant = defaultSelection\?\.variant \|\| canonicalFallbackVariant\(p\);/);
  assert.match(block, /const cardImg = vars\.length[\s\S]*variantDisplayImage\(p, fallbackVariant\.size, fallbackVariant\.color\)[\s\S]*p\.thumbImg \|\| p\.img/);
  assert.match(block, /const cardPrice = fallbackVariant \? variantPrice\(p, fallbackVariant\.size, fallbackVariant\.color\) : p\.price;/);
  assert.match(block, /src="\$\{escapeHtml\(cardImg \|\| FALLBACK_IMG\)\}"/);
  assert.match(block, /onerror="retryCardImage\(this\)"/);
});

test('retryCardImage cheksiz aylanib qolmaydi — har qadamda o\'zini tozalaydi', () => {
  const body = fnBody('function retryCardImage(el)');
  assert.match(body, /el\.removeAttribute\('data-full-img'\)/,
    'asosiy rasmga bir marta o\'tgach, atribut olib tashlanishi kerak');
  assert.match(body, /el\.onerror = null;/,
    'zaxira belgiga o\'tishdan oldin onerror uzilishi kerak — aks holda cheksiz halqa bo\'lardi');
});

test('backend thumb_img ni qabul qiladi, tekshiradi va katalogda qaytaradi', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  // Xuddi asosiy rasm kabi tozalanadi (ixtiyoriy URL qabul qilinmaydi).
  assert.match(api, /thumb_img: normalizeProductImageUrl\(thumbImg\) \|\| null/);
  assert.match(api, /dbUpdate\.thumb_img = normalizeProductImageUrl\(payload\.thumbImg\) \|\| null;/);
  assert.match(api, /select\("id,sku,name,name_ru,price,old_price,stock,category_id,status,img,thumb_img,/,
    'katalog so\'rovi yangi ustunni ham olishi kerak');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(appJs, /thumbImg: r\.thumb_img \|\| null/);
});

test('rasm ALMASHTIRILGANDA kichik nusxa ham birga yangilanadi — aks holda kartochkada eski rasm qolib ketardi', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const idx = api.indexOf('else if (f === "img") {');
  assert.notEqual(idx, -1);
  const block = api.slice(idx, idx + 900);
  assert.match(block, /dbUpdate\.img = normalizeProductImageUrl\(v\);/);
  assert.match(block, /dbUpdate\.thumb_img =/, 'img yangilanganda thumb_img ham yozilishi SHART');
});

test('mahsulot kartochkasi rasmlari lazy yuklanadi va qolipdan chiqmaydi (mavjud himoya saqlanib qolgan)', () => {
  const start = app.indexOf('function renderProductCardHTML');
  const block = app.slice(start, start + 3500);
  assert.match(block, /loading="\$\{idx < 6 \? 'eager' : 'lazy'\}"/, 'ekrandagi birinchi rasmlar darhol, pastdagilari lazy yuklanishi kerak');
  assert.match(block, /fetchpriority="\$\{idx < 6 \? 'high' : 'auto'\}"/);
  assert.match(block, /object-contain/);
  assert.match(block, /onerror=/, 'rasm ochilmasa zaxira ko\'rinish bo\'lishi kerak');
});
