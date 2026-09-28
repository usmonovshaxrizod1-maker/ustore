import {createButton,createStatePanel} from '../../components/ui.js';
import {loadExcelEngine} from '../../runtime/admin-assets.js';
import {createExcelImportController,createBillzImportController,createAdminImportsView} from './imports.js';

export async function createAdminImportsPage({adminPort,catalogPort,actor,onBack,documentRef=globalThis.document,engineLoader=loadExcelEngine}={}){
  const permissions=actor?.permissions||[];const can=p=>permissions.includes('*')||permissions.includes(p);
  let categories=[],products=[],disposed=false;
  const scopedAdmin={invoke:(...args)=>disposed?Promise.resolve({ok:false,error:{code:"CONFLICT",message:"Import sahifasi yopilgan"}}):adminPort.invoke(...args)};
  async function reloadCatalog(){
    const [c,p]=await Promise.all([catalogPort.listCategories({all:true}),catalogPort.listProducts({})]);
    if(!c.ok||!p.ok)throw new Error((c.error||p.error)?.message||'Katalog yuklanmadi');
    categories=c.data.items;products=p.data.items;
  }
  await reloadCatalog();
  const engine=can('products.import_export')?await engineLoader():null;
  function onCatalogMutation(kind,value){
    if(!value?.id)return;
    const rows=kind==='category'?categories:products;
    const index=rows.findIndex(row=>String(row.id)===String(value.id));
    if(index<0)rows.push(value);else rows[index]={...rows[index],...value};
  }
  const excel=engine?createExcelImportController({adminPort:scopedAdmin,actor,excelEngine:engine,getCategories:()=>categories,getProducts:()=>products,reloadCatalog,onCatalogMutation}):{getState:()=>({allowed:false})};
  const billz=createBillzImportController({adminPort:scopedAdmin,actor,shopCategories:categories});
  const root=documentRef.createElement('div');const host=documentRef.createElement('div');
  root.append(createButton({label:'Mahsulotlarga qaytish',onClick:onBack},documentRef),host);
  let lastKey=null;
  function render(){
    const b=billz.getState();const {search,oldPricePercent,...structural}=b;
    const key=JSON.stringify([excel.getState(),structural]);if(key===lastKey)return;lastKey=key;
    const view=createAdminImportsView({excelController:excel,billzController:billz,documentRef});
    host.replaceChildren(view.element);
    const error=excel.getState().error;if(error)host.append(createStatePanel({kind:'error',title:'Import ochilmadi',message:error.message},documentRef));
  }
  const unsubs=[excel.subscribe?.(render),billz.subscribe(render)];render();
  return {element:root,async load(){await Promise.all([excel.load?.(),billz.load()]);},destroy(){disposed=true;unsubs.forEach(fn=>fn?.());engine?.configure({onChange:null,onCatalogMutation:null,onImportComplete:null,reloadCatalog:null,api:async()=>{throw new Error('Import sahifasi yopilgan');}});}};
}
