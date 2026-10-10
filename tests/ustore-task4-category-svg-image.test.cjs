'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const shop=fs.readFileSync(path.join(root,'ustore-shop-app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'ustore.css'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/shop-api/index.ts'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/121_category_visual_modes.sql'),'utf8');
function sourceFunction(name,nextName){
  const start=shop.indexOf('    function '+name+'(');
  const end=shop.indexOf('    function '+nextName+'(',start);
  assert.ok(start>=0&&end>start);
  return shop.substring(start,end);
}
test('original SVGs and transparent category images use independent safe render modes',()=>{
  const sandbox={CATEGORY_ICON_COLORS:['brand'],CATEGORY_ICON_SPRITE:'category-icons.svg',customCategoryIconMap:new Map(),escapeHtml:value=>String(value).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))};
  vm.runInNewContext(sourceFunction('categoryIconMarkup','categoryIconPickerItems')+'this.icon=categoryIconMarkup',sandbox);
  const a=sandbox.icon({iconType:'emoji',iconEmoji:'🍕',iconId:'sports_ball'});
  assert.match(a,/#sports_ball/);assert.doesNotMatch(a,/🍕|fc-category-native-emoji/);
  const b=sandbox.icon({iconType:'image',img:'https://cdn.example.com/logo-alpha.png'});
  assert.match(b,/<img/);assert.match(b,/logo-alpha.png/);assert.match(b,/fc-category-visual-image/);
  const c=sandbox.icon({iconType:'legacy',iconId:'stationery_folder',iconColor:'brand'});
  assert.match(c,/<svg/);assert.match(c,/stationery_folder/);
  const escaped=sandbox.icon({iconType:'image',img:'javascript:alert(1)'});
  assert.doesNotMatch(escaped,/<img/);
});
test('per-category visual selection is saved in shop API and returned to all catalog clients',()=>{
  assert.match(shop,/iconType: r\.icon_type/);
  assert.match(shop,/iconEmoji: r\.icon_emoji/);
  assert.match(shop,/categoryVisualSavePayload\(/);
  assert.match(shop,/\.\.\.visualPayload/);
  assert.match(edge,/case "add_category"[\s\S]*?icon_type: iconType, icon_emoji:iconEmoji/);
  assert.match(edge,/case "edit_category"[\s\S]*?dbUpdate\.icon_type = kind/);
  assert.match(edge,/category_image_required/);
  assert.doesNotMatch(shop,/CATEGORY_EMOJI_OPTIONS|chooseCategoryEmoji|fc-category-emoji-grid/);
  assert.doesNotMatch(edge,/categoryEmojiIsValid|dbUpdate\.icon_emoji\s*=/);
  assert.match(edge,/select\("id,name,name_ru,parent_id,img,icon_id,icon_color,icon_type,icon_emoji,sort_order"\)/);
  assert.match(migration,/alter table public\.categories add column if not exists icon_type/);
  assert.match(migration,/alter table public\.categories add column if not exists icon_emoji/);
});
test('transparent PNG and WebP are not rendered as opaque square thumbnails',()=>{
  assert.match(css,/\.fc-category-visual-image\{[^}]*object-fit:contain/);
  assert.match(css,/\.fc-featured-cat-icon img\.fc-category-visual-image/);
  assert.match(css,/background:transparent!important/);
  assert.match(shop,/file\.type === 'image\/png' \|\| file\.type === 'image\/webp'/);
  assert.match(shop,/const requestedType = mayNeedAlpha \? 'image\/webp' : 'image\/jpeg'/);
  assert.match(shop,/resetCategoryVisualDraft\(c\)/);
});

test('image upload preserves original alpha source when WebView compression silently falls back to JPEG',async()=>{
  const begin=shop.indexOf('    async function categoryVisualSavePayload(');
  const end=shop.indexOf('    let categoryIconManifest =',begin);
  assert.ok(begin>=0&&end>begin);
  const png={type:'image/png',size:5000,name:'alpha.png'};
  const jpegFallback={type:'image/jpeg',size:2500,name:'alpha.jpg'};
  let encoded=null;
  const sandbox={
    categoryVisualDraft:{type:'image',file:png,imageUrl:null},
    compressImageToLimit:async()=>jpegFallback,
    fileToBase64:async f=>{encoded=f;return 'YWJj';},
    tr:s=>s,
  };
  vm.runInNewContext(shop.slice(begin,end)+'this.save = categoryVisualSavePayload',sandbox);
  const result=await sandbox.save();
  assert.equal(encoded,png);
  assert.equal(result.imageUpload.mimeType,'image/png');
});
