const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'config.public.js'), 'utf8');
const configExample = fs.readFileSync(path.join(root, 'config.public.example.js'), 'utf8');

test('admin coordinate picker is OpenStreetMap + Leaflet and requires no Yandex API key', () => {
  assert.doesNotMatch(app, /YANDEX_MAPS_API_KEY|api-maps\.yandex\.ru|window\.ymaps|ensureYandexMapsLoaded/);
  assert.doesNotMatch(config, /YANDEX_MAPS_API_KEY/);
  assert.doesNotMatch(configExample, /YANDEX_MAPS_API_KEY/);
  assert.match(app, /function openOsmCoordinatePicker\(\)/);
  assert.match(app, /function confirmOsmCoordinatePicker\(\)/);
});

// PERFORMANCE ROUND 1 (2026-09-03): Leaflet CSS/JS o'chirildi index.html'ning
// <head>'idan — u avval HAR safar ilova ochilganda (admin xarita tugmasini
// bosmasa ham) yuklanardi. Endi ensureLeafletLoaded() faqat picker birinchi
// ochilganda, mavjud ensureScript()/yangi ensureStylesheet() lazy-load
// naqshi bilan yuklaydi — eski SRI hash'lar shu yerga (JS konstantalariga)
// ko'chirildi, xavfsizlik darajasi o'zgarmadi.
test('Leaflet stable 1.9.4 is stripped from the eager <head> and lazy-loaded (with SRI) only when the map picker actually opens', () => {
  assert.doesNotMatch(html, /leaflet@1\.9\.4/, 'Leaflet must not be an eager <head> tag anymore — every boot was paying for it unconditionally');
  assert.match(app, /const LEAFLET_CSS_URL = 'https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.css';/);
  assert.match(app, /const LEAFLET_JS_URL = 'https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js';/);
  assert.match(app, /const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN\+hmNHrzRCf9tD\/miZyoHS5obTRR9BMY=';/);
  assert.match(app, /const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2\/Z9VM\+kNiyxNV1lvTlZBo=';/);
  assert.match(app, /function ensureStylesheet\(href, integrity\)/);
  const fnStart = app.indexOf('function ensureLeafletLoaded()');
  const fnBlock = app.slice(fnStart, app.indexOf('\n    }', fnStart) + 6);
  assert.match(fnBlock, /if \(window\.L\?\.map && window\.L\?\.tileLayer && window\.L\?\.marker\) return Promise\.resolve\(window\.L\);/, 'an already-loaded Leaflet must resolve immediately, no redundant reload');
  assert.match(fnBlock, /ensureStylesheet\(LEAFLET_CSS_URL, LEAFLET_CSS_SRI\)/);
  assert.match(fnBlock, /ensureScript\(LEAFLET_JS_URL, LEAFLET_JS_SRI\)/);
  // ensureScript() must actually apply the integrity/crossOrigin it's given.
  const ensureScriptStart = app.indexOf('function ensureScript(src, integrity)');
  const ensureScriptBlock = app.slice(ensureScriptStart, app.indexOf('\n    }', ensureScriptStart) + 6);
  assert.match(ensureScriptBlock, /if \(integrity\) \{ sc\.integrity = integrity; sc\.crossOrigin = ''; \}/);
});

test('picker uses the official OSM tile endpoint and visible attribution', () => {
  assert.match(app, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(app, /OpenStreetMap<\/a> contributors/);
  assert.match(css, /\.fc-osm-map \.leaflet-control-attribution/);
  assert.doesNotMatch(css, /display\s*:\s*none[^}]*leaflet-control-attribution|leaflet-control-attribution[^}]*display\s*:\s*none/s);
});

test('picker supports map click and draggable marker then writes lat,lng into the existing coordinates input', () => {
  assert.match(app, /L\.marker\(current, \{ draggable: true, autoPan: true \}\)/);
  assert.match(app, /osmPickerMarker\.on\('dragend', enable\)/);
  assert.match(app, /osmPickerMap\.on\('click', \(e\) =>/);
  assert.match(app, /osmPickerMarker\.setLatLng\(e\.latlng\)/);
  assert.match(app, /document\.getElementById\('sc-coordinates'\)/);
  assert.match(app, /Number\(point\.lat\)\.toFixed\(6\).*Number\(point\.lng\)\.toFixed\(6\)/s);
});

test('admin map button is provider-neutral, while customer chooser still offers both Google Maps and Yandex Maps', () => {
  assert.match(app, /onclick="openOsmCoordinatePicker\(\)"/);
  assert.match(app, /Xaritadan tanlash/);
  assert.match(app, /<b>Google Maps<\/b>/);
  assert.match(app, /<b>Yandex Maps<\/b>/);
  assert.match(app, /https:\/\/yandex\.com\/maps\/\?pt=/);
  assert.match(app, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
});

test('old Yandex picker DOM/CSS names are fully removed', () => {
  assert.doesNotMatch(app, /fc-yandex-picker-root|fc-yandex-map|openYandexCoordinatePicker|closeYandexCoordinatePicker|confirmYandexCoordinatePicker/);
  assert.doesNotMatch(css, /fc-yandex-map/);
  assert.match(css, /fc-osm-map/);
});
