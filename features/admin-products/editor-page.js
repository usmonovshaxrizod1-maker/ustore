import { createButton, createStatePanel } from '../../components/ui.js';
import { createAdminProductEditorController, createAdminProductEditorView } from './editor.js';

// Draft input updates must not replace the focused input on each keystroke.
export function editorRenderKey(state) {
  return JSON.stringify([state.status,state.mode,state.busy,state.success,state.error,state.fieldErrors,
    state.draft?.id,state.draft?.variants?.length,state.draft?.imageFile?.name,
    state.draft?.variants?.map(row=>row.imageFile?.name)]);
}

export function createAdminProductEditorPage({adminPort,actor,productId,categories=[],onBack,documentRef=globalThis.document}={}) {
  const controller=createAdminProductEditorController({adminPort,actor});
  const root=documentRef.createElement('div');
  const body=documentRef.createElement('div');
  root.append(createButton({label:'Mahsulotlarga qaytish',variant:'secondary',onClick:onBack},documentRef),body);
  let previousKey=null;
  const unsubscribe=controller.subscribe(state=>{
    const key=editorRenderKey(state);
    if(key===previousKey)return;
    previousKey=key;
    if(state.status==='idle'||state.status==='loading') {
      body.replaceChildren(createStatePanel({kind:'loading',title:'Mahsulot yuklanmoqda…'},documentRef));
    } else if(state.status==='error'||state.status==='permission') {
      body.replaceChildren(createStatePanel({kind:state.status==='permission'?'permission':'error',title:'Mahsulot ochilmadi',message:state.error?.message||'Ruxsat yoki tarmoqni tekshiring.',actionLabel:'Qayta urinish',onAction:()=>productId?controller.load(productId):controller.openCreate({categories})},documentRef));
    } else {
      body.replaceChildren(createAdminProductEditorView({controller,documentRef}).element);
    }
  });
  return {element:root,controller,load:()=>productId ? controller.load(productId) : controller.openCreate({categories}),destroy:unsubscribe};
}
