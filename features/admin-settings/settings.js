import { createButton, createCard, createSelectField, createStatePanel, createTextField } from '../../components/ui.js';
import { normalizeLocale } from '../../i18n/index.js';
import { createBillzImportController } from '../admin-imports/imports.js';
import { fail, ok } from '../../services/ports/result.js';

const SECTION_IDS = Object.freeze(['shop','delivery','payments','returns','language','branding','integrations']);
const SAVABLE_SECTION_IDS = Object.freeze(['shop','delivery','payments','returns','branding']);
const DESIGN_COLOR_FIELDS = Object.freeze([
  ['primary','Asosiy rang'], ['accent','Aksent rang'], ['button','Tugma rangi'],
  ['pageBg','Sahifa foni'], ['text','Asosiy matn'],
]);
const INTEGRATION_ACTIONS = Object.freeze({
  billz: { status:'billz_get_status', connect:'billz_connect', disconnect:'billz_disconnect' },
  click: { status:'click_get_status', progress:'click_test_progress', connect:'click_connect', disconnect:'click_disconnect', test:'click_start_test_payment' },
  payme: { status:'payme_get_status', progress:'payme_test_progress', connect:'payme_connect', disconnect:'payme_disconnect', test:'payme_start_test_payment' },
  uzum: { status:'uzum_get_status', connect:'uzum_connect', disconnect:'uzum_disconnect' },
});

function clone(value) { return value == null ? value : structuredClone(value); }
function text(value) { return String(value ?? '').trim(); }
function hasPermission(actor, permission) {
  if (!actor) return false;
  if (actor.shopRole === 'OWNER') return true;
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  return permissions.includes('*') || permissions.includes(permission);
}
function deepSet(source, path, value) {
  const next = clone(source || {});
  const keys = String(path || '').split('.').filter(Boolean);
  if (!keys.length) return next;
  let node = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!node[key] || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[keys.at(-1)] = value;
  return next;
}
function stable(value) { return JSON.stringify(value ?? null); }
function normalizeHex(value, fallback = null) {
  const raw = text(value);
  if (!raw) return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : null;
}
function normalizeWordmark(raw, fallbackText = '') {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    presetId: text(source.presetId) || 'clean',
    text: text(source.text) || text(fallbackText).slice(0, 40),
    textColor: normalizeHex(source.textColor, '#ffffff') || '#ffffff',
    backgroundColor: normalizeHex(source.backgroundColor, '#0f172a') || '#0f172a',
  };
}
function normalizeSettings(raw = {}) {
  const shopContact = raw.shopContact && typeof raw.shopContact === 'object' ? raw.shopContact : {};
  const branding = raw.branding && typeof raw.branding === 'object' ? raw.branding : {};
  const orderPolicies = raw.orderPolicies && typeof raw.orderPolicies === 'object' ? raw.orderPolicies : {};
  const fulfillmentConfig = raw.fulfillmentConfig && typeof raw.fulfillmentConfig === 'object' ? raw.fulfillmentConfig : { delivery:{}, payments:{ methods:[] } };
  const designSettings = raw.designSettings && typeof raw.designSettings === 'object' ? raw.designSettings : { themeId:'minimal', colors:{} };
  return {
    shopContact: {
      name: shopContact.name ?? '', address: shopContact.address ?? '', coordinates: shopContact.coordinates ?? '',
      phone: shopContact.phone ?? '', phone2: shopContact.phone2 ?? '', phone3: shopContact.phone3 ?? '',
      instagram: shopContact.instagram ?? '', telegram: shopContact.telegram ?? '', facebook: shopContact.facebook ?? '', workHours: shopContact.workHours ?? '',
    },
    branding: {
      logoUrl: branding.logoUrl ?? null,
      logoType: branding.logoType === 'WORDMARK' ? 'WORDMARK' : 'IMAGE',
      logoWordmark: normalizeWordmark(branding.logoWordmark, shopContact.name || ''),
      startMessage: branding.startMessage ?? '',
      startImageUrl: branding.startImageUrl ?? null,
    },
    fulfillmentConfig: clone(fulfillmentConfig),
    designSettings: { themeId: designSettings.themeId || 'minimal', colors: clone(designSettings.colors || {}) },
    ordersPaused: raw.ordersPaused === true,
    ordersPausedNote: raw.ordersPausedNote ?? '',
    lowStockThreshold: Number.isFinite(Number(raw.lowStockThreshold)) ? Number(raw.lowStockThreshold) : 5,
    orderPolicies: {
      customerCancelCutoff: orderPolicies.customerCancelCutoff || 'BEFORE_SHIPPED',
      returnRequestsEnabled: orderPolicies.returnRequestsEnabled !== false,
      returnWindowDays: Math.max(1, Number(orderPolicies.returnWindowDays) || 7),
      returnPolicyText: orderPolicies.returnPolicyText ?? '',
    },
    discountPolicy: clone(raw.discountPolicy || {}),
  };
}
function unavailableStatus(provider, message = 'Platforma bu integratsiyani ushbu do‘kon uchun ochmagan.') {
  return { provider, availability:'UNAVAILABLE', status:'UNAVAILABLE', message };
}
function normalizeIntegration(provider, statusResult, progressResult) {
  if (!statusResult?.ok) {
    const code = statusResult?.error?.code || 'NETWORK_ERROR';
    if (code === 'FORBIDDEN' || code === 'CAPABILITY_UNAVAILABLE') return unavailableStatus(provider);
    return { provider, availability:'ERROR', status:'ERROR', error:clone(statusResult?.error || null) };
  }
  const status = clone(statusResult.data || {});
  return {
    provider,
    availability:'AVAILABLE',
    status: text(status.status || 'DISCONNECTED').toUpperCase() || 'DISCONNECTED',
    details: status,
    progress: progressResult?.ok ? clone(progressResult.data || {}) : null,
  };
}
function brandingValidation(value = {}) {
  const brand = value.branding || {};
  const design = value.designSettings || {};
  if (brand.logoType === 'WORDMARK') {
    const rawWordmark = brand.logoWordmark && typeof brand.logoWordmark === 'object' ? brand.logoWordmark : {};
    const presetId = text(rawWordmark.presetId);
    const wordmarkText = text(rawWordmark.text);
    if (!presetId || !wordmarkText) return fail('VALIDATION_ERROR','Wordmark uchun uslub va matn kerak.');
    if (!normalizeHex(rawWordmark.textColor) || !normalizeHex(rawWordmark.backgroundColor)) return fail('VALIDATION_ERROR','Wordmark ranglari #RRGGBB formatida bo‘lsin.');
  }
  for (const [key] of DESIGN_COLOR_FIELDS) {
    const raw = design.colors?.[key];
    if (raw != null && text(raw) && !normalizeHex(raw)) return fail('VALIDATION_ERROR',`${key} rangi #RRGGBB formatida bo‘lsin.`);
  }
  return ok(true);
}
function connectionValidation(provider, values = {}) {
  const p = String(provider || '').toLowerCase();
  if (p === 'billz') return text(values.secretToken) ? ok({ secretToken:text(values.secretToken) }) : fail('VALIDATION_ERROR','BILLZ maxfiy kalitini kiriting.');
  if (p === 'click') {
    const merchantId=text(values.merchantId), serviceId=text(values.serviceId), merchantUserId=text(values.merchantUserId), secretKey=text(values.secretKey);
    return merchantId && serviceId && merchantUserId && secretKey ? ok({ merchantId, serviceId, merchantUserId, secretKey }) : fail('VALIDATION_ERROR','Click uchun barcha 4 ta credentialni kiriting.');
  }
  if (p === 'payme') {
    const merchantId=text(values.merchantId), login=text(values.login), password=text(values.password);
    return merchantId && login && password ? ok({ merchantId, login, password }) : fail('VALIDATION_ERROR','Payme uchun barcha credentiallarni kiriting.');
  }
  if (p === 'uzum') {
    const terminalId=text(values.terminalId), apiKey=text(values.apiKey);
    return terminalId && apiKey ? ok({ terminalId, apiKey }) : fail('VALIDATION_ERROR','Uzum uchun Terminal ID va API key kiriting.');
  }
  return fail('CAPABILITY_UNAVAILABLE','Noma’lum integratsiya.');
}

export function createAdminSettingsController({ adminPort, actor, locale='uz', onLocaleChange } = {}) {
  if (!adminPort?.invoke) throw new TypeError('adminPort.invoke kerak.');
  const listeners = new Set();
  const canSettings = hasPermission(actor, 'shop.settings.manage');
  const canIntegrations = hasPermission(actor, 'integrations.manage');
  const billzController = canIntegrations ? createBillzImportController({ adminPort, actor }) : null;
  let state = {
    allowed: canSettings || canIntegrations,
    permissions: { settings: canSettings, integrations: canIntegrations },
    status:'idle', error:null, activeSection:'shop',
    locale:normalizeLocale(locale), localePersistence:'CLIENT_ONLY',
    saved:null, draft:null, dirtySections:[],
    savingSection:null, saveError:null, saveSuccess:null,
    integrations:{ billz:null, click:null, payme:null, uzum:null },
    integrationBusy:null, integrationError:null, integrationSuccess:null,
  };
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };
  const sectionValue = (source, section) => {
    if (!source) return null;
    if (section === 'shop') return {
      shopContact:clone(source.shopContact), ordersPaused:source.ordersPaused === true,
      ordersPausedNote:source.ordersPausedNote ?? '', lowStockThreshold:Number(source.lowStockThreshold ?? 5),
    };
    if (section === 'delivery') return clone(source.fulfillmentConfig?.delivery || {});
    if (section === 'payments') return clone(source.fulfillmentConfig?.payments || { methods:[] });
    if (section === 'returns') return clone(source.orderPolicies || {});
    if (section === 'branding') return { branding:clone(source.branding || {}), designSettings:clone(source.designSettings || {}) };
    return null;
  };
  const replaceSection = (target, section, value) => {
    const next = clone(target || {});
    if (section === 'shop') {
      next.shopContact = clone(value?.shopContact || {});
      next.ordersPaused = value?.ordersPaused === true;
      next.ordersPausedNote = value?.ordersPausedNote ?? '';
      next.lowStockThreshold = Number(value?.lowStockThreshold ?? 5);
    } else if (section === 'delivery') {
      next.fulfillmentConfig = clone(next.fulfillmentConfig || {});
      next.fulfillmentConfig.delivery = clone(value || {});
    } else if (section === 'payments') {
      next.fulfillmentConfig = clone(next.fulfillmentConfig || {});
      next.fulfillmentConfig.payments = clone(value || { methods:[] });
    } else if (section === 'returns') next.orderPolicies = clone(value || {});
    else if (section === 'branding') {
      next.branding = clone(value?.branding || {});
      next.designSettings = clone(value?.designSettings || {});
    }
    return next;
  };
  const recalcDirty = (draft = state.draft, saved = state.saved) => {
    if (!draft || !saved) return [];
    return ['shop','delivery','payments','returns','branding'].filter((section) => stable(sectionValue(draft, section)) !== stable(sectionValue(saved, section)));
  };
  const failSave = (section, result, savedOverride = null) => {
    const error = result?.error || { code:'NETWORK_ERROR', message:'Sozlamani saqlab bo‘lmadi.' };
    const nextSaved = savedOverride || state.saved;
    set({ saved:nextSaved, dirtySections:recalcDirty(state.draft, nextSaved), savingSection:null, saveError:{ section, ...clone(error) }, saveSuccess:null });
    return result?.ok === false ? result : fail(error.code || 'NETWORK_ERROR', error.message || 'Sozlamani saqlab bo‘lmadi.');
  };
  async function readIntegration(provider) {
    const cfg = INTEGRATION_ACTIONS[provider];
    if (!cfg) return unavailableStatus(String(provider || '').toUpperCase(),'Noma’lum integratsiya.');
    const statusResult = await adminPort.invoke(cfg.status, {});
    const progressResult = cfg.progress && statusResult?.ok && String(statusResult.data?.status || '').toUpperCase() === 'CONNECTED'
      ? await adminPort.invoke(cfg.progress, {}) : null;
    return normalizeIntegration(provider.toUpperCase(), statusResult, progressResult);
  }
  async function readIntegrations() {
    if (!canIntegrations) return { billz:null, click:null, payme:null, uzum:null };
    const [billz, click, payme, uzum] = await Promise.all(['billz','click','payme','uzum'].map(readIntegration));
    return { billz, click, payme, uzum };
  }
  async function refreshIntegration(provider) {
    if (!canIntegrations) return fail('FORBIDDEN','Integratsiyalar uchun ruxsat yo‘q.');
    const key = String(provider || '').toLowerCase();
    if (!INTEGRATION_ACTIONS[key]) return fail('CAPABILITY_UNAVAILABLE','Noma’lum integratsiya.');
    const entry = await readIntegration(key);
    set({ integrations:{ ...state.integrations, [key]:entry } });
    return entry.availability === 'ERROR' ? fail(entry.error?.code || 'NETWORK_ERROR', entry.error?.message || 'Integratsiya holatini olib bo‘lmadi.') : ok(entry);
  }
  async function load() {
    if (!state.allowed) {
      const result = fail('FORBIDDEN', 'Sozlamalarni ko‘rish uchun ruxsat yo‘q.');
      set({ status:'permission', error:result.error }); return result;
    }
    set({ status:'loading', error:null, saveError:null, saveSuccess:null, integrationError:null, integrationSuccess:null });
    let settingsResult = null;
    if (canSettings) settingsResult = await adminPort.invoke('get_admin_settings', {});
    const integrations = await readIntegrations();
    if (settingsResult && !settingsResult.ok) {
      set({ status:'error', error:settingsResult.error, integrations }); return settingsResult;
    }
    const normalized = settingsResult?.ok ? normalizeSettings(settingsResult.data) : null;
    set({ status:'ready', error:null, saved:normalized, draft:clone(normalized), dirtySections:[], savingSection:null, integrations,
      activeSection:canSettings ? (SECTION_IDS.includes(state.activeSection) ? state.activeSection : 'shop') : 'integrations' });
    return ok(snapshot());
  }
  function setSection(section) {
    const next = SECTION_IDS.includes(section) ? section : 'shop';
    if (next !== 'integrations' && !canSettings) return fail('FORBIDDEN','Do‘kon sozlamalari uchun ruxsat yo‘q.');
    if (next === 'integrations' && !canIntegrations) return fail('FORBIDDEN','Integratsiyalar uchun ruxsat yo‘q.');
    set({ activeSection:next, saveError:null, saveSuccess:null, integrationError:null, integrationSuccess:null }); return ok({ section:next });
  }
  function setClientLocale(next) {
    if (!canSettings) return fail('FORBIDDEN','Til sozlamasi uchun ruxsat yo‘q.');
    const normalized = normalizeLocale(next, state.locale || 'uz');
    try { if (typeof onLocaleChange === 'function') onLocaleChange(normalized); }
    catch (_) { return fail('CONFLICT','Interfeys tilini almashtirib bo‘lmadi.'); }
    set({ locale:normalized });
    return ok({ locale:normalized, persisted:false, scope:'client' });
  }
  function update(path, value) {
    if (!canSettings || !state.draft) return fail('FORBIDDEN','Do‘kon sozlamalarini tahrirlash uchun ruxsat yo‘q.');
    const draft = deepSet(state.draft, path, value);
    set({ draft, dirtySections:recalcDirty(draft, state.saved), saveError:null, saveSuccess:null });
    return ok({ path, value, dirtySections:recalcDirty(draft, state.saved) });
  }
  function resetSection(section = state.activeSection) {
    if (!state.saved || !state.draft) return fail('CONFLICT','Sozlamalar hali yuklanmagan.');
    if (state.savingSection === section) return fail('CONFLICT','Bu bo‘lim hozir saqlanmoqda.');
    if (section === 'integrations' || section === 'language') return fail('VALIDATION_ERROR','Bu bo‘limda server draft yo‘q.');
    const draft = replaceSection(state.draft, section, sectionValue(state.saved, section));
    set({ draft, dirtySections:recalcDirty(draft, state.saved), saveError:null, saveSuccess:null });
    return ok({ section });
  }
  async function saveBranding(submitted, submittedSection) {
    const valid = brandingValidation(submittedSection);
    if (!valid.ok) return failSave('branding', valid);
    let canonical = clone(sectionValue(state.saved, 'branding'));
    let workingSaved = state.saved;
    const desiredBrand = clone(submitted.branding || {});
    const savedBrand = clone(state.saved?.branding || {});
    const desiredDesign = clone(submitted.designSettings || {});
    const savedDesign = clone(state.saved?.designSettings || {});

    if (stable(desiredDesign) !== stable(savedDesign)) {
      const result = await adminPort.invoke('set_design_settings', { themeId:desiredDesign.themeId, colors:clone(desiredDesign.colors || {}) });
      if (!result?.ok) return failSave('branding', result, workingSaved);
      canonical.designSettings = clone(result.data?.designSettings || desiredDesign);
      workingSaved = replaceSection(workingSaved, 'branding', canonical);
    }
    if (desiredBrand.startMessage !== savedBrand.startMessage || desiredBrand.startImageUrl !== savedBrand.startImageUrl) {
      const result = await adminPort.invoke('set_start_message', {
        startMessage:desiredBrand.startMessage || null,
        removeStartImage:Boolean(savedBrand.startImageUrl && !desiredBrand.startImageUrl),
      });
      if (!result?.ok) return failSave('branding', result, workingSaved);
      canonical.branding = { ...canonical.branding,
        startMessage:result.data?.startMessage ?? desiredBrand.startMessage ?? '',
        startImageUrl:result.data?.startImageUrl ?? null,
      };
      workingSaved = replaceSection(workingSaved, 'branding', canonical);
    }
    const desiredLogo = { logoType:desiredBrand.logoType, logoUrl:desiredBrand.logoUrl || null, logoWordmark:normalizeWordmark(desiredBrand.logoWordmark, submitted.shopContact?.name || '') };
    const currentLogo = { logoType:savedBrand.logoType, logoUrl:savedBrand.logoUrl || null, logoWordmark:normalizeWordmark(savedBrand.logoWordmark, state.saved?.shopContact?.name || '') };
    if (stable(desiredLogo) !== stable(currentLogo)) {
      const payload = desiredLogo.logoType === 'WORDMARK'
        ? { logoType:'WORDMARK', wordmark:clone(desiredLogo.logoWordmark) }
        : { logoType:'IMAGE', logoUrl:desiredLogo.logoUrl || null };
      const result = await adminPort.invoke('set_shop_logo', payload);
      if (!result?.ok) return failSave('branding', result, workingSaved);
      canonical.branding = { ...canonical.branding,
        logoType:result.data?.branding?.logoType || desiredLogo.logoType,
        logoUrl:result.data?.branding?.logoUrl ?? desiredLogo.logoUrl,
        logoWordmark:normalizeWordmark(result.data?.branding?.logoWordmark ?? desiredLogo.logoWordmark, submitted.shopContact?.name || ''),
      };
      workingSaved = replaceSection(workingSaved, 'branding', canonical);
    }
    return ok({ canonical, workingSaved });
  }
  async function saveSection(section = state.activeSection) {
    if (!canSettings) return fail('FORBIDDEN','Do‘kon sozlamalarini saqlash uchun ruxsat yo‘q.');
    if (!SAVABLE_SECTION_IDS.includes(section)) return fail('CAPABILITY_UNAVAILABLE','Bu bo‘lim serverga saqlanmaydi.');
    if (!state.saved || !state.draft) return fail('CONFLICT','Sozlamalar hali yuklanmagan.');
    if (state.savingSection) return fail('CONFLICT','Boshqa sozlama saqlanmoqda.');
    if (!state.dirtySections.includes(section)) return ok({ section, saved:false, unchanged:true });

    const submitted = clone(state.draft);
    const submittedSection = sectionValue(submitted, section);
    set({ savingSection:section, saveError:null, saveSuccess:null });
    try {
      let canonical = clone(submittedSection);
      let savedBase = state.saved;
      if (section === 'shop') {
        const contact = await adminPort.invoke('set_shop_contact', clone(submitted.shopContact || {}));
        if (!contact?.ok) return failSave(section, contact);
        const threshold = await adminPort.invoke('set_low_stock_threshold', { threshold:submitted.lowStockThreshold });
        if (!threshold?.ok) return failSave(section, threshold);
        const paused = await adminPort.invoke('set_orders_paused', { paused:submitted.ordersPaused === true, note:submitted.ordersPausedNote || null });
        if (!paused?.ok) return failSave(section, paused);
        canonical = {
          shopContact:clone(contact.data?.shopContact || submitted.shopContact || {}),
          ordersPaused:submitted.ordersPaused === true,
          ordersPausedNote:submitted.ordersPaused === true ? (submitted.ordersPausedNote || '') : '',
          lowStockThreshold:Number(threshold.data?.lowStockThreshold ?? submitted.lowStockThreshold ?? 5),
        };
      } else if (section === 'delivery' || section === 'payments') {
        const config = clone(state.saved.fulfillmentConfig || submitted.fulfillmentConfig || {});
        config[section] = clone(submitted.fulfillmentConfig?.[section] || (section === 'payments' ? { methods:[] } : {}));
        const result = await adminPort.invoke('set_fulfillment_config', { config });
        if (!result?.ok) return failSave(section, result);
        canonical = clone(result.data?.fulfillmentConfig?.[section] || config[section]);
      } else if (section === 'returns') {
        const policy = clone(submitted.orderPolicies || {});
        const result = await adminPort.invoke('set_order_policies', policy);
        if (!result?.ok) return failSave(section, result);
        canonical = policy;
      } else if (section === 'branding') {
        const result = await saveBranding(submitted, submittedSection);
        if (!result.ok) return result;
        canonical = result.data.canonical;
        savedBase = result.data.workingSaved;
      }

      const saved = replaceSection(savedBase, section, canonical);
      let draft = state.draft;
      if (stable(sectionValue(draft, section)) === stable(submittedSection)) draft = replaceSection(draft, section, canonical);
      const dirtySections = recalcDirty(draft, saved);
      set({ saved, draft, dirtySections, savingSection:null, saveError:null, saveSuccess:{ section, at:new Date().toISOString() } });
      return ok({ section, saved:true });
    } catch (_) {
      return failSave(section, fail('NETWORK_ERROR','Sozlamani saqlashda tarmoq xatosi yuz berdi.',{ retryable:true }));
    }
  }
  async function connectIntegration(provider, credentials = {}) {
    if (!canIntegrations) return fail('FORBIDDEN','Integratsiyalar uchun ruxsat yo‘q.');
    const key=String(provider||'').toLowerCase(); const cfg=INTEGRATION_ACTIONS[key];
    if (!cfg?.connect) return fail('CAPABILITY_UNAVAILABLE','Bu integratsiyani ulash qo‘llanmaydi.');
    const current=state.integrations?.[key];
    if (current?.availability === 'UNAVAILABLE') return fail('CAPABILITY_UNAVAILABLE',current.message||'Integratsiya platformada ochilmagan.');
    const checked=connectionValidation(key, credentials); if(!checked.ok){set({integrationError:{provider:key,...checked.error},integrationSuccess:null});return checked;}
    set({ integrationBusy:`${key}:connect`, integrationError:null, integrationSuccess:null });
    let result;
    try {
      result = key === 'billz' && billzController ? await billzController.connect(checked.data.secretToken) : await adminPort.invoke(cfg.connect, checked.data);
    } catch (_) { result=fail('NETWORK_ERROR','Integratsiyani ulashda tarmoq xatosi yuz berdi.',{retryable:true}); }
    if (!result?.ok) { set({integrationBusy:null,integrationError:{provider:key,...clone(result?.error||{})},integrationSuccess:null}); return result; }
    const refreshed=await refreshIntegration(key);
    set({ integrationBusy:null, integrationError:null, integrationSuccess:{provider:key,action:'connect',at:new Date().toISOString()} });
    return refreshed.ok ? ok({provider:key,status:state.integrations?.[key]}) : refreshed;
  }
  async function disconnectIntegration(provider, { confirmed=false } = {}) {
    if (!canIntegrations) return fail('FORBIDDEN','Integratsiyalar uchun ruxsat yo‘q.');
    const key=String(provider||'').toLowerCase(); const cfg=INTEGRATION_ACTIONS[key];
    if (!cfg?.disconnect) return fail('CAPABILITY_UNAVAILABLE','Bu integratsiyani uzish qo‘llanmaydi.');
    if (!confirmed) return fail('VALIDATION_ERROR','Ulanishni uzish alohida tasdiqlanishi kerak.');
    set({ integrationBusy:`${key}:disconnect`, integrationError:null, integrationSuccess:null });
    let result;
    try { result = key === 'billz' && billzController ? await billzController.disconnect({confirmed:true}) : await adminPort.invoke(cfg.disconnect, {}); }
    catch (_) { result=fail('NETWORK_ERROR','Integratsiyani uzishda tarmoq xatosi yuz berdi.',{retryable:true}); }
    if (!result?.ok) { set({integrationBusy:null,integrationError:{provider:key,...clone(result?.error||{})}}); return result; }
    const refreshed=await refreshIntegration(key);
    set({ integrationBusy:null, integrationError:null, integrationSuccess:{provider:key,action:'disconnect',at:new Date().toISOString()} });
    return refreshed.ok ? ok({provider:key,status:state.integrations?.[key]}) : refreshed;
  }
  async function startIntegrationTest(provider, values = {}) {
    if (!canIntegrations) return fail('FORBIDDEN','Integratsiyalar uchun ruxsat yo‘q.');
    const key=String(provider||'').toLowerCase(); const cfg=INTEGRATION_ACTIONS[key];
    if (!cfg?.test) return fail('CAPABILITY_UNAVAILABLE','Bu integratsiyada test to‘lovi yo‘q.');
    const entry=state.integrations?.[key];
    if (entry?.status !== 'CONNECTED') return fail('CONFLICT','Avval integratsiyani ulang.');
    if (entry?.progress?.verified === true || entry?.details?.verified === true) return fail('CONFLICT','Integratsiya allaqachon tasdiqlangan.');
    const amount=Math.max(500,Math.min(50000,Math.round(Number(values.amount)||1000)));
    const payload={amount};
    if(key==='click'){
      const phoneNumber=String(values.phoneNumber||'').replace(/\D/g,'');
      if(!/^998\d{9}$/.test(phoneNumber))return fail('VALIDATION_ERROR','Click ilovasiga ulangan telefon raqamini 998XXXXXXXXX formatida kiriting.');
      payload.phoneNumber=phoneNumber;
    }
    set({integrationBusy:`${key}:test`,integrationError:null,integrationSuccess:null});
    let result; try{result=await adminPort.invoke(cfg.test,payload);}catch(_){result=fail('NETWORK_ERROR','Test to‘lovini boshlab bo‘lmadi.',{retryable:true});}
    if(!result?.ok){set({integrationBusy:null,integrationError:{provider:key,...clone(result?.error||{})}});return result;}
    await refreshIntegration(key);
    set({integrationBusy:null,integrationError:null,integrationSuccess:{provider:key,action:'test',attemptNumber:result.data?.attemptNumber||null,at:new Date().toISOString()}});
    return result;
  }
  return Object.freeze({
    subscribe(fn){ listeners.add(fn); return () => listeners.delete(fn); },
    getState:snapshot, load, setSection, setClientLocale, update, resetSection, saveSection,
    refreshIntegration, connectIntegration, disconnectIntegration, startIntegrationTest,
    isDirty(section){ return state.dirtySections.includes(section); },
  });
}
function docOf(documentRef) {
  const doc = documentRef || globalThis.document;
  if (!doc?.createElement) throw new Error('DOM document kerak.');
  return doc;
}
function node(doc, tag, className, value) { const el=doc.createElement(tag); el.className=className||''; if(value!=null) el.textContent=String(value); return el; }
function checkbox(doc, { label, checked=false, disabled=false, onChange }={}) {
  const wrap=node(doc,'label','uw-settings-toggle'); const input=doc.createElement('input'); input.type='checkbox'; input.checked=Boolean(checked); input.disabled=Boolean(disabled);
  const copy=node(doc,'span','uw-settings-toggle__copy',label||''); wrap.append(input,copy); if(typeof onChange==='function') input.addEventListener('change',()=>onChange(Boolean(input.checked))); return wrap;
}
function field(doc, controller, path, label, value, options={}) {
  const control=createTextField({ label, value:value??'', type:options.type||'text', help:options.help||'', disabled:options.disabled===true, inputMode:options.inputMode, placeholder:options.placeholder||'', autocomplete:options.autocomplete },doc);
  control.input.addEventListener('input',()=>controller.update(path, options.number ? Number(control.input.value) : control.input.value)); return control.element;
}
function sectionHeader(doc, title, description, dirty=false) {
  const wrap=node(doc,'div','uw-settings-section-head'); const copy=node(doc,'div',''); copy.append(node(doc,'h2','',title),node(doc,'p','',description)); wrap.append(copy);
  if(dirty) wrap.append(node(doc,'span','uw-settings-dirty','Saqlanmagan o‘zgarish')); return wrap;
}
function enabledDeliveryCount(delivery={}) { return ['free','fixed','taxi','post'].filter((key)=>delivery?.[key]?.enabled===true).length; }
function integrationLabel(entry) {
  if (!entry) return 'Yuklanmagan';
  if (entry.availability === 'UNAVAILABLE') return 'Platformada ochilmagan';
  if (entry.availability === 'ERROR') return 'Holatni olib bo‘lmadi';
  if (entry.status === 'CONNECTED') return entry.progress?.verified || entry.details?.verified ? 'Ulangan · tasdiqlangan' : 'Ulangan';
  return 'Ulanmagan';
}
function safeIntegrationDetails(doc, entry) {
  const details=entry?.details||{}; const wrap=node(doc,'div','uw-settings-integration-meta'); const safe=[];
  if(details.billzShopName) safe.push(`Do‘kon: ${details.billzShopName}`);
  if(details.billzCashboxName) safe.push(`Kassa: ${details.billzCashboxName}`);
  if(details.billzPaymentTypeName) safe.push(`To‘lov turi: ${details.billzPaymentTypeName}`);
  if(details.merchantId) safe.push(`Merchant ID: ${details.merchantId}`);
  if(details.serviceId) safe.push(`Service ID: ${details.serviceId}`);
  if(details.login) safe.push(`Login: ${details.login}`);
  if(details.terminalId) safe.push(`Terminal ID: ${details.terminalId}`);
  safe.forEach((value)=>wrap.append(node(doc,'small','',value)));
  if(entry?.progress && Number.isFinite(Number(entry.progress.confirmedCount))) wrap.append(node(doc,'small','',`Test to‘lovlari: ${Math.min(3,Number(entry.progress.confirmedCount))}/3`));
  return wrap;
}
function secretField(doc, label, autocomplete='off') { return createTextField({label,type:'password',value:'',autocomplete},doc); }
function integrationConnectForm(doc, key, entry, controller) {
  const form=node(doc,'div','uw-settings-integration-form');
  if(key==='billz'){
    const token=secretField(doc,'BILLZ maxfiy integratsiya kaliti'); form.append(token.element,createButton({label:'Ulash',busy:controller.getState().integrationBusy==='billz:connect',onClick:async()=>{try{await controller.connectIntegration('billz',{secretToken:token.input.value});}finally{token.input.value='';}}},doc));
  } else if(key==='click'){
    const merchant=createTextField({label:'Merchant ID',value:entry?.details?.merchantId||'',autocomplete:'off'},doc); const service=createTextField({label:'Service ID',value:entry?.details?.serviceId||'',autocomplete:'off'},doc); const user=createTextField({label:'Merchant User ID',value:'',autocomplete:'off'},doc); const secret=secretField(doc,'Secret Key');
    form.append(merchant.element,service.element,user.element,secret.element,createButton({label:'Ulash',busy:controller.getState().integrationBusy==='click:connect',onClick:async()=>{try{await controller.connectIntegration('click',{merchantId:merchant.input.value,serviceId:service.input.value,merchantUserId:user.input.value,secretKey:secret.input.value});}finally{secret.input.value='';}}},doc));
  } else if(key==='payme'){
    const merchant=createTextField({label:'Merchant ID',value:entry?.details?.merchantId||'',autocomplete:'off'},doc); const login=createTextField({label:'Login',value:entry?.details?.login||'',autocomplete:'username'},doc); const pass=secretField(doc,'Parol','new-password');
    form.append(merchant.element,login.element,pass.element,createButton({label:'Ulash',busy:controller.getState().integrationBusy==='payme:connect',onClick:async()=>{try{await controller.connectIntegration('payme',{merchantId:merchant.input.value,login:login.input.value,password:pass.input.value});}finally{pass.input.value='';}}},doc));
  } else if(key==='uzum'){
    const terminal=createTextField({label:'Terminal ID',value:entry?.details?.terminalId||'',autocomplete:'off'},doc); const api=secretField(doc,'API key');
    form.append(terminal.element,api.element,createButton({label:'Ulash',busy:controller.getState().integrationBusy==='uzum:connect',onClick:async()=>{try{await controller.connectIntegration('uzum',{terminalId:terminal.input.value,apiKey:api.input.value});}finally{api.input.value='';}}},doc));
  }
  return form;
}
function integrationTestForm(doc,key,entry,controller,openExternal){
  if(!['click','payme'].includes(key) || entry?.status!=='CONNECTED' || entry?.progress?.verified===true || entry?.details?.verified===true)return null;
  const form=node(doc,'div','uw-settings-test-form'); const amount=createTextField({label:'Test summasi',value:'1000',type:'number',inputMode:'numeric'},doc); form.append(amount.element);
  let phone=null; if(key==='click'){phone=createTextField({label:'Click telefon raqami',value:'',placeholder:'998901234567',inputMode:'tel',autocomplete:'tel'},doc);form.append(phone.element);}
  form.append(createButton({label:'Test to‘lovini boshlash',variant:'secondary',busy:controller.getState().integrationBusy===`${key}:test`,onClick:async()=>{const r=await controller.startIntegrationTest(key,{amount:amount.input.value,phoneNumber:phone?.input.value});if(r?.ok&&r.data?.checkoutUrl&&typeof openExternal==='function')openExternal(r.data.checkoutUrl);}},doc),createButton({label:'Progressni yangilash',variant:'ghost',onClick:()=>controller.refreshIntegration(key)},doc));
  return form;
}
function integrationCard(doc, key, name, entry, controller, {confirmAction,openExternal}={}) {
  const body=node(doc,'div','uw-settings-integration-body'); const chip=node(doc,'span','uw-settings-status',integrationLabel(entry)); chip.dataset.status=entry?.availability==='UNAVAILABLE'?'UNAVAILABLE':entry?.status||'UNKNOWN'; body.append(chip,safeIntegrationDetails(doc,entry));
  if(entry?.availability==='UNAVAILABLE') body.append(node(doc,'p','uw-settings-note',entry.message||'Platformada ochilmagan.'));
  else if(entry?.availability==='ERROR') body.append(node(doc,'p','uw-settings-save-feedback uw-settings-save-feedback--error',entry.error?.message||'Holatni olib bo‘lmadi.'));
  else if(entry?.status==='CONNECTED'){
    if(key==='billz') body.append(node(doc,'p','uw-settings-note','BILLZ katalog/config boshqaruvi Import bo‘limidagi mavjud J3 oqimida qoladi. Bu yerda ikkinchi import engine yaratilmaydi.'));
    const test=integrationTestForm(doc,key,entry,controller,openExternal); if(test)body.append(test);
    body.append(createButton({label:'Ulanishni uzish',variant:'danger',busy:controller.getState().integrationBusy===`${key}:disconnect`,onClick:async()=>{const ask=confirmAction||((message)=>globalThis.confirm?.(message)===true);if(await ask(`${name} ulanishi uzilsinmi?`))await controller.disconnectIntegration(key,{confirmed:true});}},doc));
  } else body.append(integrationConnectForm(doc,key,entry,controller));
  const current=controller.getState(); if(current.integrationError?.provider===key)body.append(node(doc,'p','uw-settings-save-feedback uw-settings-save-feedback--error',current.integrationError.message||'Integratsiya amali bajarilmadi.'));
  else if(current.integrationSuccess?.provider===key)body.append(node(doc,'p','uw-settings-save-feedback uw-settings-save-feedback--success',current.integrationSuccess.action==='disconnect'?'Ulanish uzildi.':current.integrationSuccess.action==='test'?'Test to‘lovi boshlandi.':'Integratsiya ulandi.'));
  return createCard({title:name,description:'Maxfiy qiymatlar saqlangan holatda brauzerga qaytarilmaydi.',body},doc);
}

export function createAdminSettingsView({ controller, state=controller?.getState?.()||{}, confirmAction, openExternal=(url)=>globalThis.open?.(url,'_blank','noopener,noreferrer') }={}, documentRef) {
  const doc=docOf(documentRef); const root=node(doc,'section','uw-admin-settings'); root.dataset.feature='admin-settings';
  const header=node(doc,'header','uw-admin-settings__header'); const copy=node(doc,'div',''); copy.append(node(doc,'h1','', 'Sozlamalar'), node(doc,'p','', 'Do‘kon, yetkazib berish, to‘lov, qaytarish, til, branding va integratsiyalar.'));
  header.append(copy); root.append(header);
  if (!state.allowed || state.status==='permission') { root.append(createStatePanel({kind:'permission',title:'Ruxsat yo‘q',message:'Sozlamalarni ko‘rish uchun kerakli huquq mavjud emas.'},doc)); return {element:root}; }
  if (state.status==='idle' || state.status==='loading') { root.append(createStatePanel({kind:'loading',title:'Sozlamalar yuklanmoqda',message:'Serverdagi joriy sozlamalar olinmoqda…'},doc)); return {element:root}; }
  if (state.status==='error') { root.append(createStatePanel({kind:'error',title:'Sozlamalarni ochib bo‘lmadi',message:state.error?.message||'Qayta urinib ko‘ring.',actionLabel:'Qayta urinish',onAction:()=>controller.load()},doc)); return {element:root}; }

  const tabs=node(doc,'nav','uw-settings-tabs'); tabs.setAttribute('aria-label','Sozlamalar bo‘limlari');
  const labels={shop:'Do‘kon',delivery:'Yetkazib berish',payments:'To‘lov',returns:'Qaytarish',language:'Til',branding:'Branding',integrations:'Integratsiyalar'};
  for (const id of SECTION_IDS) {
    if (id==='integrations' && !state.permissions?.integrations) continue;
    if (id!=='integrations' && !state.permissions?.settings) continue;
    const button=createButton({label:labels[id],variant:'ghost',size:'sm',onClick:()=>controller.setSection(id)},doc); button.className+=' uw-settings-tab'; button.dataset.active=state.activeSection===id?'true':'false'; if(state.dirtySections?.includes(id)) button.dataset.dirty='true'; tabs.append(button);
  }
  root.append(tabs);
  const draft=state.draft||{}; const section=node(doc,'div','uw-settings-panel');

  if (state.activeSection==='shop') {
    section.append(sectionHeader(doc,'Do‘kon ma’lumotlari','Mijoz ko‘radigan aloqa va operatsion ma’lumotlar.',state.dirtySections?.includes('shop')));
    const grid=node(doc,'div','uw-settings-grid'); const c=draft.shopContact||{};
    grid.append(field(doc,controller,'shopContact.name','Do‘kon nomi',c.name),field(doc,controller,'shopContact.address','Manzil',c.address),field(doc,controller,'shopContact.coordinates','Koordinatalar',c.coordinates,{help:'Masalan: 41.2995,69.2401'}),field(doc,controller,'shopContact.workHours','Ish vaqti',c.workHours));
    grid.append(field(doc,controller,'shopContact.phone','Telefon',c.phone),field(doc,controller,'shopContact.phone2','Qo‘shimcha telefon',c.phone2),field(doc,controller,'shopContact.instagram','Instagram',c.instagram),field(doc,controller,'shopContact.telegram','Telegram',c.telegram));
    grid.append(field(doc,controller,'lowStockThreshold','Kam qolgan qoldiq chegarasi',draft.lowStockThreshold,{type:'number',number:true,inputMode:'numeric'})); section.append(grid);
    section.append(checkbox(doc,{label:'Buyurtmalarni vaqtincha qabul qilmaslik',checked:draft.ordersPaused,onChange:(v)=>controller.update('ordersPaused',v)}));
    section.append(field(doc,controller,'ordersPausedNote','Pause izohi',draft.ordersPausedNote,{help:'Mijozga ko‘rinadigan qisqa izoh.'}));
  } else if (state.activeSection==='delivery') {
    const delivery=draft.fulfillmentConfig?.delivery||{}; section.append(sectionHeader(doc,'Yetkazib berish',`${enabledDeliveryCount(delivery)} ta usul yoqilgan. Region tafsilotlari joriy server konfiguratsiyasidan olinadi.`,state.dirtySections?.includes('delivery')));
    const list=node(doc,'div','uw-settings-cards');
    const defs=[['free','Bepul yetkazib berish'],['fixed','Belgilangan narx'],['taxi','Taksi/kuryer'],['post','Pochta']];
    for(const [key,label] of defs){const body=node(doc,'div','uw-settings-stack');body.append(checkbox(doc,{label:'Yoqilgan',checked:delivery?.[key]?.enabled,onChange:(v)=>controller.update(`fulfillmentConfig.delivery.${key}.enabled`,v)}));
      if(key==='fixed') body.append(field(doc,controller,'fulfillmentConfig.delivery.fixed.general.fee','Umumiy narx',delivery?.fixed?.general?.fee??'',{type:'number',number:true,inputMode:'numeric'}));
      if(key==='taxi'){body.append(field(doc,controller,'fulfillmentConfig.delivery.taxi.general.minFee','Minimal narx',delivery?.taxi?.general?.minFee??'',{type:'number',number:true,inputMode:'numeric'}),field(doc,controller,'fulfillmentConfig.delivery.taxi.general.maxFee','Maksimal narx',delivery?.taxi?.general?.maxFee??'',{type:'number',number:true,inputMode:'numeric'}));}
      const regionCount=key==='post'?(delivery?.post?.providers||[]).reduce((n,p)=>n+Object.keys(p.regions||{}).length,0):Object.keys(delivery?.[key]?.regions||{}).length;body.append(node(doc,'small','',`Sozlangan hududlar: ${regionCount}`));list.append(createCard({title:label,body},doc));}
    section.append(list);
  } else if (state.activeSection==='payments') {
    section.append(sectionHeader(doc,'To‘lov usullari','Mavjud server metodlari. Credentiallar Integratsiyalar bo‘limida bir martalik kiritiladi.',state.dirtySections?.includes('payments')));
    const methods=Array.isArray(draft.fulfillmentConfig?.payments?.methods)?draft.fulfillmentConfig.payments.methods:[]; const list=node(doc,'div','uw-settings-cards');
    methods.forEach((method,index)=>{const body=node(doc,'div','uw-settings-stack');body.append(checkbox(doc,{label:'Yoqilgan',checked:method.enabled,onChange:(v)=>controller.update(`fulfillmentConfig.payments.methods.${index}.enabled`,v)}));body.append(node(doc,'small','',`Hududlar: ${Object.keys(method.regions||{}).length}`));
      if(method.id==='CARD'){body.append(field(doc,controller,`fulfillmentConfig.payments.methods.${index}.cardNumber`,'Karta raqami',method.cardNumber||''),field(doc,controller,`fulfillmentConfig.payments.methods.${index}.cardHolder`,'Karta egasi',method.cardHolder||''));}
      if(method.id==='QR') body.append(node(doc,'small','',`QR provayderlar: ${(method.providers||[]).filter(p=>p.enabled).map(p=>p.name||p.id).join(', ')||'yo‘q'}`));
      list.append(createCard({title:method.name||method.id,description:method.id,body},doc));}); section.append(list);
  } else if (state.activeSection==='returns') {
    section.append(sectionHeader(doc,'Bekor qilish va qaytarish','Mijoz buyurtmasi uchun amaldagi siyosatlar.',state.dirtySections?.includes('returns'))); const p=draft.orderPolicies||{}; const grid=node(doc,'div','uw-settings-grid');
    const select=createSelectField({label:'Bekor qilish chegarasi',value:p.customerCancelCutoff,options:[{value:'NEW_ONLY',label:'Faqat yangi buyurtmada'},{value:'BEFORE_SHIPPED',label:'Jo‘natishdan oldin'},{value:'ANY_NON_TERMINAL',label:'Yakuniy holatgacha'}]},doc); select.select.addEventListener('change',()=>controller.update('orderPolicies.customerCancelCutoff',select.select.value));
    grid.append(select.element,field(doc,controller,'orderPolicies.returnWindowDays','Qaytarish muddati (kun)',p.returnWindowDays,{type:'number',number:true,inputMode:'numeric'})); section.append(grid);
    section.append(checkbox(doc,{label:'Qaytarish so‘rovlarini qabul qilish',checked:p.returnRequestsEnabled,onChange:(v)=>controller.update('orderPolicies.returnRequestsEnabled',v)}));
    section.append(field(doc,controller,'orderPolicies.returnPolicyText','Qaytarish shartlari',p.returnPolicyText,{help:'Bu matn qonuniy majburiy huquqlarni cheklamasligi kerak.'}));
  } else if (state.activeSection==='language') {
    section.append(sectionHeader(doc,'Til','Premium web interfeysi tili. Backendda do‘kon uchun alohida persistent til fieldi yo‘q.',false));
    const localeField=createSelectField({label:'Interfeys tili',value:state.locale||'uz',options:[{value:'uz',label:'O‘zbekcha'},{value:'ru',label:'Русский'}],help:'Bu tanlov faqat joriy web klientiga qo‘llanadi; serverda “do‘kon tili saqlandi” deb ko‘rsatilmaydi.'},doc);
    localeField.select.addEventListener('change',()=>controller.setClientLocale(localeField.select.value)); section.append(localeField.element,node(doc,'p','uw-settings-note','Saqlash tugmasi ataylab yo‘q: bu server sozlamasi emas.'));
  } else if (state.activeSection==='branding') {
    section.append(sectionHeader(doc,'Branding','Logo wordmarki, /start xabari va dizayn serverda tasdiqlangandan keyin saqlanadi.',state.dirtySections?.includes('branding'))); const b=draft.branding||{}; const d=draft.designSettings||{}; const grid=node(doc,'div','uw-settings-grid');
    const imageUnavailable=!b.logoUrl && b.logoType==='WORDMARK';
    const logoType=createSelectField({label:'Logo turi',value:b.logoType,options:[{value:'IMAGE',label:'Managed rasm',disabled:imageUnavailable},{value:'WORDMARK',label:'Wordmark'}],help:imageUnavailable?'Yangi rasm URL bilan qo‘shilmaydi. Hozir managed rasm mavjud emas; Wordmark ishlating.':'Tashqi URL qabul qilinmaydi; faqat server tan olgan managed rasm saqlanadi.'},doc);logoType.select.addEventListener('change',()=>controller.update('branding.logoType',logoType.select.value));
    const theme=createSelectField({label:'Tema',value:d.themeId,options:['minimal','dark','sport','elegant','bright','generated','custom']},doc);theme.select.addEventListener('change',()=>controller.update('designSettings.themeId',theme.select.value));
    grid.append(logoType.element,theme.element,field(doc,controller,'branding.startMessage','/start xabari',b.startMessage,{help:'Telegram bot /start xabari. 4000 belgigacha.'})); section.append(grid);
    if(b.logoType==='WORDMARK'){
      const wm=b.logoWordmark||{}; const wmGrid=node(doc,'div','uw-settings-grid');
      wmGrid.append(field(doc,controller,'branding.logoWordmark.presetId','Wordmark uslubi',wm.presetId||'clean'),field(doc,controller,'branding.logoWordmark.text','Wordmark matni',wm.text||draft.shopContact?.name||''),field(doc,controller,'branding.logoWordmark.textColor','Matn rangi',wm.textColor||'#ffffff',{placeholder:'#ffffff'}),field(doc,controller,'branding.logoWordmark.backgroundColor','Fon rangi',wm.backgroundColor||'#0f172a',{placeholder:'#0f172a'}));section.append(wmGrid);
    }
    const colors=node(doc,'div','uw-settings-grid'); for(const [key,label] of DESIGN_COLOR_FIELDS)colors.append(field(doc,controller,`designSettings.colors.${key}`,label,d.colors?.[key]||'',{placeholder:'#RRGGBB'})); section.append(colors);
    const meta=node(doc,'div','uw-settings-brand-meta'); meta.append(node(doc,'small','',`Managed logo: ${b.logoUrl?'mavjud':'yo‘q'}`),node(doc,'small','',`Start rasmi: ${b.startImageUrl?'mavjud':'yo‘q'}`)); section.append(meta);
    if(b.startImageUrl) section.append(createButton({label:'Start rasmini olib tashlash',variant:'secondary',onClick:()=>controller.update('branding.startImageUrl',null)},doc));
    section.append(node(doc,'p','uw-settings-note','Yangi logo rasmi uchun tashqi URL maydoni yo‘q. Web port arbitrary URL bilan serverning managed-image tekshiruvini chetlab o‘tmaydi.'));
  } else if (state.activeSection==='integrations') {
    section.append(sectionHeader(doc,'Integratsiyalar','Credentiallar faqat ulash tugmasi bosilgan paytda bir martalik request sifatida yuboriladi; status API secretlarni qaytarmaydi.',false)); const cards=node(doc,'div','uw-settings-cards');
    cards.append(integrationCard(doc,'billz','BILLZ',state.integrations?.billz,controller,{confirmAction,openExternal}),integrationCard(doc,'click','Click',state.integrations?.click,controller,{confirmAction,openExternal}),integrationCard(doc,'payme','Payme',state.integrations?.payme,controller,{confirmAction,openExternal}),integrationCard(doc,'uzum','Uzum',state.integrations?.uzum,controller,{confirmAction,openExternal})); section.append(cards);
  }

  if (!['integrations','language'].includes(state.activeSection) && state.permissions?.settings) {
    const actions=node(doc,'div','uw-settings-actions'); const dirty=state.dirtySections?.includes(state.activeSection);
    const saveable=SAVABLE_SECTION_IDS.includes(state.activeSection); const busy=state.savingSection===state.activeSection;
    actions.append(createButton({label:'O‘zgarishlarni bekor qilish',variant:'secondary',disabled:!dirty||busy,onClick:()=>controller.resetSection(state.activeSection)},doc));
    const save=createButton({label:'Saqlash',variant:'primary',busy,disabled:!saveable||!dirty,onClick:()=>controller.saveSection(state.activeSection)},doc); actions.append(save); section.append(actions);
    if(state.saveError?.section===state.activeSection) section.append(node(doc,'p','uw-settings-save-feedback uw-settings-save-feedback--error',state.saveError.message||'Saqlab bo‘lmadi. Draft saqlandi.'));
    else if(state.saveSuccess?.section===state.activeSection) section.append(node(doc,'p','uw-settings-save-feedback uw-settings-save-feedback--success','Sozlama serverda saqlandi.'));
  }
  root.append(section); return {element:root};
}
