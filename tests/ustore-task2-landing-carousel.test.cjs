const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const backend = read('supabase/functions/platform-api/index.ts');
const mini = read('platform/platform-app.js');
const web = read('web/features/platform-home/platform-home.js');
const webAdmin = read('web/features/platform-admin/platform-admin.js');
const migration = read('supabase/migrations/119_platform_landing_slides.sql');

test('single persistent storage with locked max ten and admin-only mutations', () => {
  assert.match(migration, /platform_landing_slides/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, />= 10/);
  assert.match(migration, /enable row level security/);
  for (const action of ['platform_admin_landing_list', 'platform_admin_landing_upload', 'platform_admin_landing_delete', 'platform_admin_landing_reorder']) {
    assert.match(backend, new RegExp(`case '${action}': \\{\\s*requirePlatformSuperAdmin\\(\\)`));
    assert.match(mini, new RegExp(action));
    assert.match(webAdmin, new RegExp(action));
  }
  assert.match(backend, /LANDING_BUCKET = 'platform-landing'/);
  assert.match(backend, /landingImageDimensions\(binary,mime\)/);
});

test('Web public catalog and Mini App boot both retrieve the SAME landing slides', () => {
  assert.match(backend, /platform_public_catalog/);
  assert.match(backend, /landingSlides = await listLandingSlides\(db\)/g);
  assert.match(web, /result\.data\?\.landingSlides/);
  assert.match(mini, /data\.landingSlides/);
  assert.doesNotMatch(web, /SHOWCASE\.map/);
  assert.doesNotMatch(mini, /LANDING_SHOWCASE_SLIDES\.map/);
});

test('responsive slider navigation and zero/single-image state', () => {
  assert.match(web, /if\s*\(!slides\.length\)/);
  assert.match(web, /if\(slides\.length>1\)/);
  assert.match(web, /5000/);
  assert.match(web, /touchstart/);
  assert.match(mini, /images\.length>1/);
  assert.match(mini, /5000/);
  assert.match(read('platform/platform.css'), /\.plat-photo-showcase/);
  assert.match(read('web/styles/features.css'), /\.uw-platform-photo-showcase/);
});

test('Web home controller accepts the ten canonical server slides without changing tariffs', async () => {
  const { createPlatformHomeController } = await import('../web/features/platform-home/platform-home.js');
  let requested = '';
  const controller = createPlatformHomeController({ platformPort: { invoke: async (action) => {
    requested = action;
    return { ok: true, data: { tariffs: [{ id: 'start', name: 'Start', price: 39000 }], landingSlides: Array.from({ length: 11 }, (_, i) => ({ id: String(i), imageUrl: `https://example.com/${i}.webp` })) } };
  } } });
  await controller.load();
  assert.equal(requested, 'platform_public_catalog');
  assert.equal(controller.getState().tariffs[0].name, 'Start');
  assert.equal(controller.getState().landingSlides.length, 10);
});

test('Web admin controller permits central Super Admin, persists reordering/deletion', async () => {
  const { createPlatformAdminController } = await import('../web/features/platform-admin/platform-admin.js');
  const seen = [];
  const slide = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', imageUrl: 'https://example.com/a.webp' };
  const controller = createPlatformAdminController({ platformPort: { invoke: async (action) => {
    seen.push(action);
    if (action === 'platform_boot') return { ok:true, data:{ isSuperAdmin:true } };
    if (action === 'platform_admin_landing_list') return {ok:true, data:{slides:[slide]}};
    return {ok:true, data:{slides:[]}};
  } } });
  await controller.load();
  await controller.loadSection('landing');
  assert.equal(controller.getState().landingSlides[0].id, slide.id);
  await controller.reorderLandingSlides([slide.id]);
  await controller.deleteLandingSlide(slide.id);
  assert.ok(seen.includes('platform_admin_landing_reorder'));
  assert.ok(seen.includes('platform_admin_landing_delete'));
});
