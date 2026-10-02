const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const base=fs.readFileSync(path.join(root,'web/styles/base.css'),'utf8');
const documentCss=fs.readFileSync(path.join(root,'web/styles/document.css'),'utf8');
const styleIndex=fs.readFileSync(path.join(root,'web/styles/index.css'),'utf8');
const shells=fs.readFileSync(path.join(root,'web/styles/shells.css'),'utf8');

test('Astra-9b premium document removes browser body margin and owns the viewport',()=>{
  assert.match(styleIndex,/document\.css/);
  assert.match(documentCss,/body\s*\{[\s\S]*?margin:\s*0;/);
  assert.match(documentCss,/#ustore-web-app\s*\{[\s\S]*?min-height:\s*100dvh;/);
});

test('Astra-9b skip link is visually hidden until keyboard focus',()=>{
  assert.match(base,/\.uw-skip-link\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?transform:\s*translateY\(calc\(-100% - 1rem\)\)/);
  assert.match(base,/\.uw-skip-link:focus,[\s\S]*?\.uw-skip-link:focus-visible\s*\{[\s\S]*?transform:\s*translateY\(0\)/);
});

test('Astra-9b customer shell pushes short-page footer to the viewport bottom',()=>{
  assert.match(shells,/\.uw-customer-shell\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/);
  assert.match(shells,/\.uw-customer-main\s*\{[\s\S]*?flex:\s*1 0 auto;/);
});
