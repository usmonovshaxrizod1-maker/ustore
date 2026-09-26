import { createDomainsPort } from '../../services/ports/domains.js';
const STATUS_COPY = {
  DRAFT: ['Tayyorlanmoqda', 'Черновик'],
  PENDING_DNS: ['DNS kutilmoqda', 'Ожидание DNS'],
  VERIFYING: ['Tekshirilmoqda', 'Проверяется'],
  PENDING_TLS: ['HTTPS kutilmoqda', 'Ожидание HTTPS'],
  ACTIVE: ['Faol', 'Активен'],
  ERROR: ['Xato', 'Ошибка'],
  REMOVING: ["O‘chirilmoqda", 'Удаляется'],
};
const DNS_COPY = {
  UNKNOWN: ["Noma’lum", 'Неизвестно'], PENDING: ['Kutilmoqda', 'Ожидание'],
  VERIFIED: ['Tasdiqlangan', 'Подтверждён'], ERROR: ['Xato', 'Ошибка'],
};
const TLS_COPY = {
  UNKNOWN: ["Noma’lum", 'Неизвестно'], PENDING: ['Kutilmoqda', 'Ожидание'],
  ACTIVE: ['Tayyor', 'Готов'], ERROR: ['Xato', 'Ошибка'],
};
function pick(lang, pair) { return pair?.[lang === 'ru' ? 1 : 0] || ''; }
function t(lang, uz, ru) { return lang === 'ru' ? ru : uz; }
function docOf(ref) { const d = ref || globalThis.document; if (!d?.createElement) throw new Error('DOM document required'); return d; }
function canManage(context) {
  const actor = context?.actor;
  if (!actor) return false;
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  const roles = Array.isArray(actor.roleCodes) ? actor.roleCodes : [];
  return actor.shopRole === 'OWNER' || (roles.includes('MANAGER') && (permissions.includes('*') || permissions.includes('domains.manage')));
}
function safeHost(value) { return String(value || '').trim().toLowerCase().replace(/\.$/, ''); }
export function normalizeDomainInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { raw, hostname: '', valid: false, changed: false, reason: 'EMPTY' };
  let candidate = raw;
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate);
    const looksLikeUrl = hasScheme || candidate.startsWith('//') || /[/?#]/.test(candidate);
    if (looksLikeUrl) {
      const parsed = new URL(candidate.startsWith('//') ? `https:${candidate}` : hasScheme ? candidate : `https://${candidate}`);
      if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) {
        return { raw, hostname: '', valid: false, changed: false, reason: 'INVALID_URL' };
      }
      candidate = parsed.hostname;
    }
  } catch (_) { return { raw, hostname: '', valid: false, changed: false, reason: 'INVALID_URL' }; }
  const hostname = safeHost(candidate);
  const labels = hostname.split('.');
  const valid = hostname.length <= 253 && hostname.includes('.') && !hostname.startsWith('*.')
    && /^[a-z0-9.-]+$/.test(hostname)
    && labels.every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))
    && /^[a-z][a-z0-9-]*$/.test(labels.at(-1) || '');
  return { raw, hostname, valid, changed: hostname !== raw, reason: valid ? null : 'INVALID_HOSTNAME' };
}
function dnsRecordScope(record, domain) {
  const rawName = String(record?.name || '').trim().toLowerCase().replace(/\.$/, '');
  const host = safeHost(domain?.hostname);
  if (!rawName || !host) return 'OTHER';
  if (rawName === '@' || rawName === host) return host.startsWith('www.') ? 'WWW' : 'APEX';
  const wwwHost = host.startsWith('www.') ? host : `www.${host}`;
  if (rawName === 'www' || rawName === wwwHost) return 'WWW';
  return 'OTHER';
}
function purposeCopy(lang, value) {
  const purpose = String(value || '').toUpperCase();
  if (purpose === 'OWNERSHIP') return t(lang, 'Egalikni tasdiqlash', 'Подтверждение владения');
  if (purpose === 'TLS') return t(lang, 'HTTPS sertifikati', 'Сертификат HTTPS');
  if (purpose === 'ROUTING') return t(lang, "Yo‘naltirish", 'Маршрутизация');
  return String(value || '');
}
function statusTone(status) { return status === 'ACTIVE' ? 'success' : status === 'ERROR' ? 'danger' : status === 'REMOVING' ? 'muted' : 'warning'; }
function lifecycleCopy(lang, domain) {
  const status = String(domain?.status || 'DRAFT');
  if (status === 'PENDING_DNS' || status === 'DRAFT') return t(lang,
    'DNS hali tasdiqlanmagan. Provayder bergan yozuvlarni DNS panelingizga kiriting, so‘ng tekshiring.',
    'DNS ещё не подтверждён. Добавьте выданные записи в DNS-панель и затем запустите проверку.');
  if (status === 'VERIFYING') return t(lang,
    'Tekshiruv davom etmoqda. DNS va HTTPS natijalari serverdan yangilanadi.',
    'Идёт проверка. Статусы DNS и HTTPS обновятся с сервера.');
  if (status === 'PENDING_TLS') return t(lang,
    'DNS tasdiqlangan. HTTPS sertifikati yoki routing hali tayyor emas — domenni asosiy qilishga hali erta.',
    'DNS подтверждён. HTTPS-сертификат или маршрутизация ещё не готовы — делать домен основным пока нельзя.');
  if (status === 'ACTIVE') return t(lang,
    'DNS va HTTPS tayyor. Domen trafik qabul qilishga tayyor.',
    'DNS и HTTPS готовы. Домен готов принимать трафик.');
  if (status === 'ERROR') return t(lang,
    'Tekshiruv xato bilan tugadi. DNS va HTTPS holatini alohida ko‘rib, xatoni tuzatgach qayta urinib ko‘ring.',
    'Проверка завершилась ошибкой. Проверьте DNS и HTTPS отдельно, исправьте причину и повторите.');
  if (status === 'REMOVING') return t(lang,
    'Domen uzilmoqda. Bu holatda tekshirish, primary qilish va qayta ulash amallari yopiq.',
    'Домен отключается. Проверка, назначение основным и повторное подключение временно недоступны.');
  return pick(lang, STATUS_COPY[status]) || status;
}
function lifecycleTone(domain) {
  if (domain?.status === 'ACTIVE') return 'success';
  if (domain?.status === 'ERROR') return 'danger';
  if (domain?.status === 'REMOVING') return 'muted';
  return 'warning';
}
function recordKey(record) { return `${record?.type || ''}|${record?.name || ''}|${record?.value || ''}`; }

export function createDomainsFeature(options = {}, documentRef) {
  const doc = docOf(documentRef);
  const {
    port: rawPort, context, language = 'uz', clipboard = globalThis.navigator?.clipboard,
    openUrl = (url) => globalThis.open?.(url, '_blank', 'noopener,noreferrer'),
    confirm = async (message) => globalThis.confirm?.(message) === true, onToast = () => {},
  } = options;
  const port = createDomainsPort(rawPort);
  let loadGeneration = 0;
  let destroyed = false;
  if (!port || ['list','add','verify','setPrimary','remove'].some((name) => typeof port[name] !== 'function')) throw new TypeError('domains port incomplete');

  const state = { items: [], loading: false, error: null, busy: new Set(), adding: false, addOpen: false, hostname: '', miniApp: null, miniAppBusy: false };
  const root = doc.createElement('section');
  root.className = `uw-domains${context?.mode === 'telegram' ? ' is-telegram' : ''}`;
  root.dataset.feature = 'domains';
  root.dataset.mode = context?.mode === 'telegram' ? 'telegram' : 'web';

  function toast(message, tone = 'info') { try { onToast({ message, tone }); } catch (_) {} }
  async function copy(value, label) {
    try {
      if (!clipboard?.writeText) throw new Error('clipboard_unavailable');
      await clipboard.writeText(String(value));
      toast(t(language, `${label} nusxalandi`, `${label} скопирован`), 'success');
    } catch (_) { toast(t(language, 'Nusxalab bo‘lmadi', 'Не удалось скопировать'), 'danger'); }
  }
  function button(label, action, { disabled = false, danger = false, primary = false, ariaLabel = '' } = {}) {
    const b = doc.createElement('button'); b.type = 'button';
    b.className = `uw-domain-btn${primary ? ' is-primary' : ''}${danger ? ' is-danger' : ''}`;
    b.textContent = label; b.disabled = disabled;
    if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
    if (action) b.addEventListener('click', action);
    return b;
  }
  function chip(text, tone) { const s = doc.createElement('span'); s.className = 'uw-domain-chip'; s.dataset.tone = tone || 'muted'; s.textContent = text; return s; }
  function detail(label, value, tone) {
    const row = doc.createElement('div'); row.className = 'uw-domain-detail';
    const l = doc.createElement('span'); l.textContent = label; const v = chip(value, tone); row.append(l, v); return row;
  }
  function records(domain) {
    const list = Array.isArray(domain.records) ? domain.records : [];
    if (!list.length) return null;
    const wrap = doc.createElement('div'); wrap.className = 'uw-domain-records';
    const title = doc.createElement('strong'); title.textContent = t(language, 'DNS yozuvlari', 'DNS-записи'); wrap.append(title);
    const seen = new Set();
    const groups = { APEX: [], WWW: [], OTHER: [] };
    for (const rec of list) {
      const key = recordKey(rec); if (seen.has(key)) continue; seen.add(key);
      groups[dnsRecordScope(rec, domain)].push(rec);
    }
    const headings = {
      APEX: t(language, 'Apex / ildiz domen', 'Apex / корневой домен'),
      WWW: t(language, 'WWW domen', 'Домен WWW'),
      OTHER: t(language, 'Tasdiqlash va boshqa yozuvlar', 'Проверка и другие записи'),
    };
    for (const scope of ['APEX','WWW','OTHER']) {
      if (!groups[scope].length) continue;
      const section = doc.createElement('section'); section.className = 'uw-domain-record-group'; section.dataset.scope = scope.toLowerCase();
      const heading = doc.createElement('div'); heading.className = 'uw-domain-record-group__title'; heading.textContent = headings[scope]; section.append(heading);
      for (const rec of groups[scope]) {
        const row = doc.createElement('div'); row.className = 'uw-domain-record'; row.dataset.recordType = String(rec.type || 'DNS').toUpperCase();
        const meta = doc.createElement('div');
        const type = doc.createElement('b'); type.textContent = String(rec.type || 'DNS').toUpperCase();
        const name = doc.createElement('code'); name.textContent = String(rec.name || '');
        const value = doc.createElement('code'); value.textContent = String(rec.value || '');
        const purpose = doc.createElement('small'); purpose.textContent = purposeCopy(language, rec.purpose);
        meta.append(type, name, value, purpose);
        const actions = doc.createElement('div'); actions.className = 'uw-domain-record__actions';
        if (rec.name) actions.append(button(t(language,'Nomni nusxalash','Копировать имя'), () => copy(rec.name, t(language,'Nom','Имя'))));
        if (rec.value) actions.append(button(t(language,'Qiymatni nusxalash','Копировать значение'), () => copy(rec.value, t(language,'Qiymat','Значение'))));
        row.append(meta, actions); section.append(row);
      }
      wrap.append(section);
    }
    return wrap;
  }
  async function run(domainId, action, fn, success) {
    if (state.busy.has(domainId)) return;
    state.busy.add(domainId); render();
    const result = await fn();
    state.busy.delete(domainId);
    if (!result?.ok) {
      state.error = result?.error || { code: 'NETWORK_ERROR', message: t(language,'Amal bajarilmadi','Операция не выполнена') };
      toast(state.error.message || t(language,'Amal bajarilmadi','Операция не выполнена'), 'danger');
      render(); return result;
    }
    state.error = null; toast(success, 'success'); await load(); return result;
  }
  function domainCard(domain) {
    const card = doc.createElement('article'); card.className = 'uw-domain-card'; card.dataset.status = domain.status;
    const head = doc.createElement('div'); head.className = 'uw-domain-card__head';
    const copyBlock = doc.createElement('div'); copyBlock.className = 'uw-domain-card__copy';
    const title = doc.createElement('div'); title.className = 'uw-domain-card__title';
    const host = doc.createElement('strong'); host.textContent = domain.hostname;
    title.append(host, chip(domain.kind === 'SUBDOMAIN' ? t(language,'UStorE subdomeni','Субдомен UStorE') : t(language,'Shaxsiy domen','Свой домен'), 'muted'));
    if (domain.isPrimary) title.append(chip(t(language,'Asosiy','Основной'), 'primary'));
    const sub = doc.createElement('small'); sub.textContent = pick(language, STATUS_COPY[domain.status]) || domain.status;
    copyBlock.append(title, sub); head.append(copyBlock, chip(pick(language, STATUS_COPY[domain.status]) || domain.status, statusTone(domain.status)));
    card.append(head);

    const grid = doc.createElement('div'); grid.className = 'uw-domain-details';
    grid.append(
      detail('DNS', pick(language, DNS_COPY[domain.dnsStatus]) || domain.dnsStatus, domain.dnsStatus === 'VERIFIED' ? 'success' : domain.dnsStatus === 'ERROR' ? 'danger' : 'warning'),
      detail('HTTPS', pick(language, TLS_COPY[domain.tlsStatus]) || domain.tlsStatus, domain.tlsStatus === 'ACTIVE' ? 'success' : domain.tlsStatus === 'ERROR' ? 'danger' : 'warning'),
    );
    card.append(grid);
    const lifecycle = doc.createElement('div'); lifecycle.className = 'uw-domain-lifecycle'; lifecycle.dataset.tone = lifecycleTone(domain); lifecycle.dataset.status = String(domain.status || 'DRAFT').toLowerCase();
    const lifecycleTitle = doc.createElement('strong'); lifecycleTitle.textContent = t(language,'Holat izohi','Пояснение статуса');
    const lifecycleText = doc.createElement('p'); lifecycleText.textContent = lifecycleCopy(language, domain);
    lifecycle.append(lifecycleTitle, lifecycleText); card.append(lifecycle);
    const rec = records(domain); if (rec) card.append(rec);

    if (domain.errorCode) { const e = doc.createElement('p'); e.className = 'uw-domain-inline-error'; e.textContent = `${t(language,'Xato kodi','Код ошибки')}: ${domain.errorCode}`; card.append(e); }
    const actions = doc.createElement('div'); actions.className = 'uw-domain-actions';
    const busy = state.busy.has(domain.id);
    actions.append(button(t(language,'Nusxalash','Копировать'), () => copy(domain.hostname, t(language,'Domen','Домен')), { disabled: busy }));
    if (domain.status === 'ACTIVE') actions.append(button(t(language,'Ochish','Открыть'), () => openUrl(`https://${domain.hostname}`), { disabled: busy }));
    if (['DRAFT','PENDING_DNS','VERIFYING','PENDING_TLS','ERROR'].includes(domain.status)) {
      actions.append(button(busy ? t(language,'Tekshirilmoqda…','Проверка…') : domain.status === 'ERROR' ? t(language,'Qayta urinish','Повторить') : t(language,'Tekshirish','Проверить'), () => run(domain.id, 'verify', () => port.verify({ domainId: domain.id }), t(language,'Tekshirish boshlandi','Проверка запущена')), { disabled: busy, primary: true }));
    }
    if (domain.status === 'ACTIVE' && domain.kind === 'CUSTOM' && state.miniApp?.customDomainSwitchEnabled && state.miniApp?.domainId !== domain.id && typeof port.setMiniAppTarget === 'function') {
      actions.append(button(t(language,'Mini Appga ulash','Подключить к Mini App'), async () => {
        if (!await confirm(t(language,`${domain.hostname} Telegram Mini App manzili qilinsinmi? Eski UStorE havolalari ishlashda davom etadi.`,`Использовать ${domain.hostname} для Telegram Mini App? Старые ссылки UStorE продолжат работать.`))) return;
        state.miniAppBusy = true; render();
        const result = await port.setMiniAppTarget({ domainId: domain.id, confirm: true }); state.miniAppBusy = false;
        if (!result?.ok) { state.error = result?.error; toast(result?.error?.message || t(language,'Mini App manzili o‘zgarmadi','Адрес Mini App не изменён'),'danger'); render(); return; }
        state.miniApp = result.data; toast(t(language,'Telegram Mini App manzili o‘zgartirildi','Адрес Telegram Mini App изменён'),'success'); render();
      }, { disabled: busy || state.miniAppBusy }));
    }
    if (domain.status === 'ACTIVE' && !domain.isPrimary) actions.append(button(t(language,'Asosiy qilish','Сделать основным'), async () => {
      if (!await confirm(t(language,`${domain.hostname} asosiy domen qilinsinmi?`,`Сделать ${domain.hostname} основным доменом?`))) return;
      await run(domain.id, 'primary', () => port.setPrimary({ domainId: domain.id }), t(language,'Asosiy domen o‘zgartirildi','Основной домен изменён'));
    }, { disabled: busy }));
    if (domain.kind === 'CUSTOM' && domain.status !== 'REMOVING') actions.append(button(t(language,"Uzish","Отключить"), async () => {
      const miniAppUsesDomain = state.miniApp?.domainId === domain.id;
      const impact = [
        domain.isPrimary ? t(language,'Bu hozir asosiy domen. U uzilganda server primary belgini olib tashlaydi.','Сейчас это основной домен. При отключении сервер снимет признак основного.') : '',
        miniAppUsesDomain ? t(language,'Telegram Mini App standart UStorE manziliga qaytariladi.','Telegram Mini App будет возвращён на стандартный адрес UStorE.') : '',
      ].filter(Boolean).join(' ');
      const prompt = t(language,`${domain.hostname} do‘kondan uzilsinmi? UStorE bu hostname orqali trafik qabul qilishni to‘xtatadi.${impact ? ` ${impact}` : ''}`,`Отключить ${domain.hostname} от магазина? UStorE перестанет принимать трафик через этот hostname.${impact ? ` ${impact}` : ''}`);
      if (!await confirm(prompt)) return;
      await run(domain.id, 'remove', () => port.remove({ domainId: domain.id }), t(language,'Domenni uzish boshlandi','Отключение домена начато'));
    }, { disabled: busy, danger: true }));
    card.append(actions);
    if (domain.lastCheckedAt) { const checked = doc.createElement('small'); checked.className = 'uw-domain-checked'; checked.textContent = `${t(language,'Oxirgi tekshiruv','Последняя проверка')}: ${new Date(domain.lastCheckedAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}`; card.append(checked); }
    return card;
  }
  async function add() {
    if (state.adding) return;
    const normalized = normalizeDomainInput(state.hostname);
    if (!normalized.valid) {
      state.error = { code: 'VALIDATION_ERROR', message: t(language,'Domen nomini to‘g‘ri kiriting','Введите корректный домен') }; render(); return;
    }
    state.adding = true; render();
    const result = await port.add({ hostname: normalized.hostname });
    state.adding = false;
    if (!result?.ok) { state.error = result?.error || { code:'NETWORK_ERROR', message:t(language,'Domen qo‘shilmadi','Домен не добавлен') }; toast(state.error.message, 'danger'); render(); return; }
    state.hostname = ''; state.addOpen = false; state.error = null;
    toast(t(language,'Domen qo‘shildi. DNS yozuvlari hali ko‘rinmasa, “Tekshirish”ni bosing.','Домен добавлен. Если DNS-записи ещё не появились, нажмите «Проверить».'), 'success'); await load();
  }
  function render() {
    if (destroyed) return;
    root.replaceChildren();
    if (!canManage(context)) {
      const box = doc.createElement('div'); box.className = 'uw-domain-state is-permission';
      const b = doc.createElement('strong'); b.textContent = t(language,'Domenlarni boshqarish huquqi yo‘q','Нет доступа к управлению доменами');
      const p = doc.createElement('p'); p.textContent = t(language,'Bu bo‘lim faqat do‘kon egasi va MANAGER uchun.','Раздел доступен только владельцу и MANAGER.'); box.append(b,p); root.append(box); return;
    }
    const header = doc.createElement('header'); header.className = 'uw-domains__header';
    const copy = doc.createElement('div'); const h = doc.createElement('h2'); h.textContent = t(language,'Domenlar','Домены');
    const p = doc.createElement('p'); p.textContent = t(language,'UStorE subdomeni va shaxsiy domenlarni boshqaring. DNS va HTTPS holatlari alohida tekshiriladi.','Управляйте субдоменом UStorE и собственными доменами. DNS и HTTPS проверяются отдельно.'); copy.append(h,p);
    header.append(copy, button(t(language,'Domen qo‘shish','Добавить домен'), () => { state.addOpen = !state.addOpen; render(); }, { primary:true, disabled: state.loading })); root.append(header);
    if (state.addOpen) {
      const form = doc.createElement('div'); form.className = 'uw-domain-add';
      const field = doc.createElement('div'); field.className = 'uw-domain-add__field';
      const label = doc.createElement('label'); label.textContent = t(language,'Shaxsiy domen','Свой домен');
      const input = doc.createElement('input'); input.type='text'; input.autocomplete='off'; input.inputMode='url'; input.placeholder='fitcore.uz'; input.value=state.hostname; input.disabled=state.adding;
      const hint = doc.createElement('small'); hint.className = 'uw-domain-normalization'; hint.setAttribute('aria-live','polite');
      const updateHint = (value) => {
        const normalized = normalizeDomainInput(value);
        hint.dataset.tone = !value ? 'muted' : normalized.valid ? 'success' : 'danger';
        if (!value) hint.textContent = t(language,'Masalan: fitcore.uz yoki www.fitcore.uz','Например: fitcore.uz или www.fitcore.uz');
        else if (!normalized.valid) hint.textContent = t(language,'Hostname noto‘g‘ri. Protokol/yo‘l bo‘lsa u xavfsiz tarzda ajratiladi; port va wildcard qabul qilinmaydi.','Некорректный hostname. Протокол/путь безопасно отделяются; порт и wildcard не принимаются.');
        else if (normalized.changed) hint.textContent = `${t(language,'Normalizatsiya','Нормализация')}: ${normalized.hostname}`;
        else hint.textContent = `${t(language,'Serverga yuboriladi','Будет отправлено на сервер')}: ${normalized.hostname}`;
      };
      updateHint(state.hostname);
      input.addEventListener('input', () => { state.hostname = input.value; updateHint(input.value); }); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      label.append(input); field.append(label,hint);
      const explainer = doc.createElement('p'); explainer.className = 'uw-domain-add__note'; explainer.textContent = t(language,'Apex (masalan fitcore.uz) va WWW (www.fitcore.uz) hostname’lari alohida ulanadi. Faqat aynan kiritilgan hostname qo‘shiladi.','Apex (например fitcore.uz) и WWW (www.fitcore.uz) подключаются отдельно. Добавляется только введённый hostname.');
      field.append(explainer);
      form.append(field, button(state.adding ? t(language,'Qo‘shilmoqda…','Добавление…') : t(language,'Qo‘shish','Добавить'), add, { primary:true, disabled:state.adding })); root.append(form);
    }
    if (state.error) { const e=doc.createElement('div'); e.className='uw-domain-state is-error'; e.setAttribute('role','alert'); e.textContent=state.error.message || state.error.code; root.append(e); }
    if (state.loading) { const l=doc.createElement('div'); l.className='uw-domain-state'; l.textContent=t(language,'Domenlar yuklanmoqda…','Загрузка доменов…'); root.append(l); return; }
    const list=doc.createElement('div'); list.className='uw-domain-list';
    const ordered=[...state.items].sort((a,b)=>(a.kind==='SUBDOMAIN'?-1:1)-(b.kind==='SUBDOMAIN'?-1:1) || Number(b.isPrimary)-Number(a.isPrimary));
    if (!ordered.length) { const empty=doc.createElement('div'); empty.className='uw-domain-state'; empty.textContent=t(language,'Hozircha domen yo‘q.','Доменов пока нет.'); list.append(empty); }
    else ordered.forEach((d)=>list.append(domainCard(d)));
    root.append(list);
    if (state.miniApp) {
      const mini = doc.createElement('section'); mini.className = 'uw-domain-miniapp';
      const mh = doc.createElement('strong'); mh.textContent = t(language,'Telegram Mini App manzili','Адрес Telegram Mini App');
      const mp = doc.createElement('p'); mp.textContent = state.miniApp.hostname ? `${state.miniApp.hostname}` : t(language,'Standart UStorE Mini App','Стандартный Mini App UStorE');
      mini.append(mh, mp);
      if (state.miniApp.url) mini.append(button(t(language,'Manzilni nusxalash','Копировать адрес'), () => copy(state.miniApp.url, 'Mini App URL')));
      if (state.miniApp.domainId && typeof port.setMiniAppTarget === 'function') mini.append(button(t(language,'Standart Mini Appga qaytarish','Вернуть стандартный Mini App'), async () => {
        if (!await confirm(t(language,'Telegram Mini App standart UStorE manziliga qaytarilsinmi?','Вернуть Telegram Mini App на стандартный адрес UStorE?'))) return;
        state.miniAppBusy=true; render(); const result=await port.setMiniAppTarget({domainId:null,confirm:true}); state.miniAppBusy=false;
        if (!result?.ok) { state.error=result?.error; toast(result?.error?.message || t(language,'Qaytarib bo‘lmadi','Не удалось вернуть'),'danger'); render(); return; }
        state.miniApp=result.data; toast(t(language,'Standart Mini App manzili tiklandi','Стандартный адрес Mini App восстановлен'),'success'); render();
      }, { disabled: state.miniAppBusy }));
      root.append(mini);
    }
    const note=doc.createElement('p'); note.className='uw-domain-audit-note'; note.textContent=t(language,'Domen amallari serverda tekshiriladi va audit jurnaliga yoziladi. DNS tasdiqlanishi HTTPS tayyor degani emas.','Операции с доменами проверяются сервером и записываются в аудит. Подтверждение DNS не означает готовность HTTPS.'); root.append(note);
  }
  async function load() {
    if (!canManage(context)) { render(); return; }
    if (destroyed) return;
    const generation = ++loadGeneration;
    state.loading=true; state.error=null; render();
    const [result, miniResult] = await Promise.all([port.list(), typeof port.getMiniAppTarget === 'function' ? port.getMiniAppTarget() : Promise.resolve(null)]);
    if (destroyed || generation !== loadGeneration) return;
    state.loading=false;
    if (!result?.ok) { state.error=result?.error || {code:'NETWORK_ERROR',message:t(language,'Domenlarni yuklab bo‘lmadi','Не удалось загрузить домены')}; state.items=[]; }
    else state.items=Array.isArray(result.data) ? result.data : Array.isArray(result.data?.items) ? result.data.items : [];
    state.miniApp = miniResult?.ok ? miniResult.data : null;
    render();
  }
  render();
  return Object.freeze({ element: root, load, refresh: load, destroy(){destroyed=true;++loadGeneration;}, state, canManage: () => canManage(context) });
}

export function createMiniAppDomainsPort(callApi) {
  if (typeof callApi !== 'function') throw new TypeError('callApi required');
  const wrap = async (action, payload = {}, map = (x) => x) => {
    try { return { ok: true, data: map(await callApi(action, payload)) }; }
    catch (error) { return { ok:false, error:{ code:String(error?.code || 'NETWORK_ERROR'), message:String(error?.message || 'Amal bajarilmadi'), retryable:true } }; }
  };
  return Object.freeze({
    list: () => wrap('domains_list', {}, (x) => x?.items || []),
    add: ({ hostname }) => wrap('domains_add', { hostname }, (x) => x?.domain),
    verify: ({ domainId }) => wrap('domains_verify', { domainId }, (x) => x?.domain),
    setPrimary: ({ domainId }) => wrap('domains_set_primary', { domainId }, (x) => x?.domain),
    remove: ({ domainId }) => wrap('domains_remove', { domainId }),
    getMiniAppTarget: () => wrap('domains_get_mini_app_target', {}, (x) => x?.target),
    setMiniAppTarget: ({ domainId = null, confirm = false } = {}) => wrap('domains_set_mini_app_target', { domainId, confirm }, (x) => x?.target),
  });
}

export function createAdminDomainsPage({ services, context, ...options } = {}, documentRef) {
  if (!services?.domains) throw new TypeError('services.domains required');
  return createDomainsFeature({ port: services.domains, context, ...options }, documentRef);
}
