import { fail, ok } from '../ports/result.js';
import { loadJsonFixture } from './fixture-loader.js';

const DEMO_WHITELIST = new Set([
  'get_reports','list_products','list_orders','get_audit_logs',
  'get_admin_settings','set_shop_contact','set_low_stock_threshold','set_orders_paused','set_fulfillment_config','set_order_policies','set_design_settings','set_shop_logo','set_start_message',
  'click_get_status','click_connect','click_disconnect','click_start_test_payment','click_test_progress',
  'payme_get_status','payme_connect','payme_disconnect','payme_start_test_payment','payme_test_progress',
  'uzum_get_status','uzum_connect','uzum_disconnect',
  'get_admin_products','get_admin_product_editor','add_product','edit_product_field',
  'toggle_product_visibility','duplicate_product','bulk_move_products','bulk_trash_products','add_category','edit_category',
  'get_excel_template_url','start_import_batch','stage_import_products','bulk_import_products','get_category_aliases','get_last_import_batch','rollback_import_batch',
  'billz_get_status','billz_connect','billz_list_config_options','billz_save_sale_config','billz_disconnect','billz_get_categories','billz_browse_products','billz_import_products','billz_list_imported_products','billz_unlink_products','billz_list_deleted_products','billz_restore_product',
  'get_marketing_bootstrap','marketing_summary','set_featured_categories',
  'banner_list','banner_reorder','banner_create','banner_update','banner_delete',
  'promo_generate_code','promo_list','promo_create','promo_update','promo_delete','promo_usage_list',
  'bundle_list','bundle_create','bundle_update','bundle_delete',
  'discount_tier_group_list','discount_tier_group_create','discount_tier_group_update','discount_tier_group_delete',
  'automatic_gift_list','automatic_gift_create','automatic_gift_update','automatic_gift_delete',
  'reward_rule_list','reward_rule_create','reward_rule_update','reward_rule_delete',
  'get_all_orders','update_order_status',
  'role_list','role_create','role_update','role_delete','staff_list','staff_invite','staff_cancel_invite','staff_update_roles','staff_set_blocked','staff_remove','list_admin_audit_log',
  'get_dashboard_lite','get_report_overview','get_sales_report','get_customer_report','get_product_report','get_warehouse_summary','upload_report_pdf',
  'get_inventory_rows','bulk_stock_update','record_stock_in','get_stock_movements',
]);

function clone(value) { return value == null ? value : structuredClone(value); }

export function createMockAdminAdapter({ allowed = true } = {}) {
  let catalog = null;
  let importBatch = null;
  let billzConnected = false;
  let clickConnection = { status:'CONNECTED', merchantId:'demo-merchant', serviceId:'demo-service', verified:false };
  let clickProgress = { verified:false, confirmedCount:2, pending:null };
  let paymeConnection = { status:'DISCONNECTED', merchantId:null, login:null, verified:false };
  let paymeProgress = { verified:false, confirmedCount:0, pending:null };
  let uzumConnection = { status:'DISCONNECTED', terminalId:null };
  let billzImported = [];
  let billzDeleted = [];
  let featuredCategories = [{ categoryId:'cat-1', productIds:['prod-001'] }];
  let banners = [{ id:'ban-1', title:'Demo banner', imageUrl:'https://demo.example/banner.jpg', targetType:'NONE', isActive:true, sortOrder:0 }];
  let promotions = [{ id:'promo-1', code:'DEMO10', name:'Demo 10%', discountType:'PERCENT', discountValue:10, usedCount:2, usageLimit:100, isActive:true, source:'MANUAL' }];
  let bundles = [{ id:'bundle-1', name:'Demo aksiya', items:[{productId:'prod-001',qty:1},{productId:'prod-002',qty:1}], bundlePrice:300000, isActive:true, sortOrder:0 }];
  let tierGroups = [{ id:'tier-1', name:'Demo bosqich', steps:[{thresholdAmount:2000000,discountType:'PERCENT',discountValue:2}], isActive:true }];
  let giftRules = [{ id:'gift-1', name:'Demo sovg‘a', conditionType:'ORDER_AMOUNT', thresholdAmount:500000, giftProductId:'prod-001', giftQuantity:1, isActive:true }];
  let rewardRules = [{ id:'reward-1', triggerType:'ORDER_TOTAL', thresholdAmount:1000000, rewardType:'PERCENT', rewardValue:5, isActive:true }];
  let demoSettings = {
    shopContact:{name:'Fitcore Demo',address:'Toshkent, Sergeli',coordinates:'41.226,69.219',phone:'+998901112233',phone2:'',phone3:'',instagram:'fitcore.uz.sergeli',telegram:'',facebook:'',workHours:'09:00-22:00'},
    branding:{logoUrl:null,logoType:'WORDMARK',logoWordmark:{presetId:'clean',text:'FITCORE'},startMessage:'Assalomu alaykum!',startImageUrl:null},
    fulfillmentConfig:{version:1,delivery:{free:{enabled:true,regions:{tashkent_city:{enabled:true}},general:{enabled:false,comment:null,estimatedTime:'2 soat'}},fixed:{enabled:false,regions:{},general:{enabled:false,fee:null,comment:null,estimatedTime:null}},taxi:{enabled:false,general:{enabled:false,exactFee:null,minFee:null,maxFee:null,comment:null,estimatedTime:null},regions:{}},post:{enabled:true,providers:[{id:'BTS',name:'BTS',enabled:true,regions:{samarkand:{enabled:true}}},{id:'EMU',name:'EMU',enabled:true,regions:{navoi:{enabled:true}}},{id:'OTHER',name:'Boshqa pochta',enabled:false,regions:{}}]}},payments:{methods:[{id:'CASH',name:'Naqd',enabled:true,regions:{}},{id:'CARD',name:'Karta orqali',enabled:true,regions:{},cardNumber:'8600 0000 0000 0000',cardHolder:'FITCORE',receiptRequired:true},{id:'QR',name:'QR orqali',enabled:false,regions:{},providers:[]},{id:'CLICK',name:'Click orqali (avtomatik)',enabled:false,regions:{}},{id:'PAYME',name:'Payme orqali (avtomatik)',enabled:false,regions:{}},{id:'UZUM',name:'Uzum orqali (avtomatik)',enabled:false,regions:{}}]}},
    designSettings:{themeId:'minimal',colors:{primary:'#2563eb'}},ordersPaused:false,ordersPausedNote:'',lowStockThreshold:5,
    orderPolicies:{customerCancelCutoff:'BEFORE_SHIPPED',returnRequestsEnabled:true,returnWindowDays:7,returnPolicyText:'Qaytarish shartlari'},discountPolicy:{allowDiscountCombining:false,maxCombinedDiscountPercent:null}
  };
  let demoOrders = [
    { id:101, source:'WEB', user:'Ali Valiyev', phone:'+998901112233', region:'Toshkent', district:'Sergeli', address:'Demo ko‘cha 1', payMethod:'CASH', items:[{name:'Whey',qty:1}], subtotal:200000, deliveryFee:0, payableTotal:200000, status:'NEW', paymentStatus:'PENDING', createdAt:'2026-09-22T08:00:00Z', internalNote:null },
    { id:100, source:'TELEGRAM', user:'Vali Aliyev', phone:'+998909998877', region:'Toshkent', district:'Chilonzor', address:'Demo ko‘cha 2', payMethod:'CLICK', items:[{name:'Creatine',qty:1}], subtotal:150000, deliveryFee:20000, payableTotal:170000, status:'PROCESSING', paymentStatus:'PAID', createdAt:'2026-09-21T12:00:00Z', internalNote:'Tezroq yuborish' },
  ];
  let demoRoles = [
    {id:'role-manager',key:'MANAGER',name:'Manager',description:'Boshqaruv roli',color:'#2563eb',isSystem:true,permissions:['orders.view','orders.manage','reports.view','staff.manage'],usedCount:1},
    {id:'role-warehouse',key:'WAREHOUSE',name:'Omborchi',description:'Ombor',color:'#16a34a',isSystem:true,permissions:['stock.view','stock.manage'],usedCount:1},
    {id:'role-content',key:null,name:'Kontent',description:'Custom demo rol',color:'#7c3aed',isSystem:false,permissions:['products.manage'],usedCount:0},
  ];
  const demoPermissionCatalog=['orders.view','orders.manage','reports.view','staff.manage','products.manage','stock.view','stock.manage','customers.view','marketing.manage','shop.settings.manage','integrations.manage','domains.manage'];
  let demoStaff = [
    {tgId:'700000001',role:'OWNER',status:'ACTIVE',memberSince:'2026-01-10T08:00:00Z',name:'Demo Owner',username:'owner_demo',phone:'+998900000001',lastSeenAt:'2026-09-23T03:00:00Z',roles:[]},
    {tgId:'700000002',role:'STAFF',status:'ACTIVE',memberSince:'2026-06-01T08:00:00Z',name:'Demo Manager',username:'manager_demo',phone:'+998900000002',lastSeenAt:'2026-09-23T02:00:00Z',roles:[{id:'role-manager',name:'Manager',color:'#2563eb',isPrimary:true}]},
    {tgId:'700000003',role:'STAFF',status:'ACTIVE',memberSince:'2026-07-01T08:00:00Z',name:'Demo Omborchi',username:'warehouse_demo',phone:null,lastSeenAt:'2026-09-22T18:00:00Z',roles:[{id:'role-warehouse',name:'Omborchi',color:'#16a34a',isPrimary:true}]},
  ];
  let demoInvites=[];
  let demoAudit=[
    {id:'audit-1',adminTgId:'700000001',adminName:'Demo Owner',action:'ROLE_CREATED',entityType:'role',entityId:'role-content',details:{name:'Kontent'},createdAt:'2026-09-22T12:00:00Z'},
    {id:'audit-2',adminTgId:'700000002',adminName:'Demo Manager',action:'ORDER_STATUS_UPDATED',entityType:'order',entityId:'100',details:{status:'PROCESSING'},createdAt:'2026-09-22T13:00:00Z'},
  ];
  let stockMovements = [];
  const billzItems = [
    { billzProductId:'bz-1', name:'BILLZ Protein', price:210000, stock:4, isVariative:false, variants:[] },
    { billzProductId:'bz-2', name:'BILLZ Kiyim', price:180000, stock:0, isVariative:true, variants:[{billzProductId:'bz-2-m',size:'M',color:'Qora',stock:2},{billzProductId:'bz-2-l',size:'L',color:'Qora',stock:1}] },
  ];
  async function ensureCatalog() {
    if (!catalog) catalog = clone(await loadJsonFixture('admin/products.json'));
    return catalog;
  }
  return {
    async invoke(action, payload = {}, options = {}) {
      if (!action || typeof action !== 'string') return fail('VALIDATION_ERROR', 'Admin action kerak.');
      if (!allowed) return loadJsonFixture('admin/forbidden.json');
      if (!DEMO_WHITELIST.has(action)) return fail('CAPABILITY_UNAVAILABLE', 'Bu demo admin action qo‘llanmaydi.');
      if (action === 'role_list') return ok({permissions:clone(demoPermissionCatalog),roles:clone(demoRoles)});
      if (action === 'role_create') { const row={id:`role-demo-${demoRoles.length+1}`,key:null,name:String(payload.name||''),description:payload.description||null,color:payload.color||null,isSystem:false,permissions:clone(payload.permissions||[]),usedCount:0}; demoRoles.push(row); return ok({role:clone(row)}); }
      if (action === 'role_update') { const row=demoRoles.find(r=>String(r.id)===String(payload.id)); if(!row)return fail('NOT_FOUND','Rol topilmadi.'); if(row.isSystem && payload.name && payload.name!==row.name)return fail('VALIDATION_ERROR','Tizim roli nomi o‘zgartirilmaydi.'); Object.assign(row,{name:payload.name??row.name,description:payload.description??row.description,color:payload.color??row.color}); if(Array.isArray(payload.permissions))row.permissions=clone(payload.permissions); return ok({ok:true}); }
      if (action === 'role_delete') { const row=demoRoles.find(r=>String(r.id)===String(payload.id)); if(!row)return fail('NOT_FOUND','Rol topilmadi.'); if(row.isSystem)return fail('VALIDATION_ERROR','Tizim rolini o‘chirib bo‘lmaydi.'); const used=demoStaff.filter(x=>(x.roles||[]).some(r=>String(r.id)===String(row.id))).length; if(used&&!payload.force)return fail('VALIDATION_ERROR','Rol xodimlarda ishlatilmoqda.'); demoRoles=demoRoles.filter(r=>String(r.id)!==String(row.id)); demoStaff=demoStaff.map(x=>({...x,roles:(x.roles||[]).filter(r=>String(r.id)!==String(row.id))})); return ok({deleted:true}); }
      if (action === 'staff_list') return ok({staff:clone(demoStaff),pendingInvites:clone(demoInvites)});
      if (action === 'staff_invite') { const id=`invite-${demoInvites.length+1}`; const row={id,tgId:String(payload.telegramUserId),username:payload.username||null,roleIds:clone(payload.roleIds||[]),createdAt:'2026-09-23T03:00:00Z',expiresAt:'2026-09-30T03:00:00Z'}; demoInvites.unshift(row); return ok({invite:clone({...row,status:'PENDING'})}); }
      if (action === 'staff_cancel_invite') { demoInvites=demoInvites.filter(x=>String(x.id)!==String(payload.inviteId)); return ok({ok:true}); }
      if (action === 'staff_update_roles') { const row=demoStaff.find(x=>String(x.tgId)===String(payload.telegramUserId)); if(!row)return fail('NOT_FOUND','Xodim topilmadi.'); if(row.role==='OWNER')return fail('VALIDATION_ERROR','Owner rollari o‘zgartirilmaydi.'); row.roles=(payload.roleIds||[]).map(id=>{const role=demoRoles.find(r=>String(r.id)===String(id));return{id:String(id),name:role?.name||'Rol',color:role?.color||null,isPrimary:String(id)===String(payload.primaryRoleId||payload.roleIds?.[0])};}); return ok({ok:true}); }
      if (action === 'staff_set_blocked') { const row=demoStaff.find(x=>String(x.tgId)===String(payload.telegramUserId)); if(!row)return fail('NOT_FOUND','Xodim topilmadi.'); if(row.role==='OWNER')return fail('VALIDATION_ERROR','Owner bloklanmaydi.'); row.status=payload.blocked?'DISABLED':'ACTIVE'; return ok({ok:true}); }
      if (action === 'staff_remove') { const row=demoStaff.find(x=>String(x.tgId)===String(payload.telegramUserId)); if(!row)return fail('NOT_FOUND','Xodim topilmadi.'); if(row.role==='OWNER')return fail('VALIDATION_ERROR','Owner olib tashlanmaydi.'); demoStaff=demoStaff.filter(x=>String(x.tgId)!==String(payload.telegramUserId)); return ok({ok:true}); }
      if (action === 'list_admin_audit_log') { let rows=[...demoAudit]; const q=String(payload.search||'').toLowerCase(); if(q)rows=rows.filter(r=>`${r.action} ${r.entityType} ${r.entityId}`.toLowerCase().includes(q)); if(payload.action)rows=rows.filter(r=>r.action===payload.action); if(payload.entityType)rows=rows.filter(r=>r.entityType===payload.entityType); const page=Math.max(1,Number(payload.page)||1),pageSize=Math.max(10,Number(payload.pageSize)||30),from=(page-1)*pageSize; return ok({entries:clone(rows.slice(from,from+pageSize)),page,pageSize,totalCount:rows.length,totalPages:Math.max(1,Math.ceil(rows.length/pageSize))}); }
      if (action === 'get_report_overview') return ok({period:payload.period||'30d',dateFrom:payload.dateFrom||'2026-08-25T19:00:00.000Z',dateTo:payload.dateTo||'2026-09-24T19:00:00.000Z',totalSales:370000,orderCount:2,completedOrders:0,newOrders:1,cashFlow:{orderedAmount:370000,paidAmount:170000,refundedAmount:0,netReceivedAmount:170000,deliveredOrders:0,uncollectedCashAmount:200000,uncollectedCashOrders:1},cancelledOrders:1,cancellationRate:50,avgOrderValue:170000,totalUnitsSold:1,totalCustomers:2,newCustomers:2,repeatCustomers:0,topProduct:{name:'Creatine',revenue:170000},topRegion:{label:'Toshkent',revenue:170000},topPaymentMethod:{label:'Click (avtomatik)',revenue:170000},salesTimeline:[{key:'2026-09-21',label:'21.09',salesAmount:170000,orderCount:1}],paymentBreakdown:[{label:'Click',salesAmount:170000,orderCount:1}],regionBreakdown:[{label:'Toshkent',salesAmount:170000,orderCount:1}],topProducts:[{name:'Creatine',revenue:170000,unitsSold:1}],orderStatuses:[{status:'NEW',count:1},{status:'PROCESSING',count:1}],comparison:null});
      if (action === 'get_sales_report') return ok({period:payload.period||'30d',dateFrom:payload.dateFrom||'2026-08-25T19:00:00.000Z',dateTo:payload.dateTo||'2026-09-24T19:00:00.000Z',totalSales:170000,totalOrders:2,soldOrderCount:1,cashFlow:{orderedAmount:370000,paidAmount:170000,refundedAmount:0,netReceivedAmount:170000,deliveredOrders:0,uncollectedCashAmount:200000,uncollectedCashOrders:1},avgOrderValue:170000,salesTimeline:[{key:'2026-09-21',label:'21.09',salesAmount:170000,orderCount:1}],byRegion:[{regionLabel:'Toshkent',salesAmount:170000,orderCount:1}],byProduct:[{productId:'prod-002',name:'Creatine',sku:'CRE-001',unitsSold:1,orderCount:1,revenue:170000,avgSellPrice:170000}],byPaymentMethod:[{label:'Click',salesAmount:170000,orderCount:1}],byStatus:[{status:'PROCESSING',orderCount:1,salesAmount:170000}]});
      if (action === 'get_customer_report') { const rows=[{tgId:'8001',name:'Ali',username:'ali',phone:'+998901112233',totalOrders:1,successfulOrders:0,cancelledOrders:1,totalSpent:0,avgOrderValue:0,firstOrderAt:'2026-09-22T08:00:00Z',lastOrderAt:'2026-09-22T08:00:00Z',cancellationRate:100},{tgId:'8002',name:'Vali',username:'vali',phone:'+998909998877',totalOrders:1,successfulOrders:1,cancelledOrders:0,totalSpent:170000,avgOrderValue:170000,firstOrderAt:'2026-09-21T12:00:00Z',lastOrderAt:'2026-09-21T12:00:00Z',cancellationRate:0}]; const page=Math.max(1,Number(payload.page)||1),pageSize=Math.max(10,Number(payload.pageSize)||20); return ok({period:payload.period||'30d',dateFrom:payload.dateFrom||'2026-08-25T19:00:00.000Z',dateTo:payload.dateTo||'2026-09-24T19:00:00.000Z',piiVisible:true,kpi:{totalCustomers:2,newCustomers:2,repeatCustomers:0,oneTimeCustomers:1,avgCustomerSpend:170000,topSpender:{name:'Vali',totalSpent:170000}},segment:payload.segment||'ALL',page,pageSize,totalCount:rows.length,totalPages:1,customers:clone(rows)}); }
      if (action === 'get_product_report') { const rows=[{productId:'prod-002',name:'Creatine',img:null,sku:'CRE-001',currentStock:8,isDeleted:false,unitsSold:1,orderCount:1,revenue:170000,avgSellPrice:170000,sharePercent:100,stockState:'OK'}]; return ok({period:payload.period||'30d',dateFrom:payload.dateFrom||'2026-08-25T19:00:00.000Z',dateTo:payload.dateTo||'2026-09-24T19:00:00.000Z',view:payload.view||'TOP_REVENUE',totalSales:170000,page:1,pageSize:20,totalCount:1,totalPages:1,products:clone(rows)}); }
      if (action === 'get_warehouse_summary') return ok({lowStock:1,outOfStock:0,totalStock:12});
      if (action === 'upload_report_pdf') return ok({ok:true,url:'https://demo.example/report.pdf',fileName:String(payload.fileName||'hisobot.pdf')});
      if (action === 'get_admin_settings') return ok(clone(demoSettings));
      if (action === 'set_shop_contact') { demoSettings.shopContact={...demoSettings.shopContact,...clone(payload)}; return ok({ok:true,shopContact:clone(demoSettings.shopContact)}); }
      if (action === 'set_low_stock_threshold') { demoSettings.lowStockThreshold=Math.max(0,Math.round(Number(payload.threshold)||0)); return ok({ok:true,lowStockThreshold:demoSettings.lowStockThreshold}); }
      if (action === 'set_orders_paused') { demoSettings.ordersPaused=payload.paused===true; demoSettings.ordersPausedNote=demoSettings.ordersPaused?String(payload.note||''):''; return ok({ok:true}); }
      if (action === 'set_fulfillment_config') { demoSettings.fulfillmentConfig=clone(payload.config||demoSettings.fulfillmentConfig); return ok({ok:true,fulfillmentConfig:clone(demoSettings.fulfillmentConfig)}); }
      if (action === 'set_order_policies') { demoSettings.orderPolicies={...demoSettings.orderPolicies,...clone(payload)}; return ok({ok:true}); }
      if (action === 'set_design_settings') { demoSettings.designSettings={themeId:String(payload.themeId||'custom'),colors:clone(payload.colors||{})}; return ok({ok:true,designSettings:clone(demoSettings.designSettings)}); }
      if (action === 'set_shop_logo') {
        const logoType=payload.logoType==='WORDMARK'?'WORDMARK':'IMAGE';
        demoSettings.branding={...demoSettings.branding,logoType,logoUrl:logoType==='IMAGE'?(payload.logoUrl||null):null,logoWordmark:logoType==='WORDMARK'?clone(payload.wordmark||null):null};
        return ok({ok:true,branding:{logoType:demoSettings.branding.logoType,logoUrl:demoSettings.branding.logoUrl,logoWordmark:clone(demoSettings.branding.logoWordmark)}});
      }
      if (action === 'set_start_message') { demoSettings.branding={...demoSettings.branding,startMessage:String(payload.startMessage||''),startImageUrl:payload.removeStartImage===true?null:demoSettings.branding.startImageUrl}; return ok({ok:true,startMessage:demoSettings.branding.startMessage,startImageUrl:demoSettings.branding.startImageUrl}); }
      if (action === 'click_get_status') return ok(clone(clickConnection));
      if (action === 'click_connect') { clickConnection={status:'CONNECTED',merchantId:String(payload.merchantId||''),serviceId:String(payload.serviceId||''),verified:false}; clickProgress={verified:false,confirmedCount:0,pending:null}; return ok({ok:true,status:'CONNECTED'}); }
      if (action === 'click_disconnect') { clickConnection={...clickConnection,status:'DISCONNECTED',verified:false}; clickProgress={verified:false,confirmedCount:0,pending:null}; return ok({ok:true}); }
      if (action === 'click_start_test_payment') { const attempt=Math.min(3,Number(clickProgress.confirmedCount||0)+1); clickProgress={...clickProgress,pending:{id:`click-demo-${attempt}`,amount:Number(payload.amount)||1000,created_at:'2026-09-23T00:00:00Z'}}; return ok({ok:true,testRunId:clickProgress.pending.id,invoiceId:`invoice-demo-${attempt}`,attemptNumber:attempt}); }
      if (action === 'click_test_progress') return ok(clone(clickProgress));
      if (action === 'payme_get_status') return ok(clone(paymeConnection));
      if (action === 'payme_connect') { paymeConnection={status:'CONNECTED',merchantId:String(payload.merchantId||''),login:String(payload.login||''),verified:false}; paymeProgress={verified:false,confirmedCount:0,pending:null}; return ok({ok:true,status:'CONNECTED'}); }
      if (action === 'payme_disconnect') { paymeConnection={...paymeConnection,status:'DISCONNECTED',verified:false}; paymeProgress={verified:false,confirmedCount:0,pending:null}; return ok({ok:true}); }
      if (action === 'payme_start_test_payment') { const attempt=Math.min(3,Number(paymeProgress.confirmedCount||0)+1); paymeProgress={...paymeProgress,pending:{id:`payme-demo-${attempt}`,amount:Number(payload.amount)||1000,created_at:'2026-09-23T00:00:00Z'}}; return ok({ok:true,testRunId:paymeProgress.pending.id,checkoutUrl:`https://demo.example/payme-test-${attempt}`,attemptNumber:attempt}); }
      if (action === 'payme_test_progress') return ok(clone(paymeProgress));
      if (action === 'uzum_get_status') return ok(clone(uzumConnection));
      if (action === 'uzum_connect') { uzumConnection={status:'CONNECTED',terminalId:String(payload.terminalId||'')}; return ok({ok:true,status:'CONNECTED'}); }
      if (action === 'uzum_disconnect') { uzumConnection={...uzumConnection,status:'DISCONNECTED'}; return ok({ok:true}); }
      if (action === 'get_admin_products') {
        const source = await ensureCatalog();
        const search = String(payload.search || '').trim().toLocaleLowerCase('uz-UZ');
        const categoryId = String(payload.categoryId || 'ALL');
        const visibility = String(payload.visibility || 'ALL').toUpperCase();
        const stock = String(payload.stock || 'ALL').toUpperCase();
        let items = source.products.filter((row) => {
          if (search && !`${row.name || ''} ${row.name_ru || ''} ${row.sku || ''} ${row.id || ''}`.toLocaleLowerCase('uz-UZ').includes(search)) return false;
          if (categoryId === 'UNCATEGORIZED' && row.category_id != null) return false;
          if (categoryId !== 'ALL' && categoryId !== 'UNCATEGORIZED' && String(row.category_id || '') !== categoryId) return false;
          if (visibility === 'VISIBLE' && row.is_visible === false) return false;
          if (visibility === 'HIDDEN' && row.is_visible !== false) return false;
          if (stock === 'IN_STOCK' && row.status === 'OUT_OF_STOCK') return false;
          if (stock === 'OUT_OF_STOCK' && row.status !== 'OUT_OF_STOCK') return false;
          return true;
        });
        const sort = String(payload.sort || 'CATALOG').toUpperCase();
        const order = {
          NAME_ASC: (a,b)=>String(a.name||'').localeCompare(String(b.name||'')),
          PRICE_ASC: (a,b)=>Number(a.price||0)-Number(b.price||0), PRICE_DESC: (a,b)=>Number(b.price||0)-Number(a.price||0),
          STOCK_ASC: (a,b)=>Number(a.stock||0)-Number(b.stock||0), STOCK_DESC: (a,b)=>Number(b.stock||0)-Number(a.stock||0),
          SOLD_DESC: (a,b)=>Number(b.sold_count||0)-Number(a.sold_count||0),
          NEWEST: (a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')),
          CATALOG: (a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0),
        }[sort];
        if (order) items = [...items].sort(order);
        const page = Math.max(1, Number(payload.page || 1));
        const pageSize = Math.min(100, Math.max(10, Number(payload.pageSize || 25)));
        const from = (page - 1) * pageSize;
        return ok({ products: clone(items.slice(from, from + pageSize)), categories: clone(source.categories), page, pageSize, totalCount: items.length, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) });
      }
      const source = await ensureCatalog();
      if (action === 'get_all_orders') return ok({ orders: clone(demoOrders) });
      if (action === 'update_order_status') {
        const row = demoOrders.find((item) => String(item.id) === String(payload.orderId));
        if (!row) return fail('NOT_FOUND','Buyurtma topilmadi.');
        const next = String(payload.newStatus || '').toUpperCase();
        const allowed = row.status === 'NEW' ? ['PROCESSING','CANCELLED'] : row.status === 'PROCESSING' ? ['DELIVERED','CANCELLED'] : [];
        if (!allowed.includes(next)) return fail('CONFLICT','Bu holat o‘tishi mumkin emas.');
        row.status = next; if (next === 'DELIVERED') row.deliveredAt = '2026-09-22T10:00:00Z';
        return ok({ order: clone(row) });
      }
      if (action === 'get_inventory_rows') {
        const threshold = 5; const search = String(payload.search || '').toLocaleLowerCase('uz-UZ'); const state = String(payload.state || 'ALL').toUpperCase();
        const rows = [];
        for (const product of source.products) {
          const vars = Array.isArray(product.variants) ? product.variants : [];
          if (vars.length) for (const variant of vars) { const qty=Math.max(0,Number(variant.qty)||0); const st=qty===0?'OUT_OF_STOCK':qty<=threshold?'LOW_STOCK':'IN_STOCK'; rows.push({key:`${product.id}:${variant.sku||''}`,productId:String(product.id),productName:product.name,productSku:product.sku||null,variantSku:variant.sku||null,color:variant.color||null,size:variant.size||null,stock:qty,state:st,manageable:!!variant.sku}); }
          else { const qty=Math.max(0,Number(product.stock)||0); const st=qty===0?'OUT_OF_STOCK':qty<=threshold?'LOW_STOCK':'IN_STOCK'; rows.push({key:`${product.id}:`,productId:String(product.id),productName:product.name,productSku:product.sku||null,variantSku:null,color:null,size:null,stock:qty,state:st,manageable:!!product.sku}); }
        }
        const filtered=rows.filter(r=>(state==='ALL'||r.state===state)&&(!search||`${r.productName} ${r.productSku||''} ${r.variantSku||''} ${r.color||''} ${r.size||''}`.toLocaleLowerCase('uz-UZ').includes(search)));
        return ok({rows:clone(filtered),total:filtered.length,lowStockThreshold:threshold});
      }
      if (action === 'bulk_stock_update') {
        const products=[]; const errors=[];
        for (const u of (payload.updates||[])) { const sku=String(u.sku||''); const value=Number(u.stock); let found=false;
          for (const product of source.products) { if (String(product.sku||'')===sku) { const prior=Number(product.stock)||0; product.stock=value; product.status=value>0?'ACTIVE':'OUT_OF_STOCK'; stockMovements.unshift({id:`m${stockMovements.length+1}`,productId:product.id,variantSku:null,productName:product.name,productSku:product.sku,priorStock:prior,delta:value-prior,newStock:value,operationType:'MANUAL',createdAt:'2026-09-22T10:00:00Z'}); products.push(clone(product)); found=true; break; }
            const variant=(product.variants||[]).find(v=>String(v.sku||'')===sku); if (variant) { const prior=Number(variant.qty)||0; variant.qty=value; product.stock=(product.variants||[]).reduce((a,v)=>a+(Number(v.qty)||0),0); product.status=product.stock>0?'ACTIVE':'OUT_OF_STOCK'; stockMovements.unshift({id:`m${stockMovements.length+1}`,productId:product.id,variantSku:sku,productName:product.name,productSku:product.sku,priorStock:prior,delta:value-prior,newStock:value,operationType:'MANUAL',createdAt:'2026-09-22T10:00:00Z'}); products.push(clone(product)); found=true; break; } }
          if (!found) errors.push({sku,error:'sku_not_found'});
        }
        return ok({products,errors});
      }
      if (action === 'record_stock_in') {
        const product=source.products.find(x=>String(x.id)===String(payload.productId)); if(!product)return fail('NOT_FOUND','Mahsulot topilmadi.'); const qty=Number(payload.qty); if(!Number.isInteger(qty)||qty<=0)return fail('VALIDATION_ERROR','Kirim miqdori noto‘g‘ri.');
        if(payload.variantSku){const variant=(product.variants||[]).find(v=>String(v.sku)===String(payload.variantSku));if(!variant)return fail('NOT_FOUND','Variant topilmadi.');const prior=Number(variant.qty)||0;variant.qty=prior+qty;product.stock=(product.variants||[]).reduce((a,v)=>a+(Number(v.qty)||0),0);stockMovements.unshift({id:`m${stockMovements.length+1}`,productId:product.id,variantSku:variant.sku,productName:product.name,productSku:product.sku,priorStock:prior,delta:qty,newStock:variant.qty,operationType:'KIRIM',createdAt:'2026-09-22T10:00:00Z'});} else {const prior=Number(product.stock)||0;product.stock=prior+qty;stockMovements.unshift({id:`m${stockMovements.length+1}`,productId:product.id,variantSku:null,productName:product.name,productSku:product.sku,priorStock:prior,delta:qty,newStock:product.stock,operationType:'KIRIM',createdAt:'2026-09-22T10:00:00Z'});} product.status=product.stock>0?'ACTIVE':'OUT_OF_STOCK';return ok({product:clone(product)});
      }
      if (action === 'get_stock_movements') { let rows=[...stockMovements]; const type=String(payload.type||''); if(type&&type!=='ALL')rows=rows.filter(x=>x.operationType===type); return ok({movements:clone(rows),total:rows.length,page:1,pageSize:20}); }
      if (action === 'get_admin_product_editor') {
        const row = source.products.find((item) => String(item.id) === String(payload.productId));
        if (!row) return fail('NOT_FOUND', 'Mahsulot topilmadi.');
        return ok({ product: clone(row), categories: clone(source.categories) });
      }
      if (action === 'add_product') {
        const id = `prod-demo-${source.products.length + 1}`;
        const variants = Array.isArray(payload.variants) ? clone(payload.variants) : [];
        for (const item of (Array.isArray(payload.variantImageUploads) ? payload.variantImageUploads : [])) {
          const idx = Number(item?.index);
          if (Number.isInteger(idx) && variants[idx]) variants[idx].colorImg = `https://demo.example/${id}-variant-${idx}.jpg`;
        }
        const row = {
          id, sku: `DEMO-${source.products.length + 1}`, name: String(payload.name || 'Nomsiz'), name_ru: null,
          description: String(payload.desc || ''), description_ru: null, price: Number(payload.price || 0), old_price: payload.oldPrice ?? null,
          stock: variants.length ? variants.reduce((sum, v) => sum + Number(v.qty || 0), 0) : Number(payload.stock || 0),
          category_id: payload.categoryId || null, status: 'ACTIVE', img: payload.imageUpload ? `https://demo.example/${id}.jpg` : (payload.img || null), thumb_img: null,
          is_featured: false, is_visible: true, sort_order: source.products.length + 1, sizes: [], variants,
          sold_count: 0, created_at: '2026-09-22T00:00:00Z', import_batch_id: null, badge: payload.badge || null,
        };
        source.products.push(row); return ok({ product: clone(row) });
      }
      if (action === 'edit_product_field') {
        const row = source.products.find((item) => String(item.id) === String(payload.productId));
        if (!row) return fail('NOT_FOUND', 'Mahsulot topilmadi.');
        const apply = (field, value) => {
          if (field === 'name') row.name = String(value || '');
          else if (field === 'desc') row.description = String(value || '');
          else if (field === 'price') { row.price = Number(value || 0); row.old_price = payload.oldPrice ?? null; }
          else if (field === 'categoryId') row.category_id = value || null;
          else if (field === 'stock') { row.stock = Number(value || 0); row.status = row.stock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK'; }
          else if (field === 'img') row.img = payload.imageUpload ? `https://demo.example/${row.id}-main.jpg` : (value || null);
          else if (field === 'variants') {
            row.variants = clone(Array.isArray(value) ? value : []);
            for (const item of (Array.isArray(payload.variantImageUploads) ? payload.variantImageUploads : [])) {
              const idx = Number(item?.index);
              if (Number.isInteger(idx) && row.variants[idx]) row.variants[idx].colorImg = `https://demo.example/${row.id}-variant-${idx}.jpg`;
            }
            row.stock = row.variants.reduce((sum, v) => sum + Number(v.qty || 0), 0);
            if (row.variants[0]?.price != null) { row.price = Number(row.variants[0].price); row.old_price = row.variants[0].oldPrice ?? null; }
          }
        };
        apply(payload.field, payload.value); if (payload.field2) apply(payload.field2, payload.value2);
        return ok({ product: clone(row) });
      }
      if (action === 'add_category') {
        const category = { id:`cat-demo-${source.categories.length + 1}`, name:String(payload.name || 'Katalog'), name_ru:null, parent_id:payload.parentId || null, img:payload.imageUpload ? 'https://demo.example/category.jpg' : (payload.img || (payload.parentId ? '📦' : '📁')), sort_order:source.categories.length + 1 };
        source.categories.push(category); return ok({ category: clone(category) });
      }
      if (action === 'edit_category') {
        const category = source.categories.find((item) => String(item.id) === String(payload.categoryId));
        if (!category) return fail('NOT_FOUND', 'Katalog topilmadi.');
        if (payload.name !== undefined) category.name = String(payload.name || '');
        if (payload.parentId !== undefined) category.parent_id = payload.parentId || null;
        if (payload.imageUpload) category.img = 'https://demo.example/category-edited.jpg'; else if (payload.img !== undefined) category.img = payload.img || null;
        return ok({ category: clone(category) });
      }
      if (action === 'toggle_product_visibility') {
        const row = source.products.find((item) => String(item.id) === String(payload.productId));
        if (!row) return fail('NOT_FOUND', 'Mahsulot topilmadi.');
        row.is_visible = payload.value !== false;
        return ok({ ok: true, productId: row.id, isVisible: row.is_visible });
      }
      if (action === 'duplicate_product') {
        const row = source.products.find((item) => String(item.id) === String(payload.productId));
        if (!row) return fail('NOT_FOUND', 'Mahsulot topilmadi.');
        const copy = { ...clone(row), id: `${row.id}-copy-${source.products.length + 1}`, sku: `${row.sku || 'SKU'}-COPY`, name: `${row.name} — nusxa`, is_featured: false, sort_order: source.products.length + 1 };
        source.products.push(copy);
        return ok({ product: clone(copy) });
      }
      if (action === 'bulk_move_products') {
        const ids = new Set((payload.productIds || []).map(String));
        source.products.forEach((row) => { if (ids.has(String(row.id))) row.category_id = payload.categoryId || null; });
        return ok({ products: clone(source.products.filter((row) => ids.has(String(row.id)))), count: ids.size });
      }
      if (action === 'bulk_trash_products') {
        const ids = new Set((payload.productIds || []).map(String));
        source.products = source.products.filter((row) => !ids.has(String(row.id)));
        return ok({ ok: true, batchId: 'trash-demo-001', count: ids.size });
      }
      if (action === 'get_marketing_bootstrap') { const src=await ensureCatalog(); return ok({featuredCategories:clone(featuredCategories),categories:clone(src.categories),products:clone(src.products)}); }
      if (action === 'marketing_summary') return ok({counts:{banners:banners.length,promos:promotions.length,bundles:bundles.length,tiers:tierGroups.length,gifts:giftRules.length+rewardRules.length},activeCounts:{banners:banners.filter(x=>x.isActive).length,promos:promotions.filter(x=>x.isActive).length,bundles:bundles.filter(x=>x.isActive).length,tiers:tierGroups.filter(x=>x.isActive).length,gifts:[...giftRules,...rewardRules].filter(x=>x.isActive).length},activeTotal:[...banners,...promotions,...bundles,...tierGroups,...giftRules,...rewardRules].filter(x=>x.isActive).length});
      if (action === 'set_featured_categories') { featuredCategories=clone(payload.featuredCategories||[]); return ok({ok:true,featuredCategories:clone(featuredCategories)}); }
      if (action === 'banner_list') return ok({banners:clone(banners)});
      if (action === 'banner_reorder') { const pos=new Map((payload.order||[]).map((id,i)=>[String(id),i])); banners=[...banners].sort((a,b)=>(pos.get(String(a.id))??999)-(pos.get(String(b.id))??999)).map((x,i)=>({...x,sortOrder:i})); return ok({ok:true}); }
      if (action === 'banner_create') { const row={id:`ban-${banners.length+1}`,title:payload.title||null,imageUrl:payload.imageUrl||'https://demo.example/banner.jpg',targetType:payload.targetType||'NONE',isActive:payload.isActive!==false,sortOrder:banners.length};banners.push(row);return ok({banner:clone(row)});}
      if (action === 'banner_update') { const row=banners.find(x=>String(x.id)===String(payload.id));if(!row)return fail('NOT_FOUND','Banner topilmadi.');Object.assign(row,payload);return ok({banner:clone(row)});}
      if (action === 'banner_delete') { banners=banners.filter(x=>String(x.id)!==String(payload.id));return ok({deleted:true});}
      if (action === 'promo_generate_code') return ok({code:'USTDEMO1'});
      if (action === 'promo_list') return ok({promotions:clone(promotions)});
      if (action === 'promo_create') { const row={...clone(payload),id:`promo-${promotions.length+1}`,usedCount:0,isActive:payload.isActive!==false,source:'MANUAL'};promotions.push(row);return ok({promotion:clone(row)});}
      if (action === 'promo_update') { const row=promotions.find(x=>String(x.id)===String(payload.id));if(!row)return fail('NOT_FOUND','Promo topilmadi.');Object.assign(row,payload);return ok({promotion:clone(row)});}
      if (action === 'promo_delete') { promotions=promotions.filter(x=>String(x.id)!==String(payload.id));return ok({deleted:true});}
      if (action === 'promo_usage_list') return ok({usages:[]});
      if (action === 'bundle_list') return ok({bundles:clone(bundles)});
      if (action === 'bundle_create') { const row={...clone(payload),id:`bundle-${bundles.length+1}`,isActive:payload.isActive!==false};bundles.push(row);return ok({bundle:clone(row)});}
      if (action === 'bundle_update') { const row=bundles.find(x=>String(x.id)===String(payload.id));if(!row)return fail('NOT_FOUND','Aksiya topilmadi.');Object.assign(row,payload);return ok({bundle:clone(row)});}
      if (action === 'bundle_delete') { bundles=bundles.filter(x=>String(x.id)!==String(payload.id));return ok({deleted:true});}
      if (action === 'discount_tier_group_list') return ok({groups:clone(tierGroups)});
      if (action === 'discount_tier_group_create') { const row={...clone(payload),id:`tier-${tierGroups.length+1}`,isActive:payload.isActive!==false};tierGroups.push(row);return ok({ok:true,id:row.id});}
      if (action === 'discount_tier_group_update') { const row=tierGroups.find(x=>String(x.id)===String(payload.id));if(!row)return fail('NOT_FOUND','Bosqich topilmadi.');Object.assign(row,payload);return ok({ok:true,id:row.id});}
      if (action === 'discount_tier_group_delete') { tierGroups=tierGroups.filter(x=>String(x.id)!==String(payload.id));return ok({deleted:true});}
      if (action === 'automatic_gift_list') return ok({rules:clone(giftRules)});
      if (action === 'automatic_gift_create') { const row={...clone(payload),id:`gift-${giftRules.length+1}`,isActive:payload.isActive!==false};giftRules.push(row);return ok({rule:clone(row)});}
      if (action === 'automatic_gift_update') { const row=giftRules.find(x=>String(x.id)===String(payload.id));if(!row)return fail('NOT_FOUND','Sovg‘a topilmadi.');Object.assign(row,payload);return ok({rule:clone(row)});}
      if (action === 'automatic_gift_delete') { giftRules=giftRules.filter(x=>String(x.id)!==String(payload.id));return ok({deleted:true});}
      if (action === 'reward_rule_list') return ok({rules:clone(rewardRules)});
      if (action === 'reward_rule_create') { const row={...clone(payload),id:`reward-${rewardRules.length+1}`,isActive:payload.isActive!==false};rewardRules.push(row);return ok({ok:true});}
      if (action === 'reward_rule_update') { const row=rewardRules.find(x=>String(x.id)===String(payload.id));if(!row)return fail('NOT_FOUND','Kupon qoidasi topilmadi.');Object.assign(row,payload);return ok({ok:true});}
      if (action === 'reward_rule_delete') { rewardRules=rewardRules.filter(x=>String(x.id)!==String(payload.id));return ok({deleted:true});}
      if (action === 'get_excel_template_url') return ok({ url:'https://demo.example/Tovar_import_shablon.xlsx', fileName:'Tovar_import_shablon.xlsx' });
      if (action === 'get_category_aliases') return ok({ aliases:[] });
      if (action === 'get_last_import_batch') return ok({ batch:clone(importBatch) });
      if (action === 'start_import_batch') { importBatch={id:'import-demo-001',fileName:payload.fileName||'demo.xlsx',status:'IN_PROGRESS',totalRows:Number(payload.totalRows)||0,importedRows:0}; return ok({batchId:importBatch.id}); }
      if (action === 'stage_import_products') { if(!importBatch)return fail('CONFLICT','Import batch yo‘q.'); return ok({batchId:importBatch.id,stagedRows:Number(payload.offset||0)+(payload.rows||[]).length}); }
      if (action === 'bulk_import_products') { if(!importBatch)return fail('CONFLICT','Import batch yo‘q.'); const rows=payload.rows||[]; const added=rows.map((row,i)=>({id:`excel-demo-${source.products.length+i+1}`,name:row.name,price:row.price,stock:row.stock,img:null,variants:clone(row.variants||[])})); source.products.push(...added); importBatch={...importBatch,status:payload.isFinal?'COMPLETED':'IN_PROGRESS',importedRows:Number(payload.offset||0)+added.length}; return ok({imported:added.length,categories:[],products:clone(added)}); }
      if (action === 'rollback_import_batch') { importBatch=importBatch?{...importBatch,status:'ROLLED_BACK'}:null; return ok({ok:true}); }
      if (action === 'billz_get_status') return ok({status:billzConnected?'CONNECTED':'DISCONNECTED',billzShopName:billzConnected?'Demo shop':null,billzCashboxName:null,billzPaymentTypeName:null,lastError:null});
      if (action === 'billz_connect') { if(!String(payload.secretToken||'').trim())return fail('VALIDATION_ERROR','Kalit kerak.'); billzConnected=true; return ok({shops:[{id:'s1',name:'Demo shop'}],cashboxes:[],paymentTypes:[]}); }
      if (action === 'billz_list_config_options') return ok({shops:[{id:'s1',name:'Demo shop'}],cashboxes:[{id:'c1',name:'Asosiy'}],paymentTypes:[{id:'p1',name:'Naqd'}]});
      if (action === 'billz_save_sale_config') return ok({ok:true});
      if (action === 'billz_disconnect') { billzConnected=false; return ok({ok:true}); }
      if (action === 'billz_get_categories') return ok({categories:[{id:'bc1',name:'Sport'}]});
      if (action === 'billz_browse_products') { const search=String(payload.search||'').toLowerCase(); const importedIds=new Set(billzImported.map(x=>x.billzProductId)); let rows=billzItems.filter(x=>!importedIds.has(x.billzProductId)&&(!search||x.name.toLowerCase().includes(search))); const limit=payload.limit==='ALL'?rows.length:Number(payload.limit||10); const page=Math.max(1,Number(payload.page||1)); const count=rows.length; rows=rows.slice((page-1)*limit,page*limit); return ok({items:clone(rows),count,page,truncated:false}); }
      if (action === 'billz_import_products') { const items=clone(payload.items||[]); const imported=items.map((it,i)=>({id:`billz-demo-${billzImported.length+i+1}`,billzProductId:it.billzProductId,name:it.name,price:it.price,stock:it.stock})); billzImported.push(...imported); return ok({imported:clone(imported),importedCount:imported.length,failedCount:0}); }
      if (action === 'billz_list_imported_products') return ok({items:clone(billzImported)});
      if (action === 'billz_unlink_products') { const ids=new Set((payload.productIds||[]).map(String)); billzImported=billzImported.filter(x=>!ids.has(String(x.id))); return ok({ok:true,count:ids.size}); }
      if (action === 'billz_list_deleted_products') return ok({items:clone(billzDeleted)});
      if (action === 'billz_restore_product') { billzDeleted=billzDeleted.filter(x=>String(x.id)!==String(payload.productId)); return ok({ok:true}); }
      const fixture = await loadJsonFixture('admin/allowed.json');
      return ok({ ...fixture, action, payload: clone(payload), requestId: options.requestId || fixture.requestId });
    },
  };
}
