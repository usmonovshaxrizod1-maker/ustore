// USTORE Platform Mini App — full SaaS onboarding + obuna boshqaruv markazi.
// 6-band: deliberately separate global state/localStorage namespace from
// the shop Mini App (ustore-shop-app.js) — nothing here uses scopedKey()
// or touches `ustore:<botId>:...` keys, and this page never even reads a
// ?bot_id= URL param (it doesn't need one — this app authenticates as the
// PLATFORM bot, not any shop's bot).
//
// Router/nav/mode-toggle PATTERN ported from ustore-shop-app.js
// (renderPageShell/openPage/closePage/switchTab, the 👤 popover role-mode
// toggle) — the behavior is the same, but rebuilt in platform.css's own
// dark visual language (no Tailwind here, ustore.css is deliberately not
// shared — see platform.css's own header comment).
(function () {
  'use strict';

  let tg = window.Telegram?.WebApp || null;
  if (tg) tg.expand();

  if (!window.APP_CONFIG) {
    document.getElementById('app').innerHTML = '<div class="notice error">config.public.js topilmadi.</div>';
    return;
  }
  const CONFIG = window.APP_CONFIG;

  async function callPlatformApi(action, payload, options) {
    const initData = tg?.initData || '';
    const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/platform-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        'apikey': CONFIG.SUPABASE_KEY,
      },
      body: JSON.stringify({ action, payload: payload || {}, initData }),
      signal: options?.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Server xatosi (${res.status})`);
      err.details = data;
      throw err;
    }
    return data;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitForTelegramContext(timeoutMs = 2800) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      tg = window.Telegram?.WebApp || tg || null;
      if (tg?.initData) {
        try { tg.expand(); } catch (_) {}
        return true;
      }
      await sleep(80);
    }
    return !!tg?.initData;
  }
  async function platformBootRequestWithRetry() {
    const delays = [0, 450, 1100];
    let lastError = null;
    for (let i = 0; i < delays.length; i += 1) {
      if (delays[i]) await sleep(delays[i]);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        return await callPlatformApi('platform_boot', {}, { signal: controller.signal });
      } catch (e) {
        lastError = e;
        const message = String(e?.message || e || '');
        const nonRetryable = message.startsWith('forbidden:') || message.startsWith('auth_failed:');
        if (nonRetryable || i === delays.length - 1) throw e;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError || new Error('platform_boot_failed');
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // 2-band: zamonaviy chiziqli ikonalar (emoji o'rniga) — ustore-shop-app.js'dagi
  // fcIcon() naqshi, lekin platform.css'ning o'z palitrasida (stroke=currentColor).
  const PICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    shop: '<path d="M4 9l1-5h14l1 5"/><path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/><path d="M5.5 9.4V20a1 1 0 0 0 1 1H9v-6h6v6h2.5a1 1 0 0 0 1-1V9.4"/>',
    diamond: '<path d="M6 3h12l3.5 5.5L12 21 2.5 8.5 6 3z"/><path d="M2.5 8.5h19M9 3l-2.5 5.5L12 21M15 3l2.5 5.5L12 21"/>',
    chat: '<path d="M4 4h16v12H8l-4 4V4z"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-3.8 4-6 7.5-6s6.7 2.2 7.5 6"/>',
    dashboard: '<rect x="3.5" y="3.5" width="7" height="8" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.2"/><rect x="13.5" y="12" width="7" height="8.5" rx="1.2"/><rect x="3.5" y="15" width="7" height="5.5" rx="1.2"/>',
    inbox: '<path d="M21 12h-5.5l-1.7 2.6h-3.6L8.5 12H3"/><path d="M5.3 5.3 3 12v6a1.6 1.6 0 0 0 1.6 1.6h14.8A1.6 1.6 0 0 0 21 18v-6l-2.3-6.7A1.6 1.6 0 0 0 17.2 4H6.8a1.6 1.6 0 0 0-1.5 1.3z"/>',
    back: '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
    rocket: '<path d="M12 3c3 1.2 5 4 5 8 0 3-1.6 5.6-3 7l-2 2-2-2c-1.4-1.4-3-4-3-7 0-4 2-6.8 5-8z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16.5c-1.6.3-2.5 1.6-2.9 4.5 2.9-.4 4.2-1.3 4.5-2.9M15 16.5c1.6.3 2.5 1.6 2.9 4.5-2.9-.4-4.2-1.3-4.5-2.9"/>',
    play: '<path d="M7 4.5v15l13-7.5-13-7.5z"/>',
    gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M12 8.5V21M18.5 12.5V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-7.5"/><path d="M12 8.5c-1.3-3-3.2-4.3-4.8-3.2C5.6 6.3 6.4 8.5 12 8.5zM12 8.5c1.3-3 3.2-4.3 4.8-3.2 1.6 1 .8 3.2-4.8 3.2z"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>',
    bolt: '<path d="M13 2.5 5 14h6l-1 7.5 8-11.5h-6l1-7.5z"/>',
    cloud: '<path d="M7 18a4.2 4.2 0 0 1-1-8.3 5.3 5.3 0 0 1 10.2-2 4.6 4.6 0 0 1 .8 9.1"/><path d="M7 18h10"/>',
    bag: '<path d="M6 8h12l1 12.5a1 1 0 0 1-1 1.5H6a1 1 0 0 1-1-1.5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    box: '<path d="M12 3 3 7.5 12 12l9-4.5L12 3z"/><path d="M3 7.5v9L12 21l9-4.5v-9"/><path d="M12 12v9"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0v5l1.8 3H4.2L6 14V9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10.2h19"/>',
    book: '<path d="M4 4.5c2-1 5-1 8 0v15c-3-1-6-1-8 0z"/><path d="M20 4.5c-2-1-5-1-8 0v15c3-1 6-1 8 0z"/>',
    truck: '<path d="M3 7h10v9H3z"/><path d="M13 10.5h4l3.5 3.2V16h-7.5z"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.8 1.8 0 0 0 .36 2l.05.05a2.2 2.2 0 1 1-3.1 3.1l-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.65V20a2.2 2.2 0 0 1-4.4 0v-.1a1.8 1.8 0 0 0-1.18-1.65 1.8 1.8 0 0 0-2 .36l-.05.05a2.2 2.2 0 1 1-3.1-3.1l.05-.05a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.65-1.1H4a2.2 2.2 0 0 1 0-4.4h.1a1.8 1.8 0 0 0 1.65-1.18 1.8 1.8 0 0 0-.36-2l-.05-.05a2.2 2.2 0 1 1 3.1-3.1l.05.05a1.8 1.8 0 0 0 2 .36H10.5a1.8 1.8 0 0 0 1.1-1.65V4a2.2 2.2 0 0 1 4.4 0v.1a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 2-.36l.05-.05a2.2 2.2 0 1 1 3.1 3.1l-.05.05a1.8 1.8 0 0 0-.36 2v.09a1.8 1.8 0 0 0 1.65 1.1H20a2.2 2.2 0 0 1 0 4.4h-.1a1.8 1.8 0 0 0-1.65 1.1z"/>',
    headset: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19v.5a3 3 0 0 1-3 3h-3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v4M16 3v4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/>',
    chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20V7"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 14v5a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-5"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
    swap: '<path d="M7 7h12l-3-3"/><path d="m19 7-3 3"/><path d="M17 17H5l3 3"/><path d="m5 17 3-3"/>',
    send: '<path d="m3 11 18-8-8 18-2-7-8-3z"/><path d="m11 14 4-4"/>',
    wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m14 7 5 5-5 5"/>',
  };
  function pIcon(name, size) {
    const s = size || 18;
    return `<svg class="p-icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PICONS[name] || ''}</svg>`;
  }
  function paymentProviderName(type) {
    const key = String(type || '').toUpperCase();
    if (key === 'CLICK') return 'Click';
    if (key === 'PAYME') return 'Payme';
    if (key === 'PAYNET') return 'Paynet';
    if (key === 'CARD') return 'Karta';
    return key || "To'lov";
  }
  function paymentProviderBadge(type, compact) {
    const key = String(type || '').toUpperCase();
    if (key === 'CARD') return `<span class="plat-provider-badge is-card ${compact ? 'is-compact' : ''}">${pIcon('card', compact ? 14 : 17)}</span>`;
    const mark = key === 'CLICK' ? '<b>CLICK</b>' : key === 'PAYME' ? '<b>payme</b>' : key === 'PAYNET' ? '<b>PAYNET</b>' : `<b>${escapeHtml(key || "PAY")}</b>`;
    return `<span class="plat-provider-badge is-${key.toLowerCase()} ${compact ? 'is-compact' : ''}" aria-hidden="true">${mark}</span>`;
  }
  function paymentMethodVisual(method, compact) {
    if (method?.logoUrl) {
      return `<span class="plat-provider-logo ${compact ? 'is-compact' : ''}"><img src="${escapeHtml(method.logoUrl)}" alt="${escapeHtml(method.displayName || paymentProviderName(method.methodType))}"></span>`;
    }
    return paymentProviderBadge(method?.methodType, compact);
  }

  function money(v) { return `${Number(v || 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`; }
  function statusLabel(s) {
    if (s === 'ACTIVE') return '🟢 Faol';
    if (s === 'PROVISIONING') return 'Sozlanmoqda';
    if (s === 'FROZEN') return '❄️ Muzlatilgan';
    if (s === 'TERMINATED') return "🔴 O'chirilgan";
    return "O'chirilgan";
  }
  function limitLabel(limit) { return (limit === null || limit === undefined) ? 'Cheksiz mahsulot' : `${limit} tagacha mahsulot`; }
  // 2026-08-28: REAL BUG topildi va tuzatildi — bu funksiya ikkita joyda
  // (mySupportTickets ro'yxati va admin support tred sarlavhasi) chaqirilardi,
  // lekin HECH QACHON e'lon qilinmagan edi (ReferenceError, render() try/catch
  // ichida jim yutilib, o'sha bo'lim butunlay ishlamay qolardi).
  function supportStatusLabel(status) {
    if (status === 'ANSWERED') return 'Javob berildi';
    if (status === 'CLOSED') return 'Yopilgan';
    return 'Ochiq';
  }
  // 2026-08-27, USER platform redesign 4.2/4.3/22-band: yillik obuna —
  // 12 oy o'rniga 10 oylik pul (real oylik narxdan hisoblanadi, hardcode
  // qilinmaydi — tariflar backend/config'dan qanday kelsa shundan).
  function annualOfferPrice(monthly) { return Math.round((Number(monthly) || 0) * 10); }
  function annualOriginalPrice(monthly) { return Math.round((Number(monthly) || 0) * 12); }
  function daysUntil(iso) {
    if (!iso) return null;
    return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
  }
  function formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  // ---- STATE -----------------------------------------------------------
  let loading = true;
  let bootInFlight = false;
  let accessDenied = false;
  let bootError = null;
  let isSuperAdmin = false;
  let isAdminMode = false;
  let myShops = [];
  let tariffs = [];
  // 2026-08-27, USER platform redesign: Oylik/Yillik — 4.2-band shared
  // component (Bosh sahifa/Tariflar/Obuna uchtasida bir xil holat), va
  // Dashboard'da bir nechta do'kon bo'lsa qaysi biri ko'rsatilayotgani.
  let tariffBillingPeriod = 'monthly'; // 'monthly' | 'annual'
  let dashboardShopId = null;
  let currentTab = 'home'; // user: home|shops|subscription|help|profile ; admin: dashboard|shops|requests|tariffs|profile
  let activePage = null;
  // ROOT-CAUSE FIX (2026-08-31, scroll-jump follow-up): `.plat-page` has a
  // slide-in CSS animation meant for GENUINE navigation (opening a page).
  // But renderNow() always fully replaces #app's innerHTML — including
  // .plat-page itself — on EVERY render(), so a same-page data refresh
  // (e.g. loadAdminSettings() finishing right after openPage() already
  // opened the page) recreates a brand-new .plat-page node too, replaying
  // the slide-in animation from scratch. Before the .plat-page-body scroll
  // fix this read as "jumps to top"; now that scroll stays put it instead
  // reads as a visible flash/"reload". Genuine navigation calls
  // (openPage/closePage/goHomePage) already pass {preserve:false} — reusing
  // that exact signal lets pageShell() suppress the animation on every
  // OTHER render (a same-page refresh), without touching call sites.
  let suppressPageOpenAnimation = false;

  // 5-band: Foydalanish shartlari/Maxfiylik siyosati versiyalari — backend
  // (platform-api/index.ts)dagi TERMS_VERSION/PRIVACY_VERSION bilan QO'LDA
  // sinxronlanadi (ikkita alohida deploy birligi, umumiy modul yo'q).
  const TERMS_VERSION = '1.0';
  const PRIVACY_VERSION = '1.0';

  // Obuna sotib olish oqimi (mijoz tarafi)
  let flowKind = null;        // 'NEW_SHOP' | 'UPGRADE'
  let flowTariffId = null;
  let flowShopId = null;      // UPGRADE uchun
  let flowUpgradeAction = null; // 'EXTEND' | 'CHANGE' | null
  let flowReturnPage = null; // 'SUBSCRIPTION_TARGET' | 'MY_SHOP_DETAILS' | 'TARIFFS' | null
  let flowEntry = null; // 'NEW_SHOP' | 'SUBSCRIPTION_CATALOG' | 'SHOP_DETAIL' | null
  let flowOriginTab = null; // yangi do'kon flowidan ortga qaytish uchun
  let paymentInfo = null;     // { cardNumber, cardHolder, isActive }
  let platformPaymentMethods = []; // [{ id, methodType, displayName, paymentUrl }] — Click/Payme/Paynet havolalari
  let selectedPaymentMethodType = null; // 'CARD' | 'CLICK' | 'PAYME' | 'PAYNET'
  let selectedPaymentMethodId = null;
  let externalPaymentOpened = false;
  // 2026-08-28: to'lovdan oldin majburiy ogohlantirish (spec) — Click/Payme/
  // Paynet havolasi TASHQARIGA ochilishidan oldin, checkbox belgilanmaguncha
  // "To'lovga o'tish" tugmasi yoqilmaydi. Bitta vaqtda faqat bitta usul
  // uchun ochiq bo'ladi (methodId), checkbox har safar yangidan boshlanadi.
  let pendingExternalPaymentMethodId = null;
  let externalPaymentWarningChecked = false;
  let receiptFile = null;
  let receiptPreviewUrl = null;
  let consentAccepted = false; // Shartlar/Maxfiylikka rozilik checkbox — default FALSE, foydalanuvchi o'zi belgilashi shart
  let submittingRequest = false;
  let lastSubmittedRequestId = null;
  // 2026-08-28: chek ixtiyoriy bo'lgach — REQUEST_SENT sahifasida "To'ladim"
  // tugmasi ko'rsatish/holatini kuzatish uchun.
  let lastSubmittedHadReceipt = false;
  let paymentClaimConfirmed = false;
  let paymentClaimSubmitting = false;
  // Chekni keyinroq (submit paytida biriktirmagan bo'lsa) REQUEST_SENT
  // sahifasidan biriktirish uchun — alohida, kichik holat to'plami.
  let requestSentReceiptFile = null;
  let requestSentReceiptPreviewUrl = null;
  let attachingRequestReceipt = false;

  // Ariza + payment verification + shop provisioning (USER)
  let myRequests = [];
  let myRequestsLoading = false;
  let selectedMyRequestId = null;
  let requestHistoryById = Object.create(null);
  let requestHistoryLoadingId = null;
  let myRequestReceiptFile = null;
  let myRequestReceiptPreviewUrl = null;
  let attachingMyRequestReceipt = false;
  let newShopName = '';
  let newShopOwnerTelegramId = '';
  // 3-topshiriq: NEW_SHOP to'lov oynasi ochilishi bilan 1 soatlik
  // resumable draft yaratiladi. Telegram WebView yopilib qolsa Arizalarimdan
  // aynan shu arizani davom ettirish mumkin.
  let preparedNewShopRequestId = null;
  let preparedNewShopPaymentDeadlineAt = null;
  let preparingNewShopDraft = false;
  let newShopDraftSyncTimer = null;

  // 6-topshiriq: freeze/delete sababi va userga ko'rsatiladigan global matn.
  let platformLifecycleSettings = {
    autoFreezeOnExpiry: true,
    retentionDays: 30,
    supportLabel: "Admin bilan bog'lanish",
    supportUrl: null,
    freezeUserTitle: "Do'koningiz vaqtincha muzlatildi",
    freezeUserBody: "Sabab: {REASON}\nQayta faollashtirish uchun: {ACTION}",
    freezeActionText: "Muammoni bartaraf eting yoki UStorE administratori bilan bog'laning.",
    terminateUserTitle: "Do'koningiz o'chirildi",
    terminateUserBody: "Sabab: {REASON}\nQo'shimcha ma'lumot uchun administrator bilan bog'laning.",
    freezeReasons: ["Obuna muddati tugadi", "To'lov bo'yicha muammo", "Qoidabuzarlik", "Texnik tekshiruv"],
    terminateReasons: ["Foydalanuvchi so'rovi", "Uzoq muddat faol emas", "Qoidabuzarlik", "Boshqa"],
  };

  // Admin: tasdiqlangan NEW_SHOP arizasidan provisioning
  let provisioningRequestId = null;
  let provisioningSubmitting = false;
  let provisioningError = null;
  let provisioningSuccess = null;

  // Admin: do'konlar ro'yxati + bot ulash (mavjud funksiya, shu yerga ko'chirildi)
  let adminShops = [];
  // 2026-08-28: Do'konlar tabiga qidiruv/status-filtr — dashboard "Faol
  // do'konlar" KPI kartasi shu tabga olib keladi, ro'yxat kattalashgani
  // sayin topish qiyinlashmasin uchun. Hammasi CLIENT tomonda (allaqachon
  // to'liq yuklangan adminShops ustida) — yangi backend so'rov shart emas.
  let adminShopsSearchQuery = '';
  let adminShopsStatusFilter = 'ALL';
  let adminShopsTariffFilter = 'ALL';
  let adminShopsDaysFilter = 'ALL';
  let adminShopsSort = 'NEWEST';
  let adminShopsFiltersOpen = false;
  let verifyResult = null;
  let verifying = false;
  let connecting = false;
  let connectError = null;
  let connectSuccess = null;
  let pendingBotToken = '';
  let selectedShopDetails = null; // adminShops ichidan tanlangan bitta qator

  // Admin: so'rovlar
  let requestsFilter = 'NEW';
  // 2026-08-28: 'NEW' bosqichi ichida yana derived sub-holat bo'yicha
  // filtrlash (Kutilmoqda/Chek so'raldi/Tekshirilmoqda) — client-side,
  // chunki bular saqlangan status emas (requestDisplayStatus()'dan chiqadi).
  let requestsSubFilter = 'ALL';
  let requestsSearchQuery = '';
  let requests = [];
  let requestsLoading = false;
  let rejectingRequestId = null;
  let selectedRequestId = null;

  // Admin: tariflar CRUD
  let adminTariffs = [];
  let tariffDraft = null; // {id?, name, price, productLimit, isActive, isPopular} yoki null

  // Admin: dashboard
  let dashboardSummary = null;
  // 2026-08-28: Dashboard analitika bo'limi (davr tanlovchi + jami/yangi/
  // uzaytirish/daromad/tarif-taqsimoti/savdo dinamikasi).
  let analyticsPeriod = '30d';
  let analyticsData = null;
  let analyticsLoading = false;

  // Admin: Shop Details — obuna hayot sikli (15/18/19-bandlar)
  let grantDaysPreset = null;         // 1|3|7|14|'other'|null
  let grantDaysReasonPreset = null;   // 'Texnik nosozlik'|'Kompensatsiya'|'Aksiya'|'other'|null
  let grantDaysSubmitting = false;
  let terminateStep = null;           // null | 'reason' | 'confirm'
  let terminateReasonDraft = '';
  let lifecycleActionSubmitting = false;

  // Admin: to'lov ma'lumoti tahrirlash (Tariflar bo'limi ichida kichik bo'lim)
  let paymentInfoDraft = null;
  // 2026-08-28: Click/Payme/Paynet havola-usullari CRUD (052-migratsiya) —
  // Karta bilan bir xil "Tariflar" bo'limi ichida, alohida kichik bo'lim.
  let adminPaymentMethods = [];
  let paymentMethodDraft = null; // {id?, methodType, displayName, paymentUrl, logoUrl, isActive} yoki null
  let paymentMethodLogoFile = null;
  let paymentMethodLogoPreviewUrl = null;
  let paymentMethodLogoRemove = false;
  // 2026-08-28: Telegram bildirishnoma shablonlari (053-migratsiya) — Tariflar
  // bo'limi ichida, xuddi Karta/havolalar bilan bir xil kichik bo'lim.
  let adminNotificationTemplates = [];
  let notificationTemplateDraft = null; // {type, body, imageUrl, uploadedImageUrl, isActive} yoki null
  let notificationTemplateImageFile = null;
  let notificationTemplateImagePreviewUrl = null;
  let notificationTemplateImageRemove = false;
  let lifecycleSettingsDraft = null;

  // 4.4/4.5-band: Yordam bo'limi — Support / Muammo haqida xabar (foydalanuvchi tomoni)
  let mySupportTickets = [];
  let mySupportTicketsLoading = false;
  let activeSupportTicketId = null;
  let activeSupportMessages = [];
  let activeSupportLoading = false;
  let sendingSupportMessage = false;
  let bugReportAttachmentFile = null;
  let bugReportAttachmentPreviewUrl = null;
  let submittingBugReport = false;
  let bugReportSent = false;

  // 4.4-band: Yordam bo'limi — Support (admin tomoni)
  let adminSupportTickets = [];
  let adminSupportTicketsLoading = false;
  let adminSupportFilter = 'OPEN'; // 'OPEN' | 'ANSWERED' | 'CLOSED' | null (hammasi)
  let adminSupportTypeFilter = null; // 'SUPPORT' | 'BUG_REPORT' | null (hammasi)

  // ---- PAGE SHELL / ROUTER (ustore-shop-app.js'dagi naqsh) --------------
  function openPage(pageId) { activePage = pageId; render({ preserve: false, scrollTop: true }); }
  function closePage() { activePage = null; render({ preserve: false, scrollTop: true }); }
  function goHomePage() {
    activePage = null;
    currentTab = isAdminMode ? 'dashboard' : 'home';
    render({ preserve: false, scrollTop: true });
    onTabEnter(currentTab);
  }
  function switchTab(tab) {
    activePage = null;
    if (!isAdminMode && tab === 'subscription') resetSubscriptionFlow();
    currentTab = tab;
    render({ preserve: false, scrollTop: true });
    onTabEnter(tab);
  }
  function onTabEnter(tab) {
    if (tab === 'shops' && isAdminMode) reloadAdminShops();
    if (tab === 'requests') loadRequests();
    if (tab === 'tariffs' && isAdminMode) loadAdminTariffs();
    if (tab === 'profile' && isAdminMode) loadAdminSettings();
    if (tab === 'dashboard') { loadDashboardSummary(); loadAnalytics(); }
  }

  function pageShell(title, bodyHtml, opts) {
    const backAction = (opts && opts.onBack) || 'closePage()';
    return `
      <div class="plat-page ${suppressPageOpenAnimation ? 'no-anim' : ''}">
        <div class="plat-page-header">
          <button class="plat-page-header-btn" onclick="${backAction}" aria-label="Orqaga">${pIcon('back', 17)}</button>
          <div class="plat-page-header-title">${escapeHtml(title)}</div>
          <button class="plat-page-header-btn" onclick="goHomePage()" aria-label="Bosh sahifa">${pIcon('home', 17)}</button>
        </div>
        <div class="plat-page-body">${bodyHtml}</div>
      </div>`;
  }

  // ---- ROLE-MODE POPOVER (ustore-shop-app.js togglePersonMenu naqshi) ---
  function togglePersonMenu(event) {
    const popover = document.getElementById('plat-role-popover');
    if (!popover) return;
    if (!popover.classList.contains('hidden')) { popover.classList.add('hidden'); return; }
    if (!isSuperAdmin) return; // oddiy foydalanuvchida bu tugma umuman ko'rinmaydi
    const btn = event.currentTarget;
    const rect = btn.getBoundingClientRect();
    popover.style.top = `${rect.bottom + 6}px`;
    popover.style.right = `${window.innerWidth - rect.right}px`;
    const label = isAdminMode ? `${pIcon('user', 15)} Foydalanuvchi rejimiga o'tish` : `${pIcon('lock', 15)} Admin rejimiga o'tish`;
    popover.innerHTML = `<button class="plat-role-popover-btn" onclick="document.getElementById('plat-role-popover').classList.add('hidden'); toggleAdminRole();">${label}</button>`;
    popover.classList.remove('hidden');
  }
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('plat-role-popover');
    if (popover && !popover.classList.contains('hidden') && !e.target.closest('#plat-role-popover') && !e.target.closest('#plat-person-btn')) {
      popover.classList.add('hidden');
    }
    const shopMenu = document.getElementById('plat-dashboard-shop-menu');
    if (shopMenu && !shopMenu.classList.contains('hidden') && !e.target.closest('#plat-dashboard-shop-menu') && !e.target.closest('.plat-shop-switch-btn')) {
      shopMenu.classList.add('hidden');
    }
  });
  function toggleAdminRole() {
    if (!isSuperAdmin) return;
    isAdminMode = !isAdminMode;
    activePage = null;
    currentTab = isAdminMode ? 'dashboard' : 'home';
    render({ preserve: false, scrollTop: true });
    onTabEnter(currentTab);
  }

  // ---- BOOT --------------------------------------------------------------
  async function boot() {
    if (bootInFlight) return;
    bootInFlight = true;
    loading = true;
    accessDenied = false;
    bootError = null;
    render();
    try {
      const telegramReady = await waitForTelegramContext();
      if (!telegramReady) {
        bootError = 'Telegram sessiyasi tayyor bo‘lmadi. Mini App’ni bot ichidan qayta oching.';
        return;
      }
      const data = await platformBootRequestWithRetry();
      isSuperAdmin = data.isSuperAdmin === true;
      myShops = Array.isArray(data.myShops) ? data.myShops : [];
      myRequests = Array.isArray(data.myRequests) ? data.myRequests : [];
      tariffs = Array.isArray(data.tariffs) ? data.tariffs : [];
      if (data.lifecycleSettings && typeof data.lifecycleSettings === 'object') platformLifecycleSettings = { ...platformLifecycleSettings, ...data.lifecycleSettings };
      if (dashboardShopId && !myShops.some((shop) => shop.id === dashboardShopId)) dashboardShopId = null;
      currentTab = isAdminMode ? 'dashboard' : 'home';
    } catch (e) {
      const message = String(e?.message || e || '');
      if (message.startsWith('forbidden:') || message.startsWith('auth_failed:')) {
        accessDenied = true;
      } else if (e?.name === 'AbortError') {
        bootError = 'Server javobi kechikdi. Internetni tekshirib, qayta urinib ko‘ring.';
      } else {
        bootError = 'Ma’lumotlarni yuklab bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.';
        console.error('platform boot error', e);
      }
    } finally {
      loading = false;
      bootInFlight = false;
      render();
      if (!accessDenied && !bootError && !isAdminMode && myShops.length) loadMySupportTickets();
    }
  }
  function retryBoot() { boot(); }


  // ---- RENDER ROOT ---------------------------------------------------------
  function renderNow() {
    const app = document.getElementById('app');
    // USER visual refinements are scoped on <body>; admin styling stays untouched.
    document.body.classList.toggle('plat-user-mode', !isAdminMode);
    document.body.classList.toggle('plat-admin-mode', isAdminMode);
    if (accessDenied) {
      app.innerHTML = `<div class="wrap"><header class="top"><h1>UStorE</h1></header><div class="card"><p class="notice error">⛔ Xatolik yuz berdi. Iltimos, botni qayta oching.</p></div></div>`;
      return;
    }
    if (loading) {
      app.innerHTML = `<div class="plat-boot-state"><div class="plat-boot-brand">UStorE</div><span class="plat-boot-spinner"></span><b>UStorE yuklanmoqda...</b><small>Do‘konlaringiz va obuna ma’lumotlari tayyorlanmoqda.</small></div>`;
      return;
    }
    if (bootError) {
      app.innerHTML = `<div class="plat-boot-state is-error"><div class="plat-boot-brand">UStorE</div><span class="plat-boot-error-icon">${pIcon('info', 24)}</span><b>Ma’lumotlarni yuklab bo‘lmadi</b><small>${escapeHtml(bootError)}</small><button class="primary plat-boot-retry" onclick="retryBoot()">Qayta urinish</button></div>`;
      return;
    }

    if (activePage) {
      try {
        app.innerHTML = `${renderChrome('')}<div id="plat-page-container">${renderActivePage()}</div>`;
        if (activePage === 'CONNECT_SHOP') wireConnectShopView();
      } catch (e) {
        console.error('platform active-page render error', { activePage, error: e });
        app.innerHTML = `${renderChrome(`<div class="plat-render-error"><span>${pIcon('info',24)}</span><h2>Sahifani ochib bo‘lmadi</h2><p>Qayta urinib ko‘ring yoki bosh sahifaga qayting.</p><button class="primary" onclick="retryCurrentView()">Qayta urinish</button><button class="secondary" onclick="goHomePage()">Bosh sahifa</button></div>`)}`;
      }
      return;
    }

    // 2026-08-27, USER platform redesign 3-band: Bosh sahifa endi ikki xil
    // holat — do'koni yo'q userga hamon marketing landing (3A), do'koni BOR
    // userga esa amaliy dashboard (5-band, renderShopDashboard). Avvalgi
    // "6-band root-cause fix" (har doim landing) shu spec bilan ATAYLAB
    // bekor qilinmoqda — MD buni aniq talab qiladi (skrinshot 02).
    const showLanding = !isAdminMode && currentTab === 'home' && !myShops.length;
    const showDashboard = !isAdminMode && currentTab === 'home' && myShops.length > 0;
    try {
      const baseBody = showLanding ? renderLandingHero() : showDashboard ? renderShopDashboard() : renderTabBody();
      const body = !isAdminMode && currentTab === 'home' ? `${renderUserLifecycleAttention()}${renderUserRequestsHomeTop()}${baseBody}` : baseBody;
      app.innerHTML = `${renderChrome(body)}`;
    } catch (e) {
      console.error('platform render error', { currentTab, activePage, error: e });
      app.innerHTML = `${renderChrome(`<div class="plat-render-error"><span>${pIcon('info',24)}</span><h2>Sahifani ochib bo‘lmadi</h2><p>Ma’lumotlar saqlanib turibdi. Qayta urinib ko‘ring.</p><button class="primary" onclick="retryCurrentView()">Qayta urinish</button></div>`)}`;
    }
  }

  // 1-topshiriq: platform-wide render stability. Most UI actions used to
  // replace #app completely and the browser therefore reset page scroll/focus.
  // Keep state for same-view rerenders; real navigation opts out explicitly.
  function capturePlatformUiState() {
    const active = document.activeElement;
    let focus = null;
    if (active && active !== document.body && active !== document.documentElement) {
      focus = {
        id: active.id || null,
        tag: active.tagName || null,
        type: active.getAttribute?.('type') || null,
        placeholder: active.getAttribute?.('placeholder') || null,
        className: typeof active.className === 'string' ? active.className : '',
        value: ('value' in active) ? String(active.value ?? '') : null,
        selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
        selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
      };
    }
    // .plat-page-body: ROOT-CAUSE FIX — istalgan activePage (Payment/
    // Requests/Shop Details/Tariflar/Sozlamalar va h.k., ya'ni deyarli
    // butun ilova) `.plat-page { position: fixed; ... }` ichida
    // `.plat-page-body { overflow-y: auto }`ning O'ZI orqali scroll qiladi
    // — window HECH QACHON scroll qilmaydi shu paytda. Oldingi versiya
    // faqat window.scrollX/Y'ni saqlardi, bu esa page ochiq bo'lganda
    // doim 0 edi — shuning uchun har bir render() (istalgan tugma bosilishi,
    // fon-poll) shu haqiqiy scroll konteynerini yangi DOM tuguniga
    // almashtirib, uni har doim 0'ga qaytarardi ("sahifa tepasiga sakrash"
    // bug'i, v32 deploy qilingandan keyin ham davom etgan).
    const scrollables = Array.from(document.querySelectorAll('.plat-page-body,.plat-carousel,.plat-admin-request-subfilters,.plat-filter-row,.plat-payment-method-grid'))
      .map((el, index) => ({ index, left: el.scrollLeft, top: el.scrollTop }));
    return { x: window.scrollX || 0, y: window.scrollY || 0, focus, scrollables };
  }
  function findRenderFocusTarget(focus) {
    if (!focus) return null;
    if (focus.id) {
      const byId = document.getElementById(focus.id);
      if (byId) return byId;
    }
    if (!focus.tag) return null;
    const candidates = Array.from(document.querySelectorAll(String(focus.tag).toLowerCase()));
    return candidates.find((el) => {
      if (focus.type && el.getAttribute('type') !== focus.type) return false;
      if (focus.placeholder && el.getAttribute('placeholder') !== focus.placeholder) return false;
      if (focus.className && typeof el.className === 'string' && el.className !== focus.className) return false;
      return focus.value === null || !('value' in el) || String(el.value ?? '') === focus.value;
    }) || null;
  }
  function restorePlatformUiState(snapshot) {
    if (!snapshot) return;
    const apply = () => {
      const scrollables = Array.from(document.querySelectorAll('.plat-page-body,.plat-carousel,.plat-admin-request-subfilters,.plat-filter-row,.plat-payment-method-grid'));
      (snapshot.scrollables || []).forEach((st) => {
        const el = scrollables[st.index];
        if (el) { el.scrollLeft = st.left; el.scrollTop = st.top; }
      });
      const target = findRenderFocusTarget(snapshot.focus);
      if (target?.focus) {
        try { target.focus({ preventScroll: true }); } catch (_) { try { target.focus(); } catch (_) {} }
        if (snapshot.focus.selectionStart !== null && typeof target.setSelectionRange === 'function') {
          try { target.setSelectionRange(snapshot.focus.selectionStart, snapshot.focus.selectionEnd); } catch (_) {}
        }
      }
      window.scrollTo(snapshot.x, snapshot.y);
    };
    requestAnimationFrame(() => { apply(); requestAnimationFrame(apply); });
    setTimeout(apply, 60);
  }
  function render(options) {
    const opts = options || {};
    const preserve = opts.preserve !== false && !loading;
    const snapshot = preserve ? capturePlatformUiState() : null;
    // preserve===true means this is NOT an explicit navigation (openPage/
    // closePage/goHomePage already pass preserve:false) — it's some other
    // render (data finished loading, a poll, a click) on the SAME page, so
    // the slide-in animation must not replay.
    suppressPageOpenAnimation = preserve;
    renderNow();
    try { initTariffCarousels(); } catch (_) {}
    if (snapshot) restorePlatformUiState(snapshot);
    else if (opts.scrollTop) requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function retryCurrentView() {
    if (bootError) { retryBoot(); return; }
    render();
    onTabEnter(currentTab);
  }

  function renderChrome(bodyHtml) {
    return `
      <div class="plat-header">
        <div class="plat-header-title">${isAdminMode ? 'UStorE Admin' : 'UStorE'}</div>
        <div class="plat-header-actions">
          ${!isAdminMode ? `<button class="plat-header-btn plat-header-request-btn" onclick="openMyRequests()" aria-label="Arizalarim">${pIcon('inbox',17)}${myRequests.filter((r)=>r.status==='NEW').length ? `<em>${Math.min(9,myRequests.filter((r)=>r.status==='NEW').length)}${myRequests.filter((r)=>r.status==='NEW').length>9?'+':''}</em>` : ''}</button>` : ''}
          <button id="plat-person-btn" class="plat-header-btn" onclick="togglePersonMenu(event)" aria-label="Profil">${pIcon('user', 17)}</button>
        </div>
      </div>
      <div id="plat-role-popover" class="hidden plat-role-popover"></div>
      <div class="plat-content">${bodyHtml}</div>
      ${activePage ? '' : renderBottomNav()}
    `;
  }

  function renderBottomNav() {
    const userTabs = [
      ['home', 'home', 'Bosh sahifa'], ['shops', 'shop', "Do'konlarim"], ['subscription', 'diamond', 'Obuna'],
      ['help', 'chat', 'Yordam'], ['profile', 'user', 'Profil'],
    ];
    const adminTabs = [
      ['dashboard', 'dashboard', 'Dashboard'], ['shops', 'shop', "Do'konlar"], ['requests', 'inbox', "So'rovlar"],
      ['tariffs', 'diamond', 'Tariflar'], ['profile', 'user', 'Profil'],
    ];
    const tabs = isAdminMode ? adminTabs : userTabs;
    return `
      <nav class="plat-bottom-nav">
        ${tabs.map(([id, icon, label]) => `
          <button class="plat-nav-btn ${currentTab === id ? 'active' : ''}" onclick="switchTab('${id}')">
            <span class="plat-nav-icon">${pIcon(icon, 20)}</span>
            <span class="plat-nav-label">${label}</span>
          </button>
        `).join('')}
      </nav>`;
  }

  function renderTabBody() {
    if (isAdminMode) {
      if (currentTab === 'dashboard') return renderAdminDashboardTab();
      if (currentTab === 'shops') return renderAdminShopsTab();
      if (currentTab === 'requests') return renderAdminRequestsTab();
      if (currentTab === 'tariffs') return renderAdminTariffsTab();
      if (currentTab === 'profile') return renderProfileTab();
      return '';
    }
    if (currentTab === 'shops') return renderMyShopsTab();
    if (currentTab === 'subscription') return renderSubscriptionTab();
    if (currentTab === 'help') return renderHelpTab();
    if (currentTab === 'profile') return renderProfileTab();
    return '';
  }

  function renderActivePage() {
    const p = activePage;
    if (p === 'TARIFFS') return pageShell('Tarifni tanlang', renderTariffListBody(), { onBack: tariffsBackAction() });
    if (p === 'SUBSCRIPTION_TARGET') return pageShell('Obunani rasmiylashtirish', renderSubscriptionTargetBody(), { onBack: "openPage('TARIFFS')" });
    if (p === 'PAYMENT') return pageShell(paymentPageTitle(), renderPaymentBody(), { onBack: paymentBackAction() });
    if (p === 'REQUEST_SENT') return pageShell("So'rov yuborildi", renderRequestSentBody(), { onBack: 'goHomePage()' });
    if (p === 'CONNECT_SHOP') return pageShell("Yangi do'kon ulash", renderConnectShopBody(), { onBack: "closePage()" });
    if (p === 'MY_SHOP_DETAILS') return pageShell("Do'kon tafsilotlari", renderMyShopDetailsBody(), { onBack: "switchTab('shops')" });
    if (p === 'SHOP_DETAILS') return pageShell("Do'kon tafsilotlari", renderShopDetailsBody(), { onBack: "switchTab('shops')" });
    if (p === 'REQUEST_DETAILS') return pageShell("So'rov tafsilotlari", renderRequestDetailsBody(), { onBack: "switchTab('requests')" });
    if (p === 'MY_REQUESTS') return pageShell("Arizalarim", renderMyRequestsBody(), { onBack: "goHomePage()" });
    if (p === 'MY_REQUEST_DETAILS') return pageShell("Ariza holati", renderMyRequestDetailsBody(), { onBack: "openMyRequests()" });
    if (p === 'REQUEST_PROVISION') return pageShell("Do'kon qo'shish", renderRequestProvisioningBody(), { onBack: `openRequestDetails('${provisioningRequestId || selectedRequestId || ''}')` });
    if (p === 'ADMIN_PAYMENT_SETTINGS') return pageShell("To'lov sozlamalari", renderAdminPaymentSettingsBody(), { onBack: "switchTab('profile')" });
    if (p === 'ADMIN_NOTIFICATION_SETTINGS') return pageShell("Avtomatik xabarlar", renderAdminNotificationSettingsBody(), { onBack: "switchTab('profile')" });
    if (p === 'ADMIN_NOTIFICATION_GROUP') return pageShell(notificationGroupTitle(), renderAdminNotificationGroupBody(), { onBack: "openPage('ADMIN_NOTIFICATION_SETTINGS')" });
    if (p === 'ADMIN_LIFECYCLE_SETTINGS') return pageShell("Do'kon holati parametrlari", renderAdminLifecycleSettingsBody(), { onBack: "switchTab('profile')" });
    if (p === 'TERMS') return pageShell("Foydalanish shartlari", renderTermsBody(), { onBack: "closeTermsPrivacyPage()" });
    if (p === 'PRIVACY') return pageShell("Maxfiylik siyosati", renderPrivacyBody(), { onBack: "closeTermsPrivacyPage()" });
    if (p === 'ABOUT') return pageShell("UStorE haqida", renderAboutBody(), { onBack: "closePage()" });
    if (p === 'GUIDES') return pageShell("Qo'llanmalar", renderGuidesHubBody(), { onBack: "switchTab('profile')" });
    if (p === 'GUIDE_USAGE') return pageShell("UStorE'dan foydalanish", renderGuideUsageBody(), { onBack: "openPage('GUIDES')" });
    if (p === 'GUIDE_SUBSCRIPTION') return pageShell("To'lov va obuna", renderGuideSubscriptionBody(), { onBack: "openPage('GUIDES')" });
    if (p === 'GUIDE_SHOP_SETUP') return pageShell("Do'kon sozlash", renderGuideShopSetupBody(), { onBack: "openPage('GUIDES')" });
    if (p === 'SUPPORT') return pageShell('Support bilan yozish', renderSupportBody(), { onBack: "switchTab('help')" });
    if (p === 'SUPPORT_THREAD') return pageShell(supportThreadTitle(), renderSupportThreadBody(), { onBack: "openPage('SUPPORT')" });
    if (p === 'BUG_REPORT') return pageShell('Muammo haqida xabar berish', renderBugReportBody(), { onBack: "switchTab('help')" });
    if (p === 'FAQ_FULL') return pageShell('Ko‘p beriladigan savollar', renderFaqFullBody(), { onBack: "switchTab('help')" });
    if (p === 'ADMIN_SUPPORT') return pageShell('Support', renderAdminSupportBody(), { onBack: "switchTab('profile')" });
    if (p === 'EXPIRED_SHOPS') return pageShell("Muddati tugagan do'konlar", renderExpiredShopsBody(), { onBack: "switchTab('dashboard')" });
    if (p === 'ADMIN_SUPPORT_THREAD') return pageShell(supportThreadTitle(), renderAdminSupportThreadBody(), { onBack: "openPage('ADMIN_SUPPORT')" });
    return '';
  }

  // 5-band: Shartlar/Maxfiylik sahifasi PAYMENT (checkout o'rtasida) yoki
  // Profil'dan ochilishi mumkin — yopilganda aynan o'sha joyga qaytadi.
  // Checkout holati (flowKind/flowTariffId/flowShopId/receiptFile) allaqachon
  // module-level o'zgaruvchilarda, DOM'ga bog'liq emas — shu sabab bu yerga
  // qaytishda hech narsa qayta tiklash shart emas, faqat sahifa almashadi.
  let termsPrivacyReturnTo = null;
  function openTermsPage(returnTo) { termsPrivacyReturnTo = returnTo || null; openPage('TERMS'); }
  function openPrivacyPage(returnTo) { termsPrivacyReturnTo = returnTo || null; openPage('PRIVACY'); }
  function closeTermsPrivacyPage() {
    const returnTo = termsPrivacyReturnTo;
    termsPrivacyReturnTo = null;
    if (returnTo === 'PAYMENT') openPage('PAYMENT');
    else closePage();
  }

  // ======================================================================
  // FOYDALANISH SHARTLARI / MAXFIYLIK SIYOSATI (5-band, spec 20/21-bo'limlar)
  // ======================================================================
  function renderTermsBody() {
    return `
      <div class="plat-legal">
        <p class="plat-legal-meta">Versiya: ${TERMS_VERSION} — Kuchga kirish sanasi: admin belgilaydi</p>

        <h2>20.1. Umumiy qoidalar</h2>
        <p>UStorE Telegram ichida onlayn do'kon yaratish va boshqarish imkonini beruvchi platformadir.</p>
        <p>UStorE'dan foydalanish orqali foydalanuvchi ushbu shartlarni o'qiganini, tushunganini va ularga roziligini tasdiqlaydi.</p>

        <h2>20.2. Foydalanuvchi javobgarligi</h2>
        <p>Do'kon egasi quyidagilar uchun o'zi javobgar:</p>
        <ul>
          <li>do'kon ma'lumotlarining to'g'riligi</li>
          <li>mahsulotlarning qonuniyligi</li>
          <li>narxlarning to'g'riligi</li>
          <li>xaridor bilan savdo munosabatlari</li>
          <li>yetkazib berish</li>
          <li>zarur litsenziya va ruxsatnomalar</li>
          <li>soliqqa oid majburiyatlar</li>
          <li>iste'molchi oldidagi majburiyatlar</li>
        </ul>
        <p>UStorE sotilayotgan mahsulot sifati, qonuniyligi yoki sotuvchining va'dalari bo'yicha sotuvchi o'rniga javobgarlikni o'z zimmasiga olmaydi.</p>

        <h2>20.3. Taqiqlangan va cheklangan tovarlar</h2>
        <p>UStorE orqali O'zbekiston Respublikasi qonunchiligida muomalasi taqiqlangan, muomalasi cheklangan, yoki maxsus ruxsat/litsenziya talab etiladigan (lekin sotuvchida tegishli ruxsat bo'lmagan) tovar va xizmatlarni sotish taqiqlanadi.</p>
        <p>UStorE xavfsizlik va platforma siyosati asosida qonun bilan mutlaq taqiqlanmagan ayrim toifalarni ham platformada cheklashi yoki taqiqlashi mumkin. Bunday holatda mahsulot yashirilishi, do'kon muzlatilishi yoki do'kon butunlay o'chirilishi mumkin.</p>
        <p>Jiddiy qoidabuzarlik sababli do'kon o'chirilsa, to'langan obuna puli qaytarilmaydi, qonunchilikda majburiy qaytarish talab etilgan holatlar bundan mustasno.</p>

        <h2>20.4. Firibgarlik va noqonuniy faoliyat</h2>
        <p>Qat'iyan taqiqlanadi:</p>
        <ul>
          <li>yolg'on mahsulot joylashtirish</li>
          <li>mavjud bo'lmagan tovar uchun pul yig'ish maqsadidagi firibgarlik</li>
          <li>noqonuniy to'lov sxemalari</li>
          <li>qalbaki hujjat yoki chek</li>
          <li>boshqa shaxs nomidan ruxsatsiz savdo</li>
          <li>platformadan noqonuniy yoki zararli faoliyat uchun foydalanish</li>
          <li>UStorE xavfsizlik mexanizmlarini chetlab o'tish</li>
          <li>boshqa do'kon yoki foydalanuvchilarga zarar yetkazish</li>
        </ul>

        <h2>20.5. Obuna</h2>
        <p>Standart obuna 30 kun. Yangi do'konning birinchi obunasi: 30 kun + 7 kun bonus = 37 kun. +7 kun bonus faqat birinchi obunada beriladi.</p>
        <p>Tarif va narxlar kelajak uchun o'zgartirilishi mumkin. Amaldagi to'langan davr narxi orqaga qarab o'zgartirilmaydi.</p>

        <h2>20.6. Obuna tugashi</h2>
        <p>Obuna tugaganda shop muzlatiladi. Ma'lumotlar 30 kun davomida saqlanadi. 30 kun ichida obuna yangilanmasa shopni o'chirish/terminatsiya jarayoni boshlanishi mumkin.</p>

        <h2>20.7. Kompensatsiya</h2>
        <p>UStorE texnik nosozlik yoki boshqa asosli holatlarda obunaga qo'shimcha kun berishi mumkin. Bu avtomatik doimiy huquq emas va Super Admin qarori bilan sabab ko'rsatilgan holda beriladi.</p>

        <h2>20.8. Texnik ishlar</h2>
        <p>Profilaktika, xavfsizlik yangilanishi, server ishlari yoki uchinchi tomon xizmatlari sabab UStorE vaqtincha ishlamasligi mumkin. Platforma uzilishlarni imkon qadar kamaytirishga harakat qiladi.</p>

        <h2>20.9. Muzlatish</h2>
        <p>UStorE qoidabuzarlik, xavfsizlik xavfi, obuna tugashi, shubhali faoliyat yoki qonuniy talab sabab shopni muzlatishi mumkin.</p>

        <h2>20.10. O'chirish</h2>
        <p>Jiddiy yoki takroriy qoidabuzarliklarda UStorE shopni butunlay o'chirish huquqini saqlab qoladi.</p>

        <h2>20.11. To'lovni qaytarish</h2>
        <p>Obuna xizmati faollashgandan keyin to'lovlar odatda qaytarilmaydi.</p>
        <p>Alohida ko'rib chiqilishi mumkin:</p>
        <ul>
          <li>UStorE xizmatni taqdim eta olmagan holat</li>
          <li>bir to'lovning ikki marta qabul qilinishi</li>
          <li>amaldagi qonunchilik majbur qiladigan holat</li>
        </ul>
        <p>Qoidabuzarlik sababli o'chirilgan shop uchun obuna puli qaytarilmaydi, qonunchilikdagi majburiy holatlar bundan mustasno.</p>

        <h2>20.12. Shartlarni o'zgartirish</h2>
        <p>UStorE shartlarni yangilashi mumkin. Muhim o'zgarishda yangi versiyaga qayta rozilik olinishi mumkin.</p>

        <h2>Huquqiy eslatma</h2>
        <p>Ushbu Foydalanish shartlari va Maxfiylik siyosati UStorE mahsuloti uchun ishchi draft hisoblanadi. Production'da foydalanuvchilarga chiqarishdan oldin O'zbekiston Respublikasining amaldagi shaxsga doir ma'lumotlar, elektron tijorat, iste'molchilar huquqlari, to'lovlar, taqiqlangan va cheklangan tovarlar, soliq va boshqa tegishli talablar bo'yicha malakali yurist tomonidan tekshirtirish tavsiya etiladi.</p>
      </div>
    `;
  }

  function renderPrivacyBody() {
    return `
      <div class="plat-legal">
        <p class="plat-legal-meta">Versiya: ${PRIVACY_VERSION}</p>

        <h2>21.1. Qayta ishlanishi mumkin bo'lgan ma'lumotlar</h2>
        <ul>
          <li>Telegram ID, username, Telegram'dagi ism, profil rasmi (mavjud bo'lsa)</li>
          <li>do'kon nomi, bot ma'lumotlari</li>
          <li>mahsulotlar, katalog, narxlar, ombor qoldig'i</li>
          <li>buyurtmalar, yetkazib berish ma'lumotlari</li>
          <li>obuna ma'lumotlari, to'lov cheklari</li>
          <li>support yozishmalari</li>
          <li>texnik loglar, xavfsizlikka oid texnik ma'lumotlar</li>
        </ul>

        <h2>21.2. Maqsad</h2>
        <p>Ma'lumotlar xizmatni taqdim etish, userni aniqlash, do'konni boshqarish, buyurtmani qayta ishlash, obunani boshqarish, to'lovni tekshirish, support, xavfsizlik, firibgarlikni oldini olish, texnik muammolarni aniqlash va xizmatni yaxshilash uchun ishlatiladi.</p>

        <h2>21.3. Maxfiy credentials</h2>
        <p>API key, bot token, integratsiya tokeni va boshqa maxfiy credentiallar frontendga chiqarilmasligi kerak. Ular server tomonda va zarur bo'lsa shifrlangan holda saqlanadi.</p>

        <h2>21.4. Uchinchi tomon xizmatlari</h2>
        <p>UStorE ishlashi uchun Telegram, hosting, database, storage, tarjima va integratsiya provayderlaridan foydalanishi mumkin. Ular zarur texnik funksiyani bajarish doirasida ma'lumotlarni qayta ishlashi mumkin.</p>

        <h2>21.5. To'lov cheklari</h2>
        <p>Cheklar to'lovni tekshirish, nizolar va audit uchun saqlanishi mumkin. Cheklar boshqa foydalanuvchilarga ommaviy ko'rsatilmaydi.</p>

        <h2>21.6. Ma'lumotlarni saqlash</h2>
        <p>Ma'lumotlar xizmatni ko'rsatish, xavfsizlik, audit va qonuniy majburiyatlar mavjud muddat davomida saqlanishi mumkin.</p>
        <p>Shop o'chirilganda operatsion ma'lumotlar o'chirilishi yoki anonymizatsiya qilinishi mumkin. Audit va qonuniy ehtiyojlar uchun minimal yozuvlar ma'lum muddat saqlanishi mumkin.</p>

        <h2>21.7. Foydalanuvchi huquqlari</h2>
        <p>Foydalanuvchi quyidagi huquqlarga ega:</p>
        <ul>
          <li>o'z ma'lumotlarini ko'rish</li>
          <li>xatoni tuzatish</li>
          <li>qonunchilik va platforma majburiyatlari doirasida ma'lumotni o'chirishni so'rash</li>
          <li>maxfiylik bo'yicha supportga murojaat qilish</li>
        </ul>

        <h2>21.8. Xavfsizlik</h2>
        <p>UStorE ruxsatsiz kirish, ma'lumot yo'qolishi, token sizib chiqishi va noqonuniy foydalanish xavfini kamaytirish uchun texnik va tashkiliy choralarni qo'llaydi.</p>
        <p>Hech bir internet tizimi 100% mutlaq xavfsizlik kafolatini bera olmaydi.</p>

        <h2>21.9. Siyosatni yangilash</h2>
        <p>Maxfiylik siyosati yangilanishi mumkin. Muhim o'zgarishda version, sana va zarur bo'lsa qayta rozilik ishlatiladi.</p>
      </div>
    `;
  }

  // ======================================================================
  // LANDING (yangi tashrif buyuruvchi, hali do'koni yo'q)
  // ======================================================================
  // 3.2-band: "Nega UStorE?" — 8 ta karta, gorizontal swipe-carousel.
  // Tarif imkoniyatlari backendda alohida feature-matrix sifatida saqlanmaydi;
  // shu sabab UI tariflar orasida fake farq o'ylab topmaydi. Barcha tariflarda
  // mavjud bo'lgan real platform imkoniyatlari ko'rsatiladi, haqiqiy farq esa
  // tarif nomi/narxi/productLimit orqali backenddan keladi.
  const TARIFF_FEATURE_LIST = [
    "Telegram e-do'kon",
    'Katalog va mahsulotlar',
    'Buyurtmalarni boshqarish',
    'Ombor nazorati',
    'Marketing va hisobotlar',
  ];

  const WHY_USTORE_CARDS = [
    ['bag', '24/7 ishlaydigan onlayn do\'kon', 'Mijozlaringiz Telegram\'dan chiqmasdan mahsulotlarni ko\'radi va buyurtma beradi.'],
    ['box', 'Ombor nazorati', 'Qoldiq, kam qolgan va tugagan mahsulotlarni bir joydan kuzating.'],
    ['bell', 'Buyurtmalar bir joyda', 'Yangi buyurtmadan yetkazib berishgacha bo\'lgan jarayonni bitta paneldan boshqaring.'],
    ['card', 'Qulay to\'lovlar', 'Naqd, karta, QR va mavjud to\'lov usullarini sozlang.'],
    ['truck', 'Moslashuvchan yetkazib berish', 'Taksi, uyga yetkazish, pochta va olib ketish usullaridan foydalaning.'],
    ['globe', 'Ikki tilda ishlash', 'Mijozlaringiz UStorE\'dan O\'zbekcha yoki Ruscha foydalanishi mumkin.'],
    ['phone', 'Telefon orqali boshqaruv', 'Do\'koningizni kompyutersiz ham, telefon orqali boshqarishingiz mumkin.'],
    ['layers', 'Alohida sayt shart emas', 'Savdoni boshlash uchun alohida sayt tayyorlashga hojat yo\'q — UStorE Telegram ichida ishlaydi.'],
  ];
  // 3.7-band: FAQ — accordion. Butun app'ni qayta render() qilmaydi (scroll
  // pozitsiyasi buzilmasin uchun), faqat bosilgan qatorning DOM klassini almashtiradi.
  function toggleFaq(btn) {
    const item = btn.closest('.plat-faq-item');
    if (item) item.classList.toggle('open');
  }
  function renderAboutBody() {
    return `
      <div class="plat-guide-hero tone-blue"><span>${pIcon('shop',28)}</span><div><h2>UStorE</h2><p>Telegram ichida e-do'kon yaratish va boshqarish platformasi.</p></div></div>
      <div class="plat-guide-card"><h3>UStorE nima qiladi?</h3><p class="plat-about-copy">Mahsulotlar, buyurtmalar, ombor, marketing, to'lov va yetkazib berish jarayonlarini bitta tizimga birlashtiradi.</p></div>
      <div class="plat-guide-card"><h3>Asosiy imkoniyatlar</h3>${[['box','Mahsulot va katalog'],['bag','Buyurtmalar'],['dashboard','Ombor va hisobotlar'],['card','Click / Payme ekvayring'],['truck','Yetkazib berish'],['bolt','Marketing']].map(([i,t])=>`<div class="plat-guide-row"><span>${pIcon(i,17)}</span><b>${t}</b></div>`).join('')}</div>
      <div class="plat-telegram-security">${pIcon('lock',19)}<div><b>Telegram akkauntingiz bilan xavfsiz kirish</b><small>Alohida login va parol talab qilinmaydi.</small></div>${pIcon('check',18)}</div>
    `;
  }

  const FAQ_ITEMS = [
    ["Do'kon qancha vaqtda tayyor bo'ladi?", "To'lov tasdiqlangandan keyin do'koningiz imkon qadar tez ulanadi. Qo'lda ulash talab qilinadigan holatlarda 24 soatgacha vaqt ketishi mumkin."],
    ['Tarifni keyin almashtirish mumkinmi?', "Ha. Mavjud do'koningiz uchun boshqa tarifni tanlab, obunani yangilashingiz mumkin."],
    ['Mahsulotlar soni limitdan oshsa nima bo\'ladi?', "Tarif limitidan ko'p mahsulot qo'shish uchun yuqoriroq tarifga o'tishingiz kerak."],
    ["Obuna qancha muddatga?", "Standart obuna muddati 30 kun. Yangi do'konning birinchi obunasiga qo'shimcha 7 kun bonus beriladi."],
    ["To'lov qanday amalga oshiriladi?", "Hozircha karta orqali to'lov qilib, chek yuborasiz. To'lov UStorE Admin tomonidan tasdiqlanadi."],
    ["Obuna tugasa ma'lumotlar o'chadimi?", "Yo'q. Obuna tugaganda do'kon avval muzlatiladi va 30 kun davomida ma'lumotlar saqlanadi."],
  ];
  // 8.2/12-band, screenshot 05: Yordam bosh sahifasidagi 3 ta preview savol
  // — to'liq FAQ_ITEMS'dan ALOHIDA, chunki spec aynan shu 3 ta matnni beradi.
  const FAQ_PREVIEW_ITEMS = [
    "Botni qanday yaratish va ulash mumkin?",
    "To'lovni qanday amalga oshirish mumkin?",
    "Obunani qanday uzaytirish yoki o'zgartirish mumkin?",
  ];

  function renderLandingHero() {
    return `
      <section class="plat-landing-hero">
        <div class="plat-landing-hero-copy">
          <span class="plat-eyebrow">${pIcon('bolt', 13)} Telegram uchun e-do'kon platformasi</span>
          <h1>Telegram'da o'z <span>e-do'koningizni</span> oching</h1>
          <p>Mahsulotlarni boshqaring, buyurtmalarni qabul qiling, to'lov va yetkazib berishni sozlang — barchasi bitta tizimda.</p>
          <div class="plat-landing-hero-actions">
            <button class="primary" onclick="startNewShopFlow()">${pIcon('shop', 17)} Do'kon ochish</button>
            <button class="secondary" onclick="document.getElementById('plat-why-ustore').scrollIntoView({behavior:'smooth'})">${pIcon('bolt', 15)} Imkoniyatlarni ko'rish</button>
          </div>
        </div>
        <div class="plat-landing-visual" aria-hidden="true">
          <div class="plat-landing-phone">
            <span class="plat-landing-phone-line"></span>
            <div class="plat-landing-phone-kpi"><b>24</b><small>Buyurtma</small></div>
            <div class="plat-landing-phone-grid"><span></span><span></span><span></span><span></span></div>
          </div>
          <span class="plat-landing-float one">${pIcon('bag', 20)}</span>
          <span class="plat-landing-float two">${pIcon('box', 20)}</span>
        </div>
      </section>

      <section id="plat-why-ustore" class="plat-landing-section">
        <div class="plat-section-heading"><div><h2>Nega UStorE?</h2><p>Savdoni murakkablashtirmang. Asosiy jarayonlarni Telegram ichida boshqaring.</p></div></div>
        <div class="plat-benefit-grid">
          ${[
            ['box','Mahsulot boshqaruvi',"Mahsulot, kategoriya, narx va qoldiqni boshqaring."],
            ['bag','Buyurtmalar',"Buyurtmalarni qabul qiling va holatini kuzating."],
            ['dashboard','Ombor',"Qoldiq va tugayotgan mahsulotlarni nazorat qiling."],
            ['card','Click / Payme',"Online ekvayring orqali to'lov qabul qiling."],
            ['truck','Yetkazib berish',"Yetkazib berish usullari va parametrlarini sozlang."],
            ['chart','Hisobotlar',"Savdo va mahsulotlar bo'yicha ko'rsatkichlarni ko'ring."],
          ].map(([icon,title,desc],i)=>`<article class="plat-benefit-card tone-${(i%4)+1}"><span>${pIcon(icon,19)}</span><div><b>${title}</b><small>${desc}</small></div></article>`).join('')}
        </div>
      </section>

      <section class="plat-landing-section">
        <div class="plat-section-heading"><div><h2>Qanday ishlaydi?</h2><p>Uchta oddiy bosqich.</p></div></div>
        <div class="plat-how-grid">
          <div><span>1</span><b>Tarifni tanlang</b><small>Biznesingiz hajmiga mos tarif.</small></div>
          <div><span>2</span><b>Obunani faollashtiring</b><small>To'lovni yuboring, tasdiqlangach do'kon tayyorlanadi.</small></div>
          <div><span>3</span><b>Savdoni boshlang</b><small>Mahsulotlarni joylashtirib buyurtma qabul qiling.</small></div>
        </div>
      </section>

      <section class="plat-landing-section">
        <div class="plat-section-heading"><div><h2>Tariflar</h2><p>Oylik yoki yillik to'lovni tanlang. Yillikda 2 oy bepul.</p></div></div>
        ${renderBillingToggle()}
        ${renderTariffCards(false, { onSelectJs: `startNewShopWithTariff('__TARIFF__')`, ctaLabel: "Tanlash" })}
      </section>

      <section class="plat-bonus-card plat-bonus-card-pro">
        <span class="plat-bonus-icon">${pIcon('gift', 20)}</span>
        <div><b>Birinchi obunada +7 kun bonus</b><p>30 kun + 7 kun bonus = jami 37 kun.</p></div>
      </section>

      <section class="plat-integrations-strip">
        <div><b>Ekvayring va savdo integratsiyalari</b><small>To'lov va savdo jarayonlari uchun.</small></div>
        <div class="plat-integration-pills"><span>${paymentProviderBadge('CLICK', true)} Click</span><span>${paymentProviderBadge('PAYME', true)} Payme</span><span>BILLZ</span></div>
      </section>

      <section class="plat-landing-section">
        <div class="plat-section-heading"><div><h2>Do'koningiz uchun ishonchli boshqaruv</h2></div></div>
        <div class="plat-trust-grid">${[['lock',"Ma'lumotlaringiz himoyalangan"],['phone','Telefon orqali boshqarish'],['bolt','Telegram ichida ishlaydi'],['cloud',"Ma'lumotlar xavfsiz serverlarda saqlanadi"]].map(([icon,text])=>`<div class="plat-trust-card"><div class="plat-trust-card-icon">${pIcon(icon,18)}</div><div class="plat-trust-card-text">${text}</div></div>`).join('')}</div>
      </section>

      <section class="plat-landing-section">
        <div class="plat-section-heading"><div><h2>Ko'p beriladigan savollar</h2></div></div>
        <div class="card plat-faq-card">${FAQ_ITEMS.map(([q,a])=>`<div class="plat-faq-item"><button class="plat-faq-q" onclick="toggleFaq(this)"><span>${q}</span><span class="plat-faq-chevron">${pIcon('chevronDown',16)}</span></button><div class="plat-faq-a"><div class="plat-faq-a-inner">${a}</div></div></div>`).join('')}</div>
      </section>

      <section class="plat-final-cta plat-final-cta-pro">
        <div><b>Savdoni Telegram'da boshlashga tayyormisiz?</b><p>UStorE bilan do'koningizni bitta tizimdan boshqaring.</p></div>
        <button class="primary" onclick="startNewShopFlow()">${pIcon('rocket',16)} Do'kon ochish</button>
      </section>
    `;
  }
  function renderBillingToggle() {
    return `
      <div class="plat-billing-toggle" role="group" aria-label="Obuna muddati">
        <button class="plat-billing-opt ${tariffBillingPeriod === 'monthly' ? 'active' : ''}" onclick="setTariffBillingPeriod('monthly')" type="button"><b>Oylik</b><small>Har oy to‘lov</small></button>
        <button class="plat-billing-opt ${tariffBillingPeriod === 'annual' ? 'active' : ''}" onclick="setTariffBillingPeriod('annual')" type="button"><b>Yillik <span class="plat-billing-free-badge">2 oy bepul</span></b><small>10 oylik to‘lov bilan 12 oy</small></button>
      </div>`;
  }
  function setTariffBillingPeriod(period) {
    tariffBillingPeriod = period;
    if (flowKind === 'NEW_SHOP' && activePage === 'PAYMENT') scheduleNewShopDraftSync();
    render();
  }

  // compact=false (landing teaser) -> gorizontal carousel; compact=true
  // (TARIFFS to'liq sahifasi) -> vertikal to'liq ro'yxat, ikkalasi ham bir
  // xil kartani (renderOneTariffCard) qayta ishlatadi.
  function tariffTone(t) {
    const key = String(t?.name || '').toLowerCase();
    return key.includes('start') ? 'start' : key.includes('stand') ? 'standard' : key.includes('business') ? 'business' : key.includes('premium') ? 'premium' : 'default';
  }
  function renderOneTariffCard(t, opts) {
    opts = opts || {};
    const isCurrent = !!(opts.currentTariffId && opts.currentTariffId === t.id);
    const period = tariffBillingPeriod;
    const tone = tariffTone(t);
    const priceHtml = period === 'annual'
      ? `<div class="plat-tariff-price-strike">${money(annualOriginalPrice(t.price))}</div><div class="plat-tariff-price">${money(annualOfferPrice(t.price))}<span>/yil</span></div><div class="plat-tariff-saving">2 oy bepul</div>`
      : `<div class="plat-tariff-price">${money(t.price)}<span>/oy</span></div>`;
    let selectJs = opts.onSelectJs || `selectTariffAndContinue('${t.id}')`;
    selectJs = selectJs.replace('__TARIFF__', t.id);
    const ctaHtml = isCurrent
      ? `<button class="secondary plat-small-btn plat-tariff-current-btn" disabled>${pIcon('check', 14)} Joriy tarif</button>`
      : `<button class="primary plat-small-btn plat-tariff-select" onclick="${selectJs}">${opts.ctaLabel || "Tarifni tanlash"}</button>`;
    const features = (Array.isArray(t.features) && t.features.length ? t.features : TARIFF_FEATURE_LIST).slice(0, 6);
    return `
      <article class="plat-tariff-card plat-tariff-tone-${tone} ${flowTariffId === t.id ? 'selected' : ''} ${isCurrent ? 'is-current' : ''}">
        ${isCurrent ? '<span class="plat-tariff-badge is-current">Joriy tarif</span>' : t.isPopular ? '<span class="plat-tariff-badge">Ommabop</span>' : ''}
        <div class="plat-tariff-title-row">
          <div class="plat-tariff-title-main"><span class="plat-tariff-symbol">${pIcon(tone === 'premium' ? 'diamond' : tone === 'business' ? 'bag' : tone === 'standard' ? 'bolt' : 'shop', 19)}</span><div><div class="plat-tariff-name">${escapeHtml(t.name)}</div><span class="plat-tariff-limit">${limitLabel(t.productLimit)}</span></div></div>
          <div class="plat-tariff-price-block">${priceHtml}</div>
        </div>
        <div class="plat-tariff-divider"></div>
        <ul class="plat-tariff-features">
          ${features.map((f) => `<li>${pIcon('check', 12)}<span title="${escapeHtml(f)}">${escapeHtml(f)}</span></li>`).join('')}
        </ul>
        ${ctaHtml}
      </article>
    `;
  }
  function renderTariffCards(compact, opts) {
    if (!tariffs.length) return '<p class="empty">Hozircha tarif mavjud emas.</p>';
    // Tariflar sahifasida ham, landing teaser'da ham bir xil tor kartali
    // infinite carousel ishlaydi. Birinchi/oxirgi clone scroll oxirida
    // sezilmasdan real slide'ga qaytariladi.
    const realSlides = tariffs.map((t, i) => `<div class="plat-carousel-item plat-tariff-carousel-item" data-real-index="${i}">${renderOneTariffCard(t, opts)}</div>`);
    const slides = tariffs.length > 1
      ? [
          `<div class="plat-carousel-item plat-tariff-carousel-item is-clone" data-real-index="${tariffs.length - 1}" aria-hidden="true">${renderOneTariffCard(tariffs[tariffs.length - 1], opts)}</div>`,
          ...realSlides,
          `<div class="plat-carousel-item plat-tariff-carousel-item is-clone" data-real-index="0" aria-hidden="true">${renderOneTariffCard(tariffs[0], opts)}</div>`,
        ]
      : realSlides;
    return `
      <div class="plat-carousel plat-tariff-carousel ${compact ? 'is-full-page' : ''}" data-infinite="${tariffs.length > 1 ? '1' : '0'}" onscroll="syncTariffCarouselDots(this)">${slides.join('')}</div>
      <div class="plat-carousel-dots">${tariffs.map((_, i) => `<span class="plat-carousel-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>
    `;
  }
  function nearestTariffCarouselItem(carousel) {
    const items = Array.from(carousel?.querySelectorAll('.plat-tariff-carousel-item') || []);
    if (!items.length) return { items, item: null, index: -1 };
    let index = 0;
    let bestDistance = Infinity;
    items.forEach((item, i) => {
      const distance = Math.abs(item.offsetLeft - carousel.scrollLeft);
      if (distance < bestDistance) { bestDistance = distance; index = i; }
    });
    return { items, item: items[index], index };
  }
  function syncTariffCarouselDots(carousel) {
    if (!carousel) return;
    const { items, item, index } = nearestTariffCarouselItem(carousel);
    const dots = Array.from(carousel.nextElementSibling?.querySelectorAll('.plat-carousel-dot') || []);
    if (!item || !dots.length) return;
    const realIndex = Math.max(0, Number(item.dataset.realIndex || 0));
    dots.forEach((dot, i) => dot.classList.toggle('active', i === realIndex));
    if (carousel.dataset.infinite !== '1' || items.length < 3) return;
    clearTimeout(carousel._platLoopTimer);
    carousel._platLoopTimer = setTimeout(() => {
      const latest = nearestTariffCarouselItem(carousel);
      if (latest.index === 0) {
        const target = latest.items[latest.items.length - 2];
        if (target) carousel.scrollTo({ left: target.offsetLeft, behavior: 'auto' });
      } else if (latest.index === latest.items.length - 1) {
        const target = latest.items[1];
        if (target) carousel.scrollTo({ left: target.offsetLeft, behavior: 'auto' });
      }
    }, 90);
  }
  function initTariffCarousels() {
    requestAnimationFrame(() => {
      document.querySelectorAll('.plat-tariff-carousel[data-infinite="1"]').forEach((carousel) => {
        if (carousel.dataset.loopReady === '1') return;
        const items = carousel.querySelectorAll('.plat-tariff-carousel-item');
        if (items.length > 2) {
          carousel.dataset.loopReady = '1';
          carousel.scrollLeft = items[1].offsetLeft;
          syncTariffCarouselDots(carousel);
        }
      });
    });
  }

  function renderTariffListBody() {
    const contextText = flowShopId && flowUpgradeAction === 'CHANGE'
      ? "Do'koningiz uchun yangi tarifni tanlang. Qolgan to'langan qiymat yangi tarifga adolatli konvertatsiya qilinadi."
      : flowEntry === 'NEW_SHOP'
        ? "Yangi do'koningiz uchun tarifni tanlang. Tanlaganingizdan keyin to'g'ridan-to'g'ri to'lovga o'tasiz."
        : "Tarifni tanlang. Keyingi bosqichda yangi do'kon yaratish yoki mavjud do'kon obunasini boshqarishni tanlaysiz.";
    return `
      <div class="plat-flow-intro"><span>${pIcon('diamond',20)}</span><div><b>Biznesingizga mos tarif</b><p>${contextText}</p></div></div>
      ${renderBillingToggle()}
      ${renderTariffCards(false, { ctaLabel: flowShopId && flowUpgradeAction === 'CHANGE' ? "Shu tarifga o'tish" : "Sotib olish" })}
      <div class="plat-bonus-card plat-bonus-card-pro"><span class="plat-bonus-icon">${pIcon('gift',18)}</span><div><b>Birinchi obunada +7 kun bonus</b><p>Faqat yangi do'konning birinchi obunasida qo'llanadi.</p></div></div>
    `;
  }
  function currentTelegramUserId() {
    const id = tg?.initDataUnsafe?.user?.id;
    return id === undefined || id === null ? '' : String(id);
  }
  function prepareNewShopIdentity() {
    newShopName = '';
    newShopOwnerTelegramId = currentTelegramUserId();
  }

  function resetSubscriptionFlow() {
    flowKind = null;
    flowShopId = null;
    flowTariffId = null;
    flowUpgradeAction = null;
    flowReturnPage = null;
    flowEntry = null;
    flowOriginTab = null;
    selectedPaymentMethodType = null;
    selectedPaymentMethodId = null;
    externalPaymentOpened = false;
    pendingExternalPaymentMethodId = null;
    externalPaymentWarningChecked = false;
    consentAccepted = false;
    connectError = null;
    preparedNewShopRequestId = null;
    preparedNewShopPaymentDeadlineAt = null;
    if (newShopDraftSyncTimer) { clearTimeout(newShopDraftSyncTimer); newShopDraftSyncTimer = null; }
  }
  function startNewShopFlow() {
    const origin = currentTab;
    resetSubscriptionFlow();
    prepareNewShopIdentity();
    flowEntry = 'NEW_SHOP';
    flowKind = 'NEW_SHOP';
    flowOriginTab = origin || 'home';
    flowReturnPage = 'TARIFFS';
    openPage('TARIFFS');
  }
  function startNewShopWithTariff(tariffId) {
    const origin = currentTab;
    resetSubscriptionFlow();
    prepareNewShopIdentity();
    flowEntry = 'NEW_SHOP';
    flowKind = 'NEW_SHOP';
    flowOriginTab = origin || 'home';
    flowTariffId = tariffId;
    flowReturnPage = 'TARIFFS';
    openPage('PAYMENT');
  }
  function selectTariffAndContinue(tariffId) {
    flowTariffId = tariffId;
    consentAccepted = false;
    selectedPaymentMethodType = null;
    selectedPaymentMethodId = null;
    externalPaymentOpened = false;
    if (flowShopId && flowUpgradeAction === 'CHANGE') {
      flowKind = 'UPGRADE';
      openPage('PAYMENT');
      return;
    }
    // 5-topshiriq: tarif kartasidan NEW_SHOP uchun oraliq
    // SUBSCRIPTION_TARGET oynasi olib tashlandi.
    if (flowEntry !== 'NEW_SHOP') {
      const origin = currentTab;
      prepareNewShopIdentity();
      flowEntry = 'NEW_SHOP';
      flowKind = 'NEW_SHOP';
      flowOriginTab = origin || 'subscription';
    } else {
      flowKind = 'NEW_SHOP';
    }
    flowShopId = null;
    flowUpgradeAction = null;
    flowReturnPage = 'TARIFFS';
    openPage('PAYMENT');
  }

  // Tarif tanlangandan keyingi BIRTA target sahifa. Eski "Obuna turi" va
  // alohida shop-picker sahifalari olib tashlandi: kontekst shu sahifada aniq.
  function renderSubscriptionTargetBody() {
    const tariff = tariffs.find((t) => t.id === flowTariffId);
    if (!tariff) return `<div class="plat-empty-pro"><span>${pIcon('diamond',28)}</span><h2>Tarif topilmadi</h2><button class="primary" onclick="openPage('TARIFFS')">Tariflarga qaytish</button></div>`;
    const price = tariffBillingPeriod === 'annual' ? annualOfferPrice(tariff.price) : tariff.price;
    const periodLabel = tariffBillingPeriod === 'annual' ? 'Yillik · 2 oy bepul' : 'Oylik';
    return `
      <section class="plat-target-hero plat-tariff-tone-${tariffTone(tariff)}">
        <span class="plat-target-icon">${pIcon('diamond',22)}</span>
        <div><small>Tanlangan tarif</small><h2>${escapeHtml(tariff.name)}</h2><p>${limitLabel(tariff.productLimit)} · ${periodLabel}</p></div>
        <strong>${money(price)}<small>/${tariffBillingPeriod === 'annual' ? 'yil' : 'oy'}</small></strong>
      </section>
      <button class="plat-new-shop-choice" onclick="chooseNewShop()">
        <span class="plat-new-shop-choice-icon">${pIcon('plus',20)}</span>
        <div><b>Yangi do'kon yaratish</b><small>Tanlangan tarif bilan yangi UStorE do'konini ochish uchun to'lovga o'ting.</small></div><em>›</em>
      </button>
      ${myShops.length ? `
        <div class="plat-section-heading plat-target-heading"><div><h2>Mavjud do'konlarim</h2><p>Joriy tarifni uzaytiring yoki tanlangan tarifga o'ting.</p></div></div>
        <div class="plat-target-shop-list">${myShops.map((shop) => {
          const left = daysUntil(shop.subscriptionExpiresAt);
          const current = tariffs.find((t) => t.id === shop.tariffId);
          const sameTariff = shop.tariffId && shop.tariffId === tariff.id;
          return `<article class="plat-target-shop-card">
            <span class="plat-shop-avatar ${shopAvatarClass(shop)}">${shopAvatarHtml(shop)}</span>
            <div class="plat-target-shop-main"><b>${escapeHtml(shop.shopName || shop.botUsername || shop.publicCode)}</b><small>${escapeHtml(shop.tariffName || 'Tarifsiz')} · ${left === null ? 'obuna sanasi yo‘q' : left <= 0 ? 'obuna tugagan' : left + ' kun qoldi'}</small></div>
            <div class="plat-target-shop-actions">
              <button class="secondary" onclick="startExtendFor('${shop.id}')" ${shop.tariffId ? '' : 'disabled'}>Uzaytirish</button>
              <button class="primary" onclick="startChangeWithSelectedTariff('${shop.id}')" ${sameTariff ? 'disabled' : ''}>${sameTariff ? 'Joriy tarif' : "Tarifni o'zgartirish"}</button>
            </div>
          </article>`;
        }).join('')}</div>` : `
        <div class="plat-target-empty"><span>${pIcon('shop',20)}</span><div><b>Hozircha do'koningiz yo'q</b><p>Yuqoridagi “Yangi do'kon yaratish” orqali davom eting.</p></div></div>`}
    `;
  }
  function chooseNewShop() {
    prepareNewShopIdentity();
    flowKind = 'NEW_SHOP';
    flowEntry = 'SUBSCRIPTION_CATALOG';
    flowShopId = null;
    flowUpgradeAction = null;
    flowReturnPage = 'SUBSCRIPTION_TARGET';
    selectedPaymentMethodType = null;
    selectedPaymentMethodId = null;
    externalPaymentOpened = false;
    consentAccepted = false;
    openPage('PAYMENT');
  }
  function startChangeWithSelectedTariff(shopId) {
    const shop = myShops.find((s) => s.id === shopId);
    if (!shop || !flowTariffId || shop.tariffId === flowTariffId) return;
    flowKind = 'UPGRADE';
    flowEntry = 'SUBSCRIPTION_CATALOG';
    flowShopId = shopId;
    flowUpgradeAction = 'CHANGE';
    flowReturnPage = 'SUBSCRIPTION_TARGET';
    selectedPaymentMethodType = null;
    selectedPaymentMethodId = null;
    externalPaymentOpened = false;
    consentAccepted = false;
    openPage('PAYMENT');
  }
  function paymentBackAction() {
    if (flowReturnPage === 'MY_REQUEST_DETAILS' && preparedNewShopRequestId) return `openMyRequestDetails('${preparedNewShopRequestId}')`;
    if (flowReturnPage === 'SUBSCRIPTION_TARGET') return `openPage('SUBSCRIPTION_TARGET')`;
    if (flowReturnPage === 'MY_SHOP_DETAILS' && flowShopId) return `openMyShopManage('${flowShopId}')`;
    return `openPage('TARIFFS')`;
  }
  function tariffsBackAction() {
    if (flowReturnPage === 'MY_SHOP_DETAILS' && flowShopId) return `openMyShopManage('${flowShopId}')`;
    if (flowEntry === 'NEW_SHOP' && flowOriginTab) return `switchTab('${flowOriginTab}')`;
    return `switchTab('subscription')`;
  }

  // ======================================================================
  // TO'LOV (karta + nusxalash + chek yuklash)
  // ======================================================================
  async function ensurePaymentInfoLoaded() {
    if (paymentInfo) return;
    try { paymentInfo = await callPlatformApi('platform_get_payment_info', {}); }
    catch (e) { paymentInfo = { cardNumber: null, cardHolder: null }; }
    // 2026-08-28: Karta bilan bir vaqtda, admin qo'shgan Click/Payme/Paynet
    // havola-usullarini ham yuklaydi (052-migratsiya) — bittasi xato bersa
    // ham ikkinchisi to'lov sahifasini to'sib qo'ymasin (alohida try/catch).
    try { platformPaymentMethods = (await callPlatformApi('platform_list_payment_methods', {})).methods || []; }
    catch (e) { platformPaymentMethods = []; }
  }
  async function ensureNewShopPaymentDraft(shouldRender = true) {
    if (flowKind !== 'NEW_SHOP' || !flowTariffId) return null;
    if (preparingNewShopDraft) return preparedNewShopRequestId;
    preparingNewShopDraft = true;
    try {
      const result = await callPlatformApi('platform_prepare_subscription_request', {
        kind: 'NEW_SHOP',
        requestId: preparedNewShopRequestId || undefined,
        tariffId: flowTariffId,
        billingPeriod: tariffBillingPeriod,
        shopName: String(newShopName || '').trim() || undefined,
        ownerTelegramId: String(newShopOwnerTelegramId || currentTelegramUserId() || '') || undefined,
        requesterUsername: (tg?.initDataUnsafe?.user?.username) || null,
        requesterFirstName: (tg?.initDataUnsafe?.user?.first_name) || null,
      });
      preparedNewShopRequestId = result.requestId || preparedNewShopRequestId;
      preparedNewShopPaymentDeadlineAt = result.paymentDeadlineAt || preparedNewShopPaymentDeadlineAt;
      try { await loadMyRequests(false); } catch (_) {}
      return preparedNewShopRequestId;
    } catch (e) {
      console.error('prepare new shop payment draft error', e);
      if (String(e?.message || e).includes('payment_draft_expired')) {
        preparedNewShopRequestId = null;
        preparedNewShopPaymentDeadlineAt = null;
      }
      throw e;
    } finally {
      preparingNewShopDraft = false;
      if (shouldRender && activePage === 'PAYMENT') render();
    }
  }
  function scheduleNewShopDraftSync() {
    if (flowKind !== 'NEW_SHOP' || !flowTariffId) return;
    if (newShopDraftSyncTimer) clearTimeout(newShopDraftSyncTimer);
    newShopDraftSyncTimer = setTimeout(() => {
      newShopDraftSyncTimer = null;
      ensureNewShopPaymentDraft(false).catch(() => {});
    }, 450);
  }
  function paymentDraftTimeLeftLabel(iso) {
    if (!iso) return '1 soatgacha';
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'muddati tugagan';
    const mins = Math.max(1, Math.ceil(ms / 60000));
    return mins >= 60 ? '60 daqiqagacha' : `${mins} daqiqa`;
  }
  async function resumeNewShopPayment(requestId) {
    const r = myRequests.find((x) => x.id === requestId);
    if (!r || r.kind !== 'NEW_SHOP' || r.status !== 'NEW' || r.paymentClaimedAt) return;
    if (r.paymentDeadlineAt && new Date(r.paymentDeadlineAt).getTime() <= Date.now()) {
      await loadMyRequests(false);
      alert("Bu to'lov arizasining 1 soatlik muddati tugagan. Yangi ariza oching.");
      openMyRequests();
      return;
    }
    resetSubscriptionFlow();
    flowKind = 'NEW_SHOP';
    flowEntry = 'NEW_SHOP';
    flowOriginTab = 'home';
    flowReturnPage = 'MY_REQUEST_DETAILS';
    flowTariffId = r.tariffId;
    tariffBillingPeriod = r.billingPeriod === 'ANNUAL' ? 'annual' : 'monthly';
    newShopName = r.requestedShopName || '';
    newShopOwnerTelegramId = String(r.ownerTelegramId || currentTelegramUserId() || '');
    preparedNewShopRequestId = r.id;
    preparedNewShopPaymentDeadlineAt = r.paymentDeadlineAt || null;
    selectedMyRequestId = r.id;
    openPage('PAYMENT');
    ensureNewShopPaymentDraft(false).catch(() => {});
  }
  // 2026-08-28, 054-migratsiya: "Plan change preview" (spec 7-bo'lim) —
  // tarif ALMASHTIRISH oldidan (EXTEND emas — narx o'zgarmasa konvertatsiya
  // qilinadigan hech narsa yo'q) mijozga qolgan qiymati yangi tarifda
  // taxminan necha kunga aylanishini ko'rsatadi. Server hisoblaydi
  // (platform_preview_tariff_change) — frontend hech qanday moliyaviy
  // hisob-kitob qilmaydi, faqat natijani ko'rsatadi.
  let tariffChangePreview = null; // { key, loading, data } yoki null
  async function ensureTariffChangePreviewLoaded(shopId, tariffId, isAnnual) {
    const key = `${shopId}:${tariffId}:${isAnnual ? 'ANNUAL' : 'MONTHLY'}`;
    if (tariffChangePreview?.key === key) return;
    tariffChangePreview = { key, loading: true, data: null };
    try {
      const data = await callPlatformApi('platform_preview_tariff_change', { shopId, tariffId, billingPeriod: isAnnual ? 'annual' : 'monthly' });
      if (tariffChangePreview.key === key) tariffChangePreview = { key, loading: false, data };
    } catch (e) {
      if (tariffChangePreview.key === key) tariffChangePreview = { key, loading: false, data: null };
    }
    if (activePage === 'PAYMENT') rerenderActivePage();
  }
  function paymentPageTitle() {
    if (flowKind === 'NEW_SHOP') return "Yangi do'kon uchun obuna";
    if (flowUpgradeAction === 'EXTEND') return 'Obunani uzaytirish';
    if (flowUpgradeAction === 'CHANGE') return "Tarifni o'zgartirish";
    return "Obuna uchun to'lov";
  }
  function renderTariffChangePreview(shop, tariff, isAnnual) {
    const key = `${shop.id}:${tariff.id}:${isAnnual ? 'ANNUAL' : 'MONTHLY'}`;
    if (tariffChangePreview?.key !== key) {
      ensureTariffChangePreviewLoaded(shop.id, tariff.id, isAnnual);
      return `<div class="plat-change-preview is-loading"><span class="spinner"></span><div><b>Qolgan obuna hisoblanmoqda</b><small>Qiymat yangi tarifga avtomatik konvertatsiya qilinadi.</small></div></div>`;
    }
    if (tariffChangePreview.loading) return `<div class="plat-change-preview is-loading"><span class="spinner"></span><div><b>Qolgan obuna hisoblanmoqda</b><small>Qiymat yangi tarifga avtomatik konvertatsiya qilinadi.</small></div></div>`;
    const d = tariffChangePreview.data;
    if (!d) return '';
    const currentDays = Math.max(0, Math.round(Number(d.remainingPaidDays || 0)));
    const convertedDays = Math.max(0, Number(d.convertedDays || 0));
    const purchasedDays = Math.max(0, Number(d.durationDays || (isAnnual ? 365 : 30)));
    const totalDays = convertedDays + purchasedDays;
    const currentName = shop.tariffName || 'Joriy tarif';
    return `
      <section class="plat-change-preview">
        <div class="plat-change-preview-head"><span>${pIcon('swap',18)}</span><div><b>Tarif o'zgarishi</b><small>Qolgan to'langan qiymatingiz kuyib ketmaydi.</small></div></div>
        <div class="plat-change-plans">
          <div><small>Hozirgi tarif</small><b>${escapeHtml(currentName)}</b><em>${currentDays} kun pullik muddat qoldi</em></div>
          <span>${pIcon('arrowRight',18)}</span>
          <div class="is-new"><small>Yangi tarif</small><b>${escapeHtml(tariff.name)}</b><em>${money(d.paidAmount || (isAnnual ? annualOfferPrice(tariff.price) : tariff.price))}</em></div>
        </div>
        <div class="plat-change-calc">
          <div><small>Qolgan qiymat</small><b>${money(d.remainingValue || 0)}</b></div>
          <div><small>Yangi tarifdagi ekvivalenti</small><b>${convertedDays ? `+${convertedDays} kun` : '0 kun'}</b></div>
          <div><small>Sotib olinayotgan davr</small><b>+${purchasedDays} kun</b></div>
        </div>
        <div class="plat-change-result"><span>${pIcon('calendar',17)}</span><div><small>Taxminiy yangi muddat</small><b>${totalDays} kun · ${formatDate(d.estimatedExpiresAt)} gacha</b></div></div>
        <p class="plat-change-note">${pIcon('info',13)} Hisob qolgan obunangizning to'langan qiymati asosida serverda bajariladi.</p>
      </section>`;
  }
  function renderPaymentMethodChoice(m) {
    const type = String(m.methodType || '').toUpperCase();
    const selected = selectedPaymentMethodType === type && selectedPaymentMethodId === m.id;
    // 2026-08-31: admin-yuklagan HAQIQIY logo bo'lsa, mijoz endi FAQAT logoni
    // ko'radi (nom/subtitle matni yo'q) — bir nechta usul yonma-yon (wrap
    // bo'lmasdan) turishi uchun. Logo bosilganda xatti-harakat ESKICHA
    // (openExternalPaymentWarning -> ogohlantirish -> havola) — faqat
    // ko'rinishi o'zgardi. Logo hali yuklanmagan (matn-belgi fallback)
    // usullar ESKI, to'liq matnli qatorda qoladi — chunki ularda rasm yo'q,
    // faqat matn identifikatsiya qiladi.
    if (m.logoUrl) {
      return `
        <button type="button" class="plat-payment-method-choice is-logo-only ${selected ? 'selected' : ''}" onclick="openExternalPaymentWarning('${m.id}')" aria-label="${escapeHtml(m.displayName || paymentProviderName(type))}">
          ${paymentMethodVisual(m)}
          ${selected ? `<em class="plat-payment-method-check">${pIcon('check',13)}</em>` : ''}
        </button>`;
    }
    return `
      <button type="button" class="plat-payment-method-choice ${selected ? 'selected' : ''}" onclick="openExternalPaymentWarning('${m.id}')">
        ${paymentMethodVisual(m)}
        <span><b>${escapeHtml(m.displayName || paymentProviderName(type))}</b><small>${selected && externalPaymentOpened ? "To'lov oynasi ochildi · qaytgach tasdiqlang" : "Bosib to'lov sahifasini oching"}</small></span>
        <em>${selected ? pIcon('check',16) : pIcon('arrowRight',16)}</em>
      </button>`;
  }
  function renderExternalPaymentWarningModal() {
    if (!pendingExternalPaymentMethodId) return '';
    const m = platformPaymentMethods.find((x) => x.id === pendingExternalPaymentMethodId);
    if (!m) return '';
    const type = String(m.methodType || '').toUpperCase();
    return `
      <div class="plat-payment-modal-backdrop" role="presentation">
        <div class="plat-payment-modal" role="dialog" aria-modal="true" aria-label="To'lovdan oldin">
          <div class="plat-payment-modal-mark">${paymentProviderBadge(type)}</div>
          <h3>Chekni saqlab turing</h3>
          <p>Do'koningiz sizga taqdim etilgunga qadar to'lov cheki yoki tasdig'ini saqlab qo'yishingizni tavsiya qilamiz. To'lov bo'yicha aniqlik kerak bo'lsa, UStorE administratori sizdan chekni so'rashi mumkin.</p>
          <label class="plat-payment-modal-check"><input type="checkbox" ${externalPaymentWarningChecked ? 'checked' : ''} onchange="setExternalPaymentWarningChecked(this.checked)"><span>Tanishdim</span></label>
          <div class="plat-payment-modal-actions">
            <button type="button" class="secondary" onclick="closeExternalPaymentWarning()">Bekor qilish</button>
            <button type="button" class="primary ${externalPaymentWarningChecked ? '' : 'plat-btn-dimmed'}" ${externalPaymentWarningChecked ? 'onclick="confirmExternalPaymentOpen()"' : 'disabled'}>Davom etish</button>
          </div>
        </div>
      </div>`;
  }
  function renderNewShopRequestIdentity() {
    const detectedId = currentTelegramUserId();
    const ownerId = newShopOwnerTelegramId || detectedId;
    if (!newShopOwnerTelegramId && detectedId) newShopOwnerTelegramId = detectedId;
    const ownerValid = /^\d{5,15}$/.test(ownerId);
    return `
      <section class="plat-payment-card plat-new-shop-identity">
        <div class="plat-payment-section-title"><span>${pIcon('shop',18)}</span><div><b>Yangi do'kon ma'lumotlari</b><small>Owner kim bo'lishini aniq belgilang.</small></div></div>
        <label class="plat-field-pro"><span>Do'kon nomi</span><input id="plat-new-shop-name" type="text" maxlength="80" value="${escapeHtml(newShopName)}" placeholder="Masalan: FITCORE" oninput="updateNewShopRequestIdentity()"></label>
        <label class="plat-field-pro"><span>Do'kon egasining Telegram IDsi</span><input id="plat-new-shop-owner" type="text" inputmode="numeric" maxlength="15" value="${escapeHtml(ownerId)}" placeholder="123456789" oninput="updateNewShopRequestIdentity()"></label>
        ${detectedId ? `<div class="plat-owner-id-hint is-ok">${pIcon('check',14)} <span><b>${escapeHtml(detectedId)}</b> — Bu sizning Telegram ID'ingiz. Fieldni boshqa owner ID'siga o'zgartirish mumkin.</span></div>` : `<div class="plat-owner-id-hint is-warn">${pIcon('info',14)}<span><b>Telegram ID avtomatik aniqlanmadi.</b> ID'ingizni qo'lda kiriting. Agar ID'ingizni bilmasangiz, UStorE botga <b>/id</b> yuboring.</span><button type="button" onclick="detectMyTelegramId()">ID'imni aniqlash</button></div>`}
        <div id="plat-owner-confirm" class="plat-owner-confirm ${ownerValid ? '' : 'is-invalid'}">${pIcon('user',15)} <span>Do'kon quyidagi Telegram ID egasiga biriktiriladi: <b>${escapeHtml(ownerId || '—')}</b></span></div>
      </section>`;
  }
  function updateNewShopRequestIdentity() {
    const nameEl = document.getElementById('plat-new-shop-name');
    const ownerEl = document.getElementById('plat-new-shop-owner');
    if (nameEl) newShopName = String(nameEl.value || '').trimStart().slice(0,80);
    if (ownerEl) newShopOwnerTelegramId = String(ownerEl.value || '').replace(/\D/g,'').slice(0,15);
    if (ownerEl && ownerEl.value !== newShopOwnerTelegramId) ownerEl.value = newShopOwnerTelegramId;
    const confirmEl = document.getElementById('plat-owner-confirm');
    const ownerValid = /^\d{5,15}$/.test(newShopOwnerTelegramId);
    const nameValid = newShopName.trim().length >= 2;
    if (confirmEl) {
      confirmEl.classList.toggle('is-invalid', !ownerValid);
      const b = confirmEl.querySelector('b'); if (b) b.textContent = newShopOwnerTelegramId || '—';
    }
    const btn = document.querySelector('.plat-payment-submit');
    if (btn) {
      const selectedExternal = selectedPaymentMethodType && selectedPaymentMethodType !== 'CARD';
      const ready = !!selectedPaymentMethodType && consentAccepted && (!selectedExternal || externalPaymentOpened) && !submittingRequest && ownerValid && nameValid;
      btn.disabled = !ready;
      btn.classList.toggle('plat-btn-dimmed', !ready);
      if (ready) btn.setAttribute('onclick','submitSubscriptionRequest()'); else btn.removeAttribute('onclick');
    }
    scheduleNewShopDraftSync();
  }
  function detectMyTelegramId() {
    const id = currentTelegramUserId();
    if (!id) { alert("Telegram ID avtomatik aniqlanmadi. UStorE botga /id yuboring va chiqqan raqamni shu yerga kiriting."); return; }
    newShopOwnerTelegramId = id;
    const el = document.getElementById('plat-new-shop-owner'); if (el) el.value = id;
    updateNewShopRequestIdentity();
  }

  function renderPaymentBody() {
    if (flowKind === 'NEW_SHOP' && flowTariffId && !preparedNewShopRequestId && !preparingNewShopDraft) {
      setTimeout(() => ensureNewShopPaymentDraft().catch((e) => {
        connectError = "To'lov arizasini tayyorlab bo'lmadi. Internetni tekshirib qayta urinib ko'ring.";
        render();
      }), 0);
    }
    const tariff = tariffs.find((t) => t.id === flowTariffId);
    const shop = flowShopId ? myShops.find((s) => s.id === flowShopId) : null;
    if (!tariff) return `<div class="plat-empty-pro"><h2>Tarif topilmadi</h2><button class="primary" onclick="openPage('TARIFFS')">Tariflarni tanlash</button></div>`;
    if (!paymentInfo) {
      ensurePaymentInfoLoaded().then(() => { if (activePage === 'PAYMENT') rerenderActivePage(); });
      return '<div class="plat-payment-loading"><span class="plat-boot-spinner"></span><b>To‘lov usullari yuklanmoqda...</b></div>';
    }
    const isAnnual = tariffBillingPeriod === 'annual';
    const totalPrice = isAnnual ? annualOfferPrice(tariff.price) : tariff.price;
    const periodLabel = isAnnual ? 'Yillik · 12 oy (2 oy bepul)' : 'Oylik · 30 kun';
    const hasCard = !!paymentInfo.cardNumber && paymentInfo.isActive !== false;
    const externalMethods = platformPaymentMethods || [];
    const hasMethods = hasCard || externalMethods.length > 0;
    const selectedExternal = selectedPaymentMethodType && selectedPaymentMethodType !== 'CARD';
    const newShopIdentityValid = flowKind !== 'NEW_SHOP' || (newShopName.trim().length >= 2 && /^\d{5,15}$/.test(newShopOwnerTelegramId));
    const readyToConfirm = !!selectedPaymentMethodType && consentAccepted && (!selectedExternal || externalPaymentOpened) && !submittingRequest && newShopIdentityValid;
    const shopLeft = shop ? daysUntil(shop.subscriptionExpiresAt) : null;
    const currentTariff = shop ? (shop.tariffName || 'Tarifsiz') : null;

    const contextIntro = flowKind === 'NEW_SHOP'
      ? `<div class="plat-checkout-intro"><span>${pIcon('shop',19)}</span><div><b>Yangi do'kon uchun obuna</b><small>Tarif va davrni tekshiring, so'ng to'lov usulini tanlang.</small></div></div>`
      : flowUpgradeAction === 'EXTEND'
        ? `<div class="plat-checkout-intro"><span>${pIcon('calendar',19)}</span><div><b>Obunani uzaytirish</b><small>Qolgan muddat saqlanadi, yangi davr amaldagi tugash sanasiga qo'shiladi.</small></div></div>`
        : `<div class="plat-checkout-intro"><span>${pIcon('swap',19)}</span><div><b>Tarifni o'zgartirish</b><small>Eski tarifdagi qolgan to'langan qiymat yangi tarifga konvertatsiya qilinadi.</small></div></div>`;

    const planContext = flowKind === 'NEW_SHOP'
      ? `<div class="plat-checkout-bonus">${pIcon('gift',15)}<span><b>Birinchi obunada +7 kun bonus</b><small>${isAnnual ? 'Yillik davrga qo‘shimcha 7 kun' : '30 kun + 7 kun = 37 kun'}</small></span></div>`
      : `<div class="plat-checkout-shop"><span class="plat-shop-avatar ${shopAvatarClass(shop)}">${shopAvatarHtml(shop)}</span><div><b>${escapeHtml(shop.shopName || shop.botUsername || shop.publicCode)}</b><small>${flowUpgradeAction === 'EXTEND' ? `${escapeHtml(currentTariff)} · ${shopLeft === null ? 'muddat noma’lum' : shopLeft <= 0 ? 'muddati tugagan' : shopLeft + ' kun qoldi'}` : `${escapeHtml(currentTariff)} → ${escapeHtml(tariff.name)}`}</small></div></div>`;

    return `
      ${contextIntro}
      ${flowKind === 'NEW_SHOP' ? renderNewShopRequestIdentity() : ''}
      <section class="plat-payment-period is-compact"><div class="plat-payment-period-label"><b>Obuna davri</b><small>Oylik yoki yillik variant.</small></div>${renderBillingToggle()}</section>

      <section class="plat-checkout-plan plat-tariff-tone-${tariffTone(tariff)}">
        <div class="plat-checkout-plan-top"><span class="plat-tariff-symbol">${pIcon(tariffTone(tariff) === 'premium' ? 'diamond' : tariffTone(tariff) === 'business' ? 'bag' : tariffTone(tariff) === 'standard' ? 'bolt' : 'shop',19)}</span><div><small>Tanlangan tarif</small><h2>${escapeHtml(tariff.name)}</h2><span class="plat-checkout-limit">${limitLabel(tariff.productLimit)}</span></div><strong>${money(totalPrice)}<small>/${isAnnual ? 'yil' : 'oy'}</small></strong></div>
        ${planContext}
      </section>

      ${flowKind === 'UPGRADE' && flowUpgradeAction === 'CHANGE' && shop ? renderTariffChangePreview(shop, tariff, isAnnual) : ''}

      <section class="plat-payment-card plat-payment-methods-card">
        <div class="plat-payment-section-title"><span>${pIcon('wallet',18)}</span><div><b>To'lov usulini tanlang</b><small>Faqat faol usullar ko'rsatiladi.</small></div></div>
        ${hasMethods ? `<div class="plat-payment-method-grid">
          ${hasCard ? `<button type="button" class="plat-payment-method-choice ${selectedPaymentMethodType === 'CARD' ? 'selected' : ''}" onclick="selectCardPayment()">${paymentProviderBadge('CARD')}<span><b>Karta orqali</b><small>${selectedPaymentMethodType === 'CARD' ? 'Karta rekvizitlari quyida' : "Karta raqamini ko'rish"}</small></span><em>${selectedPaymentMethodType === 'CARD' ? pIcon('check',16) : '›'}</em></button>` : ''}
          ${externalMethods.map(renderPaymentMethodChoice).join('')}
        </div>` : `<div class="plat-payment-empty-methods"><span>${pIcon('wallet',20)}</span><div><b>Hozircha to'lov usuli mavjud emas</b><small>Administrator to'lov usulini faollashtirgach shu yerda ko'rinadi.</small></div></div>`}
        ${selectedPaymentMethodType === 'CARD' && hasCard ? `<div class="plat-payment-bank-card is-selected"><div><small>Karta raqami</small><span id="plat-card-number" class="plat-card-number">${escapeHtml(paymentInfo.cardNumber)}</span>${paymentInfo.cardHolder ? `<small class="plat-card-holder">${escapeHtml(paymentInfo.cardHolder)}</small>` : ''}</div><button class="plat-copy-btn" onclick="copyPlatformCardNumber()">${pIcon('copy',14)} Nusxa olish</button></div>` : ''}
        ${selectedExternal && externalPaymentOpened ? `<div class="plat-payment-return-hint">${pIcon('check',15)}<span><b>${escapeHtml(paymentProviderName(selectedPaymentMethodType))} oynasi ochildi.</b><small>To'lovni bajargach UStorE'ga qayting va pastdagi “To'lovni tasdiqlash” tugmasini bosing.</small></span></div>` : ''}
      </section>

      <section class="plat-payment-card plat-receipt-compact">
        <div class="plat-payment-section-title"><span>${pIcon('upload',18)}</span><div><b>Chek biriktirish <em>ixtiyoriy</em></b><small>JPG, PNG yoki WEBP · maksimal 6 MB</small></div></div>
        <input type="file" id="plat-receipt-input" class="hidden" onchange="onReceiptPicked(event)">
        ${receiptFile ? `<div class="plat-upload-selected">${receiptPreviewUrl ? `<img src="${receiptPreviewUrl}" alt="Chek preview">` : `<span>${pIcon('file',20)}</span>`}<div><b>${escapeHtml(receiptFile.name)}</b><small>${Math.max(1, Math.round(receiptFile.size / 1024))} KB</small></div><button class="secondary" onclick="document.getElementById('plat-receipt-input').click()">Almashtirish</button><button class="plat-upload-remove" onclick="clearReceiptFile()" aria-label="Chekni olib tashlash">×</button></div>` : `<button class="plat-upload-zone is-compact" onclick="document.getElementById('plat-receipt-input').click()"><span>${pIcon('upload',20)}</span><div><b>Fayldan chek tanlash</b><small>Chekni hozir yuklash shart emas</small></div></button>`}
        <p class="plat-receipt-hint">To'lovda aniqlik kerak bo'lsa, administrator chekni keyinroq so'rashi mumkin.</p>
        ${connectError ? `<div class="notice error">${escapeHtml(connectError)}</div>` : ''}
      </section>

      <section class="plat-payment-card plat-payment-consent">
        <label class="plat-checkbox-row">
          <input type="checkbox" id="plat-consent-checkbox" ${consentAccepted ? 'checked' : ''} onchange="setConsentAccepted(this.checked)">
          <span>Men UStorE <a href="#" onclick="event.preventDefault(); openTermsPage('PAYMENT');">Foydalanish shartlari</a> va <a href="#" onclick="event.preventDefault(); openPrivacyPage('PAYMENT');">Maxfiylik siyosati</a> bilan tanishdim va roziman.</span>
        </label>
      </section>

      <section class="plat-payment-total is-professional">
        <div><span>Tarif</span><b>${escapeHtml(tariff.name)}</b></div>
        <div><span>Davr</span><b>${isAnnual ? '12 oy' : (flowKind === 'NEW_SHOP' ? '30 kun + 7 kun bonus' : '30 kun')}</b></div>
        ${selectedPaymentMethodType ? `<div><span>To'lov usuli</span><b class="plat-total-method">${paymentProviderBadge(selectedPaymentMethodType, true)} ${escapeHtml(paymentProviderName(selectedPaymentMethodType))}</b></div>` : ''}
        <div class="is-total"><span>Jami to'lov</span><strong>${money(totalPrice)}</strong></div>
      </section>
      <button class="primary plat-payment-submit ${readyToConfirm ? '' : 'plat-btn-dimmed'}" ${readyToConfirm ? 'onclick="submitSubscriptionRequest()"' : 'disabled'}>
        ${submittingRequest ? '<span class="spinner"></span> Tasdiqlanmoqda...' : selectedPaymentMethodType ? `${pIcon('check',16)} To'lovni tasdiqlash` : `${pIcon('wallet',16)} To'lov usulini tanlang`}
      </button>
      ${renderExternalPaymentWarningModal()}
    `;
  }
  function selectCardPayment() {
    selectedPaymentMethodType = 'CARD';
    selectedPaymentMethodId = null;
    externalPaymentOpened = false;
    pendingExternalPaymentMethodId = null;
    externalPaymentWarningChecked = false;
    rerenderActivePage();
  }
  function renderExternalPaymentMethodRow(m) { return renderPaymentMethodChoice(m); }
  async function openExternalPaymentDirect(methodId) {
    const m = platformPaymentMethods.find((x) => x.id === methodId);
    if (!m?.paymentUrl) return;
    if (flowKind === 'NEW_SHOP' && !preparedNewShopRequestId) {
      try { await ensureNewShopPaymentDraft(false); }
      catch (_) { alert("To'lov arizasini saqlab bo'lmadi. Internetni tekshirib qayta urinib ko'ring."); return; }
    }
    selectedPaymentMethodType = String(m.methodType || '').toUpperCase();
    selectedPaymentMethodId = m.id;
    externalPaymentOpened = true;
    pendingExternalPaymentMethodId = null;
    externalPaymentWarningChecked = false;
    render();
    setTimeout(() => {
      try { if (tg?.openLink) tg.openLink(m.paymentUrl); else window.open(m.paymentUrl, '_blank'); }
      catch (_) { window.open(m.paymentUrl, '_blank'); }
    }, 20);
  }
  function openExternalPaymentWarning(methodId) {
    pendingExternalPaymentMethodId = methodId;
    externalPaymentWarningChecked = false;
    rerenderActivePage();
  }
  function closeExternalPaymentWarning() {
    pendingExternalPaymentMethodId = null;
    externalPaymentWarningChecked = false;
    rerenderActivePage();
  }
  function setExternalPaymentWarningChecked(checked) { externalPaymentWarningChecked = checked; rerenderActivePage(); }
  function confirmExternalPaymentOpen() {
    const m = platformPaymentMethods.find((x) => x.id === pendingExternalPaymentMethodId);
    if (!m?.paymentUrl || !externalPaymentWarningChecked) return;
    selectedPaymentMethodType = String(m.methodType || '').toUpperCase();
    selectedPaymentMethodId = m.id;
    externalPaymentOpened = true;
    pendingExternalPaymentMethodId = null;
    externalPaymentWarningChecked = false;
    rerenderActivePage();
    setTimeout(() => {
      try { if (tg?.openLink) tg.openLink(m.paymentUrl); else window.open(m.paymentUrl, '_blank'); }
      catch (_) { window.open(m.paymentUrl, '_blank'); }
    }, 20);
  }
  function clearReceiptFile() {
    receiptFile = null;
    if (receiptPreviewUrl) { try { URL.revokeObjectURL(receiptPreviewUrl); } catch (_) {} }
    receiptPreviewUrl = null;
    rerenderActivePage();
  }
  function setConsentAccepted(checked) { consentAccepted = checked; rerenderActivePage(); }
  function copyPlatformCardNumber() {
    const el = document.getElementById('plat-card-number');
    const text = el ? el.textContent : '';
    const finish = (ok) => {
      const btn = document.querySelector('.plat-copy-btn');
      if (btn) { const old = btn.textContent; btn.textContent = ok ? '✅ Nusxalandi' : "❌ Bo'lmadi"; setTimeout(() => { btn.textContent = old; }, 1500); }
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => finish(true)).catch(() => finish(false));
      return;
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      finish(ok);
    } catch (_) { finish(false); }
  }
  function onReceiptPicked(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { connectError = "Faqat JPG, PNG yoki WebP rasm qabul qilinadi."; render(); return; }
    if (file.size > 6 * 1024 * 1024) { connectError = "Rasm hajmi 6MB dan katta bo'lmasin."; render(); return; }
    connectError = null;
    receiptFile = file;
    if (receiptPreviewUrl) { try { URL.revokeObjectURL(receiptPreviewUrl); } catch (_) {} }
    receiptPreviewUrl = URL.createObjectURL(file);
    rerenderActivePage();
  }
  // ROOT-CAUSE FIX (2026-08-30): reader.onerror = reject used to pass the
  // raw FileReader `error` EVENT (a ProgressEvent, not an Error) straight
  // through as the rejection reason — every caller's `catch (e) { alert(e.
  // message || String(e)); }` then showed the user a literal, meaningless
  // "[object ProgressEvent]" (ProgressEvent has no .message, so it fell
  // through to String(e)). Wrapping it in a real Error with a readable
  // message fixes this for EVERY caller at once (receipt uploads, bug
  // report attachments, notification template images, payment method
  // logos — all six call sites share this one helper).
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi. Qaytadan urinib ko'ring."));
      reader.readAsDataURL(file);
    });
  }
  async function submitSubscriptionRequest() {
    if (submittingRequest) return;
    if (flowKind === 'NEW_SHOP') {
      newShopName = String(document.getElementById('plat-new-shop-name')?.value || newShopName || '').trim();
      newShopOwnerTelegramId = String(document.getElementById('plat-new-shop-owner')?.value || newShopOwnerTelegramId || '').replace(/\D/g,'').slice(0,15);
      if (newShopName.length < 2) { alert("Do'kon nomini kiriting."); return; }
      if (!/^\d{5,15}$/.test(newShopOwnerTelegramId)) { alert("Do'kon egasining Telegram ID sini to'g'ri kiriting."); return; }
    }
    if (!selectedPaymentMethodType) { alert("Avval to'lov usulini tanlang."); return; }
    if (!consentAccepted) { alert("Davom etish uchun Foydalanish shartlari va Maxfiylik siyosatiga rozilik bildiring."); return; }
    if (selectedPaymentMethodType !== 'CARD' && !externalPaymentOpened) { alert("Avval tanlangan to'lov usuliga o'tib to'lovni amalga oshiring."); return; }
    const hasCard = !!paymentInfo?.cardNumber && paymentInfo?.isActive !== false;
    if (selectedPaymentMethodType === 'CARD' && !hasCard) { alert("Karta orqali to'lov hozir faol emas."); return; }
    const selectedExternalMethod = selectedPaymentMethodId ? platformPaymentMethods.find((m) => m.id === selectedPaymentMethodId) : null;
    if (selectedPaymentMethodType !== 'CARD' && (!selectedExternalMethod || String(selectedExternalMethod.methodType).toUpperCase() !== selectedPaymentMethodType)) {
      alert("Tanlangan to'lov usuli topilmadi. Qayta tanlang.");
      return;
    }

    submittingRequest = true;
    connectError = null;
    rerenderActivePage();
    try {
      const receiptImageUpload = receiptFile ? { base64: await fileToBase64(receiptFile), mimeType: receiptFile.type, fileName: receiptFile.name } : undefined;
      const result = await callPlatformApi('platform_submit_subscription_request', {
        kind: flowKind, shopId: flowShopId || undefined, tariffId: flowTariffId,
        requestId: flowKind === 'NEW_SHOP' ? (preparedNewShopRequestId || undefined) : undefined,
        billingPeriod: tariffBillingPeriod, upgradeAction: flowUpgradeAction || undefined,
        requesterUsername: (tg?.initDataUnsafe?.user?.username) || null,
        requesterFirstName: (tg?.initDataUnsafe?.user?.first_name) || null,
        receiptImageUpload,
        paymentMethod: selectedPaymentMethodType,
        paymentMethodId: selectedPaymentMethodId || undefined,
        consentAccepted: true,
        shopName: flowKind === 'NEW_SHOP' ? newShopName.trim() : undefined,
        ownerTelegramId: flowKind === 'NEW_SHOP' ? newShopOwnerTelegramId : undefined,
      });
      lastSubmittedRequestId = result.requestId;
      lastSubmittedHadReceipt = !!receiptFile;
      paymentClaimConfirmed = !!receiptFile;
      if (flowKind === 'NEW_SHOP') {
        preparedNewShopRequestId = result.requestId;
        preparedNewShopPaymentDeadlineAt = null;
      }

      // User aynan "To'lovni tasdiqlash"ni bosgan payt server vaqti bilan
      // payment_claimed_at yozilsin. Chek bo'lsa submitning o'zi allaqachon
      // server timestamp qo'yadi; cheksiz holatda shu zahoti claim qilamiz.
      if (!receiptFile) {
        try {
          await callPlatformApi('platform_confirm_payment_claim', { requestId: result.requestId });
          paymentClaimConfirmed = true;
        } catch (claimErr) {
          console.error('payment claim confirm error', claimErr);
          paymentClaimConfirmed = false; // REQUEST_SENT'da qayta urinish chiqadi
        }
      }

      receiptFile = null;
      if (receiptPreviewUrl) { try { URL.revokeObjectURL(receiptPreviewUrl); } catch (_) {} }
      receiptPreviewUrl = null;
      try { await loadMyRequests(false); } catch (_) {}
      openPage('REQUEST_SENT');
    } catch (e) {
      connectError = e.message || String(e);
      rerenderActivePage();
    } finally {
      submittingRequest = false;
    }
  }

  function renderRequestSentBody() {
    const shop = flowShopId ? myShops.find((s) => s.id === flowShopId) : null;
    const context = flowKind === 'NEW_SHOP'
      ? "To'lov tasdiqlangach UStorE administratori yangi do'koningizni tayyorlaydi."
      : flowUpgradeAction === 'EXTEND'
        ? "Tasdiqlangach obuna muddati mavjud tugash sanasining ustiga qo'shiladi."
        : `Tasdiqlangach ${shop ? escapeHtml(shop.shopName || shop.botUsername || 'do‘kon') : 'do‘kon'} uchun yangi tarif faollashadi.`;
    const needsClaimRetry = !paymentClaimConfirmed;
    return `
      <div class="plat-request-success">
        <span>${pIcon('check',26)}</span><h2>To'lov tasdiqlash uchun yuborildi</h2>
        <p>${needsClaimRetry ? "So'rov yaratildi, lekin vaqtni tasdiqlashda aloqa uzildi. Pastdagi tugmani yana bir marta bosing." : "Ma'lumotingiz qabul qilindi. Administrator to'lovni tekshiradi va natija Telegram orqali yuboriladi."}</p>
        <div class="plat-request-status">${pIcon('clock',15)} Tekshirilmoqda</div>
        ${needsClaimRetry ? `
          <div class="plat-payment-claim-box is-soft">
            <p>${pIcon('info',15)} To'lovni qilgan bo'lsangiz, vaqtni serverda qayd etish uchun tasdiqlang.</p>
            <button class="primary ${paymentClaimSubmitting ? 'plat-btn-dimmed' : ''}" onclick="confirmPaymentClaim()">${paymentClaimSubmitting ? '<span class="spinner"></span> Tasdiqlanmoqda...' : `${pIcon('check',15)} To'lovni tasdiqlash`}</button>
          </div>
        ` : `<div class="plat-payment-claim-done">${pIcon('check',15)} To'lov vaqti serverda qayd etildi.</div>`}
        ${!lastSubmittedHadReceipt ? `<div class="plat-request-receipt-note">${pIcon('file',14)}<span>Chek biriktirilmagan — bu majburiy emas. Kerak bo'lsa administrator sizdan keyinroq so'raydi.</span></div>` : ''}
        <div class="plat-request-context">${context}</div>
        <button class="primary" onclick="goHomePage()">Bosh sahifaga qaytish</button>
      </div>`;
  }

  async function confirmPaymentClaim() {
    if (paymentClaimSubmitting || !lastSubmittedRequestId) return;
    paymentClaimSubmitting = true;
    rerenderActivePage();
    try {
      await callPlatformApi('platform_confirm_payment_claim', { requestId: lastSubmittedRequestId });
      paymentClaimConfirmed = true;
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      paymentClaimSubmitting = false;
      rerenderActivePage();
    }
  }
  function onRequestSentReceiptPicked(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { alert("Faqat JPG, PNG yoki WebP rasm qabul qilinadi."); return; }
    if (file.size > 6 * 1024 * 1024) { alert("Rasm hajmi 6MB dan katta bo'lmasin."); return; }
    requestSentReceiptFile = file;
    if (requestSentReceiptPreviewUrl) { try { URL.revokeObjectURL(requestSentReceiptPreviewUrl); } catch (_) {} }
    requestSentReceiptPreviewUrl = URL.createObjectURL(file);
    rerenderActivePage();
  }
  function clearRequestSentReceiptFile() {
    requestSentReceiptFile = null;
    if (requestSentReceiptPreviewUrl) { try { URL.revokeObjectURL(requestSentReceiptPreviewUrl); } catch (_) {} }
    requestSentReceiptPreviewUrl = null;
    rerenderActivePage();
  }
  async function attachReceiptToSentRequest() {
    if (attachingRequestReceipt || !requestSentReceiptFile || !lastSubmittedRequestId) return;
    attachingRequestReceipt = true;
    rerenderActivePage();
    try {
      const base64 = await fileToBase64(requestSentReceiptFile);
      await callPlatformApi('platform_attach_request_receipt', {
        requestId: lastSubmittedRequestId,
        receiptImageUpload: { base64, mimeType: requestSentReceiptFile.type, fileName: requestSentReceiptFile.name },
      });
      lastSubmittedHadReceipt = true;
      clearRequestSentReceiptFile();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      attachingRequestReceipt = false;
      rerenderActivePage();
    }
  }

  // ======================================================================
  // 2026-08-27, USER platform redesign 5-band: do'koni BOR user uchun Bosh
  // sahifa — landing o'rniga amaliy dashboard. Faqat REAL ma'lumot: fake
  // reyting/faoliyat/"12 kun" kabi hardcode raqam yo'q — barchasi
  // myShops (platform_list_my_shops, boot()da yuklangan) va mySupportTickets
  // dan.
  // ======================================================================
  function renderShopDashboard() {
    if (!dashboardShopId || !myShops.some((shop) => shop.id === dashboardShopId)) dashboardShopId = myShops[0].id;
    const s = myShops.find((shop) => shop.id === dashboardShopId) || myShops[0];
    const left = daysUntil(s.subscriptionExpiresAt);
    const unreadSupport = mySupportTickets.filter((ticket) => ticket.status === 'ANSWERED').length;
    const alerts = [];
    if (!s.tariffId || !s.tariffName) {
      alerts.push(['diamond', 'Tarif tanlanmagan', 'Obunani faollashtirib do‘kon imkoniyatlarini yoqing.', `startUpgradeFor('${s.id}')`, 'warn']);
    } else if (left !== null && left <= 7) {
      alerts.push(['calendar', left <= 0 ? 'Obuna muddati tugagan' : `Obuna tugashiga ${left} kun qoldi`, "Do'kon uzluksiz ishlashi uchun obunani yangilang.", `startExtendFor('${s.id}')`, left <= 1 ? 'danger' : 'warn']);
    }
    if (unreadSupport > 0) alerts.push(['chat', `${unreadSupport} ta yangi javob`, 'Support javoblarini ko‘ring.', "openSupportPage()", 'info']);
    const productLimit = s.productLimit ?? null;
    const usedProducts = Number(s.usedProductCount || 0);
    const productPct = productLimit ? Math.min(100, Math.round(usedProducts / productLimit * 100)) : null;
    const tabsClass = myShops.length === 1 ? 'is-one' : myShops.length === 2 ? 'is-two' : 'is-many';
    const shopAction = s.botUsername
      ? `<a class="primary plat-dashboard-open-shop" href="https://t.me/${escapeHtml(s.botUsername)}" target="_blank" rel="noopener">${pIcon('shop',15)} Do'konni ochish</a>`
      : '';
    return `
      <div class="plat-dashboard-head"><div><p class="plat-dashboard-eyebrow">Mening do'konlarim</p><h1>${myShops.length} ta ulangan do'kon</h1></div><button class="plat-icon-button" onclick="switchTab('shops')" aria-label="Do‘konlarim">${pIcon('shop',17)}</button></div>
      <div class="plat-dashboard-shop-tabs ${tabsClass}">
        ${myShops.map((shop)=>{ const d=daysUntil(shop.subscriptionExpiresAt); const active=shop.id===s.id; const plan=shop.tariffName || 'Tarifsiz'; return `<button class="plat-dashboard-shop-card ${active?'active':''}" onclick="setDashboardShop('${shop.id}')"><span class="plat-shop-avatar ${shopAvatarClass(shop)}">${shopAvatarHtml(shop)}</span><span class="plat-dashboard-shop-copy"><b>${escapeHtml(shop.shopName || shop.botUsername || shop.publicCode)}</b><small>${escapeHtml(plan)}</small><em class="${d!==null&&d<=7?'is-warn':''}">${d===null?'Obuna ma’lumoti yo‘q':d<=0?'Obuna tugagan':`Obunaga ${d} kun qoldi`}</em></span><span class="status-dot ${shop.status==='ACTIVE'?'ok':''}"></span></button>`; }).join('')}
      </div>

      <section class="card plat-dashboard-focus">
        <div class="plat-dashboard-focus-title"><div><small>Tanlangan do'kon</small><h2>${escapeHtml(s.shopName || s.botUsername || s.publicCode)}</h2><p>${escapeHtml(s.tariffName || 'Tarifsiz')}${left === null ? '' : left <= 0 ? ' · Obuna tugagan' : ` · ${left} kun qoldi`}</p></div><span class="status-pill status-${s.status}">${statusLabel(s.status)}</span></div>
        <div class="plat-dashboard-kpis">
          <div class="tone-blue"><span>${pIcon('bag',18)}</span><small>Bugungi buyurtmalar</small><b>${Number(s.ordersToday || 0)}</b></div>
          <div class="tone-violet"><span>${pIcon('box',18)}</span><small>Mahsulotlar</small><b>${usedProducts}</b>${productPct!==null?`<em>${productPct}% limit</em>`:''}</div>
          <div class="tone-green"><span>${pIcon('chat',18)}</span><small>Yangi xabarlar</small><b>${unreadSupport}</b></div>
          <div class="tone-amber"><span>${pIcon('diamond',18)}</span><small>Tarif</small><b class="textual">${escapeHtml(s.tariffName || 'Tarifsiz')}</b></div>
        </div>
        ${shopAction ? `<div class="plat-dashboard-focus-actions">${shopAction}</div>` : ''}
      </section>

      ${alerts.length ? `<section><h2 class="plat-section-title">Diqqat talab qiladi</h2><div class="card plat-alert-list">${alerts.map(([icon,title,sub,action,tone])=>`<button class="plat-alert-row tone-${tone}" onclick="${action}"><span class="plat-alert-icon">${pIcon(icon,16)}</span><span><b>${title}</b><small>${sub}</small></span><span class="plat-alert-chevron">›</span></button>`).join('')}</div></section>` : `<div class="plat-health-strip">${pIcon('check',17)}<div><b>Hammasi joyida</b><small>Hozircha e'tibor talab qiladigan holat yo'q.</small></div></div>`}
    `;
  }

  function toggleDashboardShopMenu(event) {
    event?.stopPropagation?.();
    document.getElementById('plat-dashboard-shop-menu')?.classList.toggle('hidden');
  }

  // ======================================================================
  // ODDIY FOYDALANUVCHI: Do'konlarim, Obuna, Yordam, Profil
  // ======================================================================
  // Do'kon logotipi/rasmi bo'lmasa harf-fallback (screenshotda ham har bir
  // karta o'z logosi bilan, lekin ko'p do'konda hali logo yuklanmagan bo'lishi
  // mumkin — shop-app'dagi bir xil "birinchi harf doira" naqshi).
  function shopAvatarHtml(s) {
    if (s.logoUrl) return `<img src="${escapeHtml(s.logoUrl)}" class="plat-shop-avatar-img" alt="">`;
    const label = (s.shopName || s.botUsername || s.publicCode || '?').trim().charAt(0).toUpperCase();
    return `<span class="plat-shop-avatar-fallback">${escapeHtml(label)}</span>`;
  }
  // POLISH ROUND (Shop App task 1's follow-on): do'kon logotipi endi 4:1
  // majburiy — shu sabab HAQIQIY logo bo'lgan kartalarda `.plat-shop-avatar`
  // kvadratdan kengroq to'rtburchakka o'tishi kerak (CSS'da `.is-logo`
  // modifikatori), LEKIN logo yo'q (harf-fallback) holatda ESKI kvadrat
  // ko'rinish TO'LIQ saqlanadi — shu sabab bu ikkalasi ALOHIDA klass.
  function shopAvatarClass(s) { return s.logoUrl ? 'is-logo' : ''; }
  function shopStatusRowHtml(s) {
    const left = daysUntil(s.subscriptionExpiresAt);
    if (!s.botUsername) return `<div class="plat-shop-status-row is-warn">${pIcon('bolt', 14)}<span>Bot ulanmagan</span></div>`;
    if (left !== null && left <= 0) return `<div class="plat-shop-status-row is-danger">${pIcon('calendar', 14)}<span>Obuna tugagan</span></div>`;
    if (left !== null && left <= 7) return `<div class="plat-shop-status-row is-warn">${pIcon('calendar', 14)}<span>Obuna tez orada tugaydi. Uzaytirishni unutmang.</span></div>`;
    if (s.status === 'ACTIVE') return `<div class="plat-shop-status-row is-ok">${pIcon('check', 14)}<span>Bot ulangan va ishlayapti</span></div>`;
    return '';
  }
  function renderMyShopsTab() {
    const activeCount = myShops.filter((s) => s.status === 'ACTIVE').length;
    const noPlanCount = myShops.filter((s) => !s.tariffId || !s.subscriptionExpiresAt).length;
    const expiringCount = myShops.filter((s) => { const d = daysUntil(s.subscriptionExpiresAt); return d !== null && d >= 0 && d <= 7; }).length;
    if (!myShops.length) return `<div class="plat-empty-pro"><span>${pIcon('shop',30)}</span><h1>Hozircha do'kon yo'q</h1><p>Yangi do'kon yaratish uchun tarifni tanlang.</p><button class="primary" onclick="startNewShopFlow()">${pIcon('plus',16)} Yangi do'kon yaratish</button></div>`;
    const thirdCount = noPlanCount > 0 ? noPlanCount : expiringCount;
    const thirdLabel = noPlanCount > 0 ? 'Tarifsiz' : 'Tez tugaydi';
    return `
      <div class="plat-tab-head plat-shops-head"><div><h1>Do'konlarim</h1><p>${myShops.length} ta ulangan do'kon</p></div><button class="primary plat-new-shop-main" onclick="startNewShopFlow()">${pIcon('plus',16)} Yangi do'kon</button></div>
      <div class="plat-summary-strip plat-shops-summary"><div><span class="tone-blue">${pIcon('shop',16)}</span><b>${myShops.length}</b><small>Do'kon</small></div><div><span class="tone-green">${pIcon('check',16)}</span><b>${activeCount}</b><small>Faol</small></div><div><span class="tone-amber">${pIcon(noPlanCount > 0 ? 'diamond' : 'calendar',16)}</span><b>${thirdCount}</b><small>${thirdLabel}</small></div></div>
      <div class="plat-shop-list-simple">${myShops.map((shop) => {
        const left = daysUntil(shop.subscriptionExpiresAt);
        const noPlan = !shop.tariffId || !shop.subscriptionExpiresAt;
        const warn = left !== null && left >= 0 && left <= 7;
        const expiry = noPlan ? 'Obuna yo‘q' : left === null ? 'Muddat noma’lum' : left <= 0 ? 'Obuna tugagan' : `${left} kun qoldi`;
        return `<button class="plat-shop-list-card ${warn ? 'is-expiring' : ''}" onclick="openMyShopManage('${shop.id}')">
          <span class="plat-shop-avatar plat-shop-avatar-lg ${shopAvatarClass(shop)}">${shopAvatarHtml(shop)}</span>
          <div class="plat-shop-list-main"><div class="plat-shop-list-title"><b>${escapeHtml(shop.shopName || shop.botUsername || shop.publicCode)}</b><span class="status-pill status-${shop.status}">${statusLabel(shop.status)}</span></div>${shop.botUsername ? `<small>@${escapeHtml(shop.botUsername)}</small>` : ''}<div class="plat-shop-list-meta"><span>${pIcon('diamond',13)} ${escapeHtml(shop.tariffName || 'Tarifsiz')}</span><span class="${warn ? 'is-warn' : ''}">${pIcon('calendar',13)} ${expiry}</span></div></div>
          <span class="plat-shop-list-chevron">›</span>
        </button>`;
      }).join('')}</div>
      <div class="plat-shops-info">${pIcon('info',15)}<span>Do'kon kartasini bosing — barcha boshqaruv va obuna amallari detail sahifada.</span></div>
    `;
  }

  function openMyShopManage(shopId) {
    dashboardShopId = shopId;
    openPage('MY_SHOP_DETAILS');
  }
  function renderMyShopDetailsBody() {
    const shop = myShops.find((s) => s.id === dashboardShopId) || null;
    if (!shop) return `<div class="plat-empty-pro"><h2>Do'kon topilmadi</h2><button class="primary" onclick="switchTab('shops')">Do'konlarimga qaytish</button></div>`;
    const left = daysUntil(shop.subscriptionExpiresAt);
    const limit = shop.productLimit ?? null;
    const used = Number(shop.usedProductCount || 0);
    const pct = limit ? Math.min(100, Math.round(used / limit * 100)) : null;
    const tariff = tariffs.find((t) => t.id === shop.tariffId);
    const noPlan = !shop.tariffId || !shop.subscriptionExpiresAt;
    const warn = left !== null && left >= 0 && left <= 7;
    return `
      <section class="plat-shop-detail-hero ${warn ? 'is-expiring' : ''}">
        <span class="plat-shop-avatar plat-shop-detail-avatar ${shopAvatarClass(shop)}">${shopAvatarHtml(shop)}</span>
        <div><div class="plat-shop-detail-name"><h2>${escapeHtml(shop.shopName || shop.botUsername || shop.publicCode)}</h2><span class="status-pill status-${shop.status}">${statusLabel(shop.status)}</span></div>${shop.botUsername ? `<p>@${escapeHtml(shop.botUsername)}</p>` : '<p>Bot ulanmoqda</p>'}<span class="plan-pill">${escapeHtml(shop.tariffName || 'Tarifsiz')}</span></div>
      </section>
      <section class="plat-shop-detail-card">
        <div class="plat-section-heading"><div><h2>Do'kon holati</h2><p>Asosiy ko'rsatkichlar va joriy obuna.</p></div></div>
        <div class="plat-shop-detail-metrics"><div><span>${pIcon('box',17)}</span><small>Mahsulotlar</small><b>${used}${limit !== null ? ` / ${limit}` : ''}</b>${pct !== null ? `<div class="mini-progress"><i style="width:${pct}%"></i></div><em>${pct}% foydalanilgan</em>` : ''}</div><div class="${warn ? 'is-warn' : ''}"><span>${pIcon('calendar',17)}</span><small>Obuna</small><b>${noPlan ? 'Tarif tanlanmagan' : left === null ? 'Muddat noma’lum' : left <= 0 ? 'Tugagan' : `${left} kun qoldi`}</b><em>${shop.subscriptionExpiresAt ? formatDate(shop.subscriptionExpiresAt) + ' gacha' : 'Obuna sanasi yo‘q'}</em></div></div>
      </section>
      <section class="plat-shop-detail-card plat-shop-sub-manage">
        <div class="plat-section-heading"><div><h2>Obunani boshqarish</h2><p>${noPlan ? "Tarif tanlab do'kon obunasini faollashtiring." : `Joriy tarif: ${escapeHtml(shop.tariffName || '')}${tariff ? ` · ${money(tariff.price)}/oy` : ''}`}</p></div></div>
        ${noPlan ? `<button class="primary" onclick="startUpgradeFor('${shop.id}')">${pIcon('diamond',16)} Tarif tanlash</button>` : `<div class="plat-shop-detail-actions"><button class="primary" onclick="startExtendFor('${shop.id}')">${pIcon('calendar',16)} Obunani uzaytirish</button><button class="secondary" onclick="startUpgradeFor('${shop.id}')">${pIcon('swap',16)} Tarifni o'zgartirish</button></div><div class="plat-preserve-days-note">${pIcon('check',15)}<span>Istalgan vaqtda uzaytirishingiz mumkin. Qolgan kunlar kuyib ketmaydi — yangi muddat mavjud tugash sanasiga qo'shiladi.</span></div>`}
      </section>
      <section class="plat-shop-detail-card">
        <div class="plat-section-heading"><div><h2>Do'kon boshqaruvi</h2><p>Do'konning o'z boshqaruv paneliga o'ting.</p></div></div>
        ${shop.botUsername ? `<a class="primary plat-shop-open-main" href="https://t.me/${escapeHtml(shop.botUsername)}" target="_blank" rel="noopener">${pIcon('shop',16)} Do'konni ochish</a>` : `<button class="secondary" disabled>${pIcon('shop',16)} Bot hali ulanmagan</button>`}
        <div class="plat-shop-detail-info-grid"><div><span>${pIcon('bag',15)}</span><b>Bugungi buyurtmalar</b><strong>${Number(shop.ordersToday || 0)}</strong></div><div><span>${pIcon('chat',15)}</span><b>Jami buyurtmalar</b><strong>${Number(shop.usedOrderCount || 0)}</strong></div></div>
      </section>
    `;
  }

  function renderSubscriptionTab() {
    return `
      <div class="plat-tab-head"><div><h1>Obuna</h1><p>Biznesingizga mos tarifni tanlang. Istalgan vaqtda uzaytirish yoki o'zgartirish mumkin.</p></div></div>
      ${renderBillingToggle()}
      <div class="plat-subscription-tariff-list">${renderTariffCards(false, { ctaLabel: 'Sotib olish' })}</div>
      <div class="plat-bonus-card plat-bonus-card-pro"><span class="plat-bonus-icon">${pIcon('gift',18)}</span><div><b>Birinchi obunada +7 kun bonus</b><p>Yangi do'konning birinchi obunasida qo'llanadi.</p></div></div>
    `;
  }
  function setDashboardShop(shopId) { dashboardShopId = shopId; render(); }
  function startExtendFor(shopId) {
    const shop = myShops.find((s) => s.id === shopId);
    if (!shop?.tariffId) { startUpgradeFor(shopId); return; }
    flowKind = 'UPGRADE';
    flowEntry = activePage === 'SUBSCRIPTION_TARGET' ? 'SUBSCRIPTION_CATALOG' : 'SHOP_DETAIL';
    flowShopId = shopId;
    flowTariffId = shop.tariffId;
    flowUpgradeAction = 'EXTEND';
    flowReturnPage = activePage === 'SUBSCRIPTION_TARGET' ? 'SUBSCRIPTION_TARGET' : 'MY_SHOP_DETAILS';
    selectedPaymentMethodType = null;
    selectedPaymentMethodId = null;
    externalPaymentOpened = false;
    consentAccepted = false;
    openPage('PAYMENT');
  }
  function startUpgradeFor(shopId) {
    flowKind = 'UPGRADE';
    flowEntry = 'SHOP_DETAIL';
    flowShopId = shopId;
    flowTariffId = null;
    flowUpgradeAction = 'CHANGE';
    flowReturnPage = 'MY_SHOP_DETAILS';
    selectedPaymentMethodType = null;
    selectedPaymentMethodId = null;
    externalPaymentOpened = false;
    consentAccepted = false;
    openPage('TARIFFS');
  }

  // 8.2/9-band: birinchi 3 tasi navigation card (qo'llanma sahifasiga
  // o'tadi), oxirgi 2 tasi (support/muammo) action card — o'ng tarafida
  // aniq tugma bilan sal ajralib turadi (screenshot 05).
  const HELP_NAV_ROWS = [
    ['book', 'plat-help-icon-blue', "UStorE'dan foydalanish", 'Platforma imkoniyatlari va foydalanish bo‘yicha qo‘llanma', "openPage('GUIDE_USAGE')"],
    ['card', 'plat-help-icon-green', "To'lov va obuna", "Tariflar, to'lov usullari va obuna bo'yicha ma'lumot", "openPage('GUIDE_SUBSCRIPTION')"],
    ['shop', 'plat-help-icon-orange', "Do'kon sozlash", "Do'konni yaratish va savdoga tayyorlash bo'yicha yordam", "openPage('GUIDE_SHOP_SETUP')"],
  ];
  function renderHelpTab() {
    return `
      <div class="plat-help-head"><div><h1>Qanday yordam kerak?</h1><p>Savolingizga javob toping yoki to'g'ridan-to'g'ri jamoamizga yozing.</p></div><span>${pIcon('headset',26)}</span></div>
      <div class="plat-help-search">${pIcon('chat',17)}<input type="text" placeholder="Savolingizni yozing..." aria-label="Yordam qidiruvi" oninput="filterHelpItems(this.value)"></div>
      <div class="plat-help-primary-actions"><button class="plat-help-primary-card support" onclick="openSupportPage()"><span>${pIcon('headset',22)}</span><div><b>Qo'llab-quvvatlashga yozish</b><small>Jamoamiz bilan chat orqali bog'laning.</small></div><em>›</em></button><button class="plat-help-primary-card bug" onclick="openPage('BUG_REPORT')"><span>${pIcon('mail',22)}</span><div><b>Muammo haqida xabar berish</b><small>Xatolik yoki muammoni batafsil yuboring.</small></div><em>›</em></button></div>
      <button class="plat-my-tickets-link" onclick="openSupportPage()">${pIcon('inbox',17)}<span><b>Mening murojaatlarim</b><small>${mySupportTickets.length ? mySupportTickets.length + ' ta murojaat' : 'Murojaatlaringiz holatini kuzating'}</small></span><em>›</em></button>
      <div class="plat-section-heading"><div><h2>Ko'p so'raladigan savollar</h2><p>Eng ko'p uchraydigan savollarga tez javob.</p></div><button class="plat-link-btn" onclick="openPage('FAQ_FULL')">Barchasi</button></div>
      <div class="card plat-faq-preview">${FAQ_PREVIEW_ITEMS.map((q)=>`<button class="plat-faq-preview-row" onclick="openPage('FAQ_FULL')"><span class="plat-faq-preview-icon">?</span><span>${q}</span><span class="plat-faq-preview-chevron">›</span></button>`).join('')}</div>
    `;
  }
  function filterHelpItems(query) {
    const q = String(query || '').trim().toLocaleLowerCase('uz');
    document.querySelectorAll('.plat-faq-preview-row').forEach((el) => {
      el.classList.toggle('hidden', !!q && !String(el.textContent || '').toLocaleLowerCase('uz').includes(q));
    });
  }
  function renderGuidesHubBody() {
    return `
      <div class="plat-guides-hub-head"><span>${pIcon('book',22)}</span><div><h2>Qo'llanmalar</h2><p>UStorE'dan foydalanish, obuna va do'kon sozlash bo'yicha qisqa yo'riqnomalar.</p></div></div>
      <div class="plat-help-guide-list plat-guides-hub-list">${HELP_NAV_ROWS.map(([icon,tone,title,desc,action])=>`<button onclick="${action}"><span class="plat-help-row-icon ${tone}">${pIcon(icon,19)}</span><div><b>${title}</b><small>${desc}</small></div><em>›</em></button>`).join('')}</div>
    `;
  }
  function renderFaqFullBody() {
    return `<div class="card plat-faq-card">
      ${FAQ_ITEMS.map(([q, a]) => `
        <div class="plat-faq-item">
          <button class="plat-faq-q" onclick="toggleFaq(this)">
            <span>${q}</span>
            <span class="plat-faq-chevron">${pIcon('chevronDown', 16)}</span>
          </button>
          <div class="plat-faq-a"><div class="plat-faq-a-inner">${a}</div></div>
        </div>
      `).join('')}
    </div>`;
  }

  // ======================================================================
  // 4-band: Yordam bo'limi — statik qo'llanma sahifalari (4.1-4.3).
  // Backend kerak emas — faqat matn + mavjud sahifalarga o'tish tugmalari.
  // ======================================================================
  function guideStep(num, title, desc, actionHtml) {
    return `
      <div class="plat-step-row">
        <div class="plat-step-num">${num}</div>
        <div style="flex:1">
          <div class="plat-step-title">${title}</div>
          <div class="plat-step-desc">${desc}</div>
          ${actionHtml || ''}
        </div>
      </div>`;
  }
  function renderGuideUsageBody() {
    return `
      <div class="plat-guide-hero tone-blue"><span>${pIcon('book',26)}</span><div><h2>UStorE'dan foydalanish</h2><p>Platformadan samarali foydalanish bo'yicha qo'llanma.</p></div></div>
      <div class="plat-guide-card"><h3>Boshlash uchun 4 asosiy qadam</h3><div class="plat-guide-steps">${[['diamond','Tarif tanlang'],['shop',"Do'kon yarating"],['box',"Mahsulot qo'shing"],['bag','Buyurtmalarni qabul qiling']].map(([i,t],idx)=>`<div><em>${idx+1}</em><span>${pIcon(i,18)}</span><b>${t}</b></div>`).join('')}</div></div>
      <div class="plat-guide-card"><h3>Batafsil yo'l</h3>
        ${guideStep(1, 'Tarifni tanlang', "Do'koningiz hajmiga mos tarifni tanlang.", `<button class="secondary plat-small-btn" style="margin-top:8px" onclick="openPage('TARIFFS')">Tariflarni ko'rish</button>`)}
        ${guideStep(2, 'Obunani faollashtiring', "To'lovni amalga oshiring va tasdiqlanishini kuting.")}
        ${guideStep(3, "Do'kon tayyorlanadi", "Tasdiqlangach UStorE administratori do'konni ulaydi; sizdan bot token talab qilinmaydi.")}
        ${guideStep(4, 'Katalog yarating', "Do'kon ichida kategoriyalarni tuzing.")}
        ${guideStep(5, "Mahsulot qo'shing", "Rasm, narx va qoldiqni kiriting.")}
        ${guideStep(6, "To'lov usulini sozlang", "Click / Payme yoki mavjud to'lov usullarini sozlang.")}
        ${guideStep(7, "Yetkazib berishni sozlang", "Hudud va usul bo'yicha yetkazib berishni moslang.")}
        ${guideStep(8, 'Buyurtmalarni qabul qiling', "Mijozlar buyurtmalarini kuzating va boshqaring.")}
      </div>
      <button class="primary" onclick="openSupportPage()">${pIcon('headset',16)} Javob topmadingizmi? Supportga yozing</button>
    `;
  }
  function renderGuideSubscriptionBody() {
    return `
      <div class="plat-guide-hero tone-green"><span>${pIcon('card',26)}</span><div><h2>To'lov va obuna</h2><p>Tarif, to'lov va obuna boshqaruvi bo'yicha yordam.</p></div></div>
      <div class="plat-guide-card"><h3>Asosiy ma'lumot</h3><div class="plat-guide-row"><span>${pIcon('calendar',17)}</span><b>Standart obuna — 30 kun</b></div><div class="plat-guide-row"><span>${pIcon('gift',17)}</span><b>Birinchi obuna +7 kun bonus</b></div><div class="plat-guide-row"><span>${pIcon('diamond',17)}</span><b>Yillik obunada 2 oy bepul</b></div></div>
      <div class="plat-guide-card"><h3>Obuna savollari</h3>${[["Tarifni qanday almashtiraman?","Obuna bo'limida do'konni tanlab yangi tarifni belgilang."],["Obuna tugasa nima bo'ladi?","Do'kon avval muzlatiladi, ma'lumotlar 30 kun saqlanadi."],["To'lov qanday tasdiqlanadi?","To'lov so'rovi UStorE Admin tomonidan tekshiriladi."]].map(([q,a])=>`<div class="plat-guide-faq"><b>${q}</b><p>${a}</p></div>`).join('')}</div>
      <button class="primary" onclick="switchTab('subscription')">${pIcon('diamond',16)} Obunalarimni ko'rish</button>
      <button class="secondary" onclick="openSupportPage()">${pIcon('headset',16)} To'lov bo'yicha yordam olish</button>
    `;
  }
  function renderGuideShopSetupBody() {
    const myShop = myShops[0] || null;
    return `
      <div class="plat-guide-hero tone-orange"><span>${pIcon('shop',26)}</span><div><h2>Do'kon sozlash</h2><p>Do'konni savdoga tayyorlash bo'yicha yordam.</p></div></div>
      <div class="plat-guide-card"><h3>Boshlash uchun 5 qadam</h3><div class="plat-guide-timeline">${[['diamond','Tarif tanlang'],['shop',"Do'kon ma'lumotlari"],['box',"Mahsulot qo'shing"],['truck',"To'lov va yetkazib berish"],['rocket','Savdoni ishga tushiring']].map(([i,t],idx)=>`<div><em>${idx+1}</em><span>${pIcon(i,17)}</span><b>${t}</b></div>`).join('')}</div></div>
      <div class="plat-guide-card"><h3>Muhim sozlamalar</h3>${[['info',"Do'kon ma'lumotlari"],['box','Katalog va mahsulotlar'],['truck','Yetkazib berish parametrlar'],['card','Click / Payme / ekvayring'],['layers','BILLZ integratsiyasi']].map(([i,t])=>`<div class="plat-guide-row"><span>${pIcon(i,17)}</span><b>${t}</b><em>›</em></div>`).join('')}</div>
      ${myShop?.botUsername ? `<a class="primary plat-link-primary" href="https://t.me/${escapeHtml(myShop.botUsername)}" target="_blank" rel="noopener">Do'konni ochish</a>` : `<button class="primary" onclick="openPage('TARIFFS')">Tarif tanlab boshlash</button>`}
      <button class="secondary" onclick="openSupportPage()">${pIcon('headset',16)} Do'kon sozlash bo'yicha yordam</button>
    `;
  }
  function openSupportPage() { openPage('SUPPORT'); loadMySupportTickets(); }
  async function loadMySupportTickets() {
    mySupportTicketsLoading = true; render();
    try { mySupportTickets = (await callPlatformApi('platform_get_my_support_tickets', { type: 'SUPPORT' })).tickets || []; }
    catch (e) { console.error(e); mySupportTickets = []; }
    finally {
      mySupportTicketsLoading = false;
      // Support sahifasining o'zida HAM, endi bo'sh (activePage=null) Bosh
      // sahifa dashboard'ida ham (u ham mySupportTickets'dan "yangi
      // xabarlar" statistikasini ko'rsatadi) qayta chizish kerak.
      if (activePage === 'SUPPORT' || (!activePage && !isAdminMode && currentTab === 'home')) render();
    }
  }
  function renderSupportBody() {
    return `
      <div class="plat-support-hero"><span>${pIcon('headset',30)}</span><div><h2>Qo'llab-quvvatlash</h2><p>Savolingizni yuboring, jamoamiz javob beradi.</p></div></div>
      <div class="plat-support-meta"><span>${pIcon('chat',15)} UStorE Support</span><span>${pIcon('bell',15)} Javob Telegram orqali ham keladi</span></div>
      <div class="plat-support-compose"><textarea id="plat-support-new-msg" rows="3" placeholder="Savolingizni yozing..."></textarea><button class="primary" onclick="submitNewSupportMessage()">${pIcon('chat',15)} Yuborish</button></div>
      <div class="plat-section-heading"><div><h2>Mening murojaatlarim</h2><p>Yangi, javob berilgan va tugallangan murojaatlar.</p></div></div>
      ${mySupportTicketsLoading ? `<div class="plat-support-loading">Yuklanmoqda...</div>` : mySupportTickets.length ? `<div class="plat-ticket-list">${mySupportTickets.map((t)=>`<button onclick="openSupportThread(${t.id})"><span class="plat-ticket-icon">${pIcon('inbox',16)}</span><div><b>#${t.id}${t.subject?' · '+escapeHtml(t.subject):''}</b><small>${formatDate(t.createdAt)}</small></div><span class="status-pill status-${t.status==='ANSWERED'?'ACTIVE':t.status==='CLOSED'?'DISABLED':'PROVISIONING'}">${supportStatusLabel(t.status)}</span><em>›</em></button>`).join('')}</div>` : `<div class="plat-empty-inline">Hozircha murojaat yo'q.</div>`}
    `;
  }
  async function submitNewSupportMessage() {
    const el = document.getElementById('plat-support-new-msg');
    const message = el?.value.trim();
    if (!message) return alert('Xabar matnini yozing.');
    el.disabled = true;
    try {
      const result = await callPlatformApi('platform_create_support_ticket', { type: 'SUPPORT', message });
      el.value = '';
      await loadMySupportTickets();
      openSupportThread(result.ticketId);
    } catch (e) {
      alert("Yuborilmadi: " + (e.message || e));
    } finally {
      if (el) el.disabled = false;
    }
  }
  function supportThreadTitle() { return activeSupportTicketId ? `Murojaat #${activeSupportTicketId}` : 'Murojaat'; }
  async function openSupportThread(ticketId) {
    activeSupportTicketId = ticketId;
    activeSupportMessages = [];
    openPage('SUPPORT_THREAD');
    await loadSupportThreadMessages();
  }
  async function loadSupportThreadMessages() {
    activeSupportLoading = true; render();
    try { activeSupportMessages = (await callPlatformApi('platform_get_support_messages', { ticketId: activeSupportTicketId })).messages || []; }
    catch (e) { console.error(e); }
    finally { activeSupportLoading = false; if (activePage === 'SUPPORT_THREAD' || activePage === 'ADMIN_SUPPORT_THREAD') render(); }
  }
  function renderSupportThreadBody() {
    return `
      <div class="plat-chat-shell">
        <div class="plat-chat-info"><span>${pIcon('headset',24)}</span><div><b>UStorE Support</b><small>Murojaat #${escapeHtml(String(activeSupportTicketId || ''))}</small></div></div>
        <div class="plat-chat-messages">${activeSupportLoading ? `<p class="muted">Yuklanmoqda...</p>` : activeSupportMessages.length ? activeSupportMessages.map((m)=>`<div class="plat-chat-msg ${m.sender==='ADMIN'?'support':'mine'}"><div>${m.sender==='ADMIN'?'<b>UStorE Support</b>':''}<p>${escapeHtml(m.body)}</p>${m.attachmentUrl?`<img src="${escapeHtml(m.attachmentUrl)}" alt="Biriktirma">`:''}<small>${formatDate(m.createdAt)}</small></div></div>`).join('') : `<div class="plat-chat-empty">Suhbat shu yerda boshlanadi.</div>`}</div>
        <div class="plat-chat-compose"><textarea id="plat-support-reply-msg" rows="2" placeholder="Xabaringizni yozing..."></textarea><button class="primary" ${sendingSupportMessage?'disabled':''} onclick="sendSupportReply()">${pIcon('chat',15)} ${sendingSupportMessage?'Yuborilmoqda...':'Yuborish'}</button></div>
      </div>
    `;
  }
  async function sendSupportReply() {
    const el = document.getElementById('plat-support-reply-msg');
    const body = el?.value.trim();
    if (!body) return alert('Xabar matnini yozing.');
    sendingSupportMessage = true; render();
    try {
      await callPlatformApi('platform_send_support_message', { ticketId: activeSupportTicketId, body });
      await loadSupportThreadMessages();
      if (isAdminMode) await loadAdminSupportTickets();
    } catch (e) {
      alert("Yuborilmadi: " + (e.message || e));
    } finally {
      sendingSupportMessage = false; render();
    }
  }

  // ======================================================================
  // 4.5-band: Muammo haqida xabar berish
  // ======================================================================
  function onBugReportAttachmentPicked(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return alert("Faqat JPG, PNG yoki WebP rasm qabul qilinadi.");
    if (file.size > 6 * 1024 * 1024) return alert("Rasm hajmi 6MB dan katta bo'lmasin.");
    bugReportAttachmentFile = file;
    if (bugReportAttachmentPreviewUrl) { try { URL.revokeObjectURL(bugReportAttachmentPreviewUrl); } catch (_) {} }
    bugReportAttachmentPreviewUrl = URL.createObjectURL(file);
    rerenderActivePage();
  }
  function renderBugReportBody() {
    if (bugReportSent) return `<div class="plat-success-state"><span>${pIcon('check',30)}</span><h2>Xabaringiz yuborildi</h2><p>UStorE jamoasi murojaatingizni ko'rib chiqadi.</p><button class="primary" onclick="bugReportSent=false; switchTab('help');">Yordamga qaytish</button></div>`;
    return `
      <div class="plat-guide-hero tone-orange"><span>${pIcon('mail',27)}</span><div><h2>Muammo haqida xabar berish</h2><p>Xatolik yoki muammoni batafsil yuboring.</p></div></div>
      <div class="plat-bug-form">
        <label>Muammo mavzusi</label><select id="plat-bugreport-section"><option value="">Tanlang</option><option value="Obuna">To'lov / obuna</option><option value="Do'kon">Do'kon</option><option value="Yordam">Yordam</option><option value="Boshqa">Boshqa</option></select>
        <label>Muammo nomi</label><input type="text" id="plat-bugreport-title" placeholder="Qisqacha nom kiriting">
        <label>Muammo tavsifi</label><textarea id="plat-bugreport-desc" rows="5" maxlength="2000" placeholder="Muammo haqida batafsil yozing..."></textarea>
        <label>Screenshot / fayl (ixtiyoriy)</label><input type="file" id="plat-bugreport-input" class="hidden" onchange="onBugReportAttachmentPicked(event)"><button class="plat-file-pick" onclick="document.getElementById('plat-bugreport-input').click()">${pIcon('plus',16)} Fayl tanlash <small>JPG, PNG, WEBP · max 6 MB</small></button>
        ${bugReportAttachmentPreviewUrl?`<img src="${bugReportAttachmentPreviewUrl}" class="plat-receipt-preview">`:''}
        <div class="plat-bug-process"><b>Yuborilgandan keyin</b><div><span>1</span><small>Qabul qilinadi</small><span>2</span><small>Tekshiriladi</small><span>3</span><small>Javob beriladi</small></div></div>
        <button class="primary ${submittingBugReport?'plat-btn-dimmed':''}" onclick="submitBugReport()">${submittingBugReport?'<span class="spinner"></span> Yuborilmoqda...':`${pIcon('mail',15)} Xabar berish`}</button>
      </div>
    `;
  }
  async function submitBugReport() {
    if (submittingBugReport) return;
    const title = document.getElementById('plat-bugreport-title')?.value.trim();
    const section = document.getElementById('plat-bugreport-section')?.value || '';
    const desc = document.getElementById('plat-bugreport-desc')?.value.trim();
    if (!title || !desc) return alert("Sarlavha va tavsifni to'ldiring.");
    submittingBugReport = true; render();
    try {
      let attachmentUpload;
      if (bugReportAttachmentFile) {
        attachmentUpload = { base64: await fileToBase64(bugReportAttachmentFile), mimeType: bugReportAttachmentFile.type };
      }
      await callPlatformApi('platform_create_support_ticket', {
        type: 'BUG_REPORT', subject: title, pageContext: section || undefined,
        message: desc, attachmentUpload,
      });
      bugReportAttachmentFile = null;
      if (bugReportAttachmentPreviewUrl) { try { URL.revokeObjectURL(bugReportAttachmentPreviewUrl); } catch (_) {} }
      bugReportAttachmentPreviewUrl = null;
      bugReportSent = true;
    } catch (e) {
      alert("Yuborilmadi: " + (e.message || e));
    } finally {
      submittingBugReport = false; render();
    }
  }

  // ======================================================================
  // 4.4/4.5-band: Support — admin tomoni
  // ======================================================================
  function openAdminSupportPage() { openPage('ADMIN_SUPPORT'); loadAdminSupportTickets(); }
  async function loadAdminSupportTickets() {
    adminSupportTicketsLoading = true; render();
    try {
      const payload = {};
      if (adminSupportFilter) payload.status = adminSupportFilter;
      adminSupportTickets = (await callPlatformApi('platform_admin_list_support_tickets', payload)).tickets || [];
      if (adminSupportTypeFilter) adminSupportTickets = adminSupportTickets.filter((t) => t.type === adminSupportTypeFilter);
    } catch (e) { console.error(e); adminSupportTickets = []; }
    finally { adminSupportTicketsLoading = false; if (activePage === 'ADMIN_SUPPORT') render(); }
  }
  function setAdminSupportFilter(status) { adminSupportFilter = status || null; loadAdminSupportTickets(); }
  function setAdminSupportTypeFilter(type) { adminSupportTypeFilter = type || null; loadAdminSupportTickets(); }
  function renderAdminSupportBody() {
    return `
      <div class="plat-filter-row">
        ${['OPEN', 'ANSWERED', 'CLOSED', ''].map((s) => `<button class="plat-filter-btn ${adminSupportFilter === (s || null) ? 'active' : ''}" onclick="setAdminSupportFilter('${s}')">${s || 'Hammasi'}</button>`).join('')}
      </div>
      <div class="plat-filter-row">
        ${[['', 'Hammasi'], ['SUPPORT', 'Support'], ['BUG_REPORT', '🐞 Bug']].map(([v, l]) => `<button class="plat-filter-btn ${adminSupportTypeFilter === (v || null) ? 'active' : ''}" onclick="setAdminSupportTypeFilter('${v}')">${l}</button>`).join('')}
      </div>
      ${adminSupportTicketsLoading ? `<p class="muted">Yuklanmoqda...</p>` : adminSupportTickets.length ? adminSupportTickets.map((t) => `
        <div class="plat-shop-pick-row" onclick="openAdminSupportThread(${t.id})">
          <div>
            <div class="name">${t.type === 'BUG_REPORT' ? '🐞 ' : ''}#${t.id}${t.subject ? ' — ' + escapeHtml(t.subject) : ''}</div>
            <div class="meta">${escapeHtml(t.requesterUsername ? '@' + t.requesterUsername : (t.requesterFirstName || 'Foydalanuvchi'))}${t.pageContext ? ' · ' + escapeHtml(t.pageContext) : ''} · ${formatDate(t.createdAt)}</div>
          </div>
          <span class="status-pill status-${t.status === 'ANSWERED' ? 'ACTIVE' : t.status === 'CLOSED' ? 'DISABLED' : 'PROVISIONING'}">${supportStatusLabel(t.status)}</span>
        </div>
      `).join('') : `<p class="empty">Murojaat yo'q.</p>`}
    `;
  }
  async function openAdminSupportThread(ticketId) {
    activeSupportTicketId = ticketId;
    activeSupportMessages = [];
    openPage('ADMIN_SUPPORT_THREAD');
    await loadSupportThreadMessages();
  }
  function renderAdminSupportThreadBody() {
    const ticket = adminSupportTickets.find((t) => t.id === activeSupportTicketId);
    return `
      ${ticket && ticket.status !== 'CLOSED' ? `<button class="secondary" onclick="closeAdminSupportThread()">Murojaatni yopish</button>` : ''}
      ${renderSupportThreadBody()}
    `;
  }
  async function closeAdminSupportThread() {
    if (!confirm("Bu murojaatni yopmoqchimisiz?")) return;
    try {
      await callPlatformApi('platform_close_support_ticket', { ticketId: activeSupportTicketId });
      await loadAdminSupportTickets();
      openPage('ADMIN_SUPPORT');
    } catch (e) { alert(e.message || String(e)); }
  }

  function renderProfileTab() {
    if (isAdminMode) return renderAdminProfileTab();
    const user = tg?.initDataUnsafe?.user || {};
    const activeSubs = myShops.filter((s)=>s.status==='ACTIVE').length;
    const expiryDays = myShops.map((s)=>daysUntil(s.subscriptionExpiresAt)).filter((d)=>d!==null&&d>=0).sort((a,b)=>a-b);
    const nearest = expiryDays.length ? expiryDays[0] : null;
    const fullName = [user.first_name,user.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi';
    return `
      <div class="plat-tab-head"><div><h1>Profil</h1><p>Telegram akkauntingiz va UStorE ma'lumotlari</p></div></div>
      <section class="plat-profile-hero">${user.photo_url?`<img src="${escapeHtml(user.photo_url)}" class="plat-profile-photo">`:`<div class="plat-profile-photo plat-profile-photo-fallback">${escapeHtml(fullName.charAt(0))}</div>`}<div class="plat-profile-main"><h2>${escapeHtml(fullName)}</h2><p>${user.username?'@'+escapeHtml(user.username):'Telegram foydalanuvchi'}</p><small>${pIcon('user',13)} Telegram ID: ${escapeHtml(String(user.id||''))}</small></div></section>
      <div class="plat-profile-stats"><div><span class="tone-blue">${pIcon('shop',16)}</span><b>${myShops.length} ta</b><small>do'kon ulangan</small></div><div><span class="tone-green">${pIcon('check',16)}</span><b>${activeSubs} ta</b><small>faol obuna</small></div><div><span class="tone-violet">${pIcon('calendar',16)}</span><b>${nearest===null?'—':nearest+' kun'}</b><small>eng yaqin tugash</small></div></div>
      <h2 class="plat-profile-section-title">Hisob</h2><div class="plat-profile-list"><button onclick="switchTab('shops')"><span class="tone-green">${pIcon('shop',17)}</span><b>Do'konlarim</b><em>${myShops.length} ta ›</em></button><button onclick="switchTab('subscription')"><span class="tone-orange">${pIcon('diamond',17)}</span><b>Obunalarim</b><em>${nearest!==null&&nearest<=7?'Tez orada tugaydi ›':'Ko‘rish ›'}</em></button></div>
      <h2 class="plat-profile-section-title">UStorE</h2><div class="plat-profile-list"><button onclick="openPage('GUIDES')"><span class="tone-violet">${pIcon('book',17)}</span><b>Qo'llanmalar</b><em>3 ta ›</em></button><button onclick="openPage('ABOUT')"><span class="tone-blue">${pIcon('info',17)}</span><b>UStorE haqida</b><em>›</em></button><button onclick="openPrivacyPage()"><span class="tone-green">${pIcon('lock',17)}</span><b>Maxfiylik siyosati</b><em>›</em></button><button onclick="openTermsPage()"><span class="tone-violet">${pIcon('book',17)}</span><b>Foydalanish shartlari</b><em>›</em></button></div>
      <div class="plat-telegram-security">${pIcon('lock',19)}<div><b>Akkaunt Telegram profilingiz bilan bog'langan</b><small>Alohida login yoki parol talab qilinmaydi.</small></div>${pIcon('check',18)}</div>
      ${isSuperAdmin?`<button class="plat-admin-switch" onclick="toggleAdminRole()"><span>${pIcon('lock',22)}</span><div><b>Admin rejimi</b><small>Platformani boshqarish</small></div><em>O'tish →</em></button>`:''}
      <div class="plat-version">UStorE · 2026</div>
    `;
  }

  function renderAdminProfileTab() {
    const user = tg?.initDataUnsafe?.user || {};
    const fullName = [user.first_name,user.last_name].filter(Boolean).join(' ') || 'Administrator';
    const activeMethods = adminPaymentMethods.filter((m)=>m.isActive).length + ((paymentInfoDraft?.isActive && paymentInfoDraft?.cardNumber) ? 1 : 0);
    const activeTemplates = adminNotificationTemplates.filter((t)=>t.isActive).length;
    return `
      <div class="plat-admin-profile-head"><span class="plat-admin-eyebrow">Platforma administratori</span><h1>Profil</h1><p>Akkaunt va UStorE tizim sozlamalarini boshqaring.</p></div>
      <section class="plat-admin-profile-card">
        ${user.photo_url?`<img src="${escapeHtml(user.photo_url)}" class="plat-admin-profile-photo">`:`<div class="plat-admin-profile-photo is-fallback">${escapeHtml(fullName.charAt(0))}</div>`}
        <div class="plat-admin-profile-identity"><span class="plat-admin-role-badge">SUPER ADMIN</span><h2>${escapeHtml(fullName)}</h2><p>${user.username?'@'+escapeHtml(user.username):'Telegram administrator'}</p><small>Telegram ID: ${escapeHtml(String(user.id||''))}</small></div>
      </section>
      <div class="plat-admin-settings-intro"><div><span class="plat-admin-eyebrow">Boshqaruv markazi</span><h2>Admin sozlamalari</h2></div><span>${pIcon('gear',19)}</span></div>
      <div class="plat-admin-settings-list">
        <button onclick="openAdminPaymentSettings()"><span class="is-blue">${pIcon('wallet',19)}</span><div><b>To'lov sozlamalari</b><small>Karta, Click, Payme va Paynet</small></div><em>${activeMethods} faol ${pIcon('arrowRight',16)}</em></button>
        <button onclick="openAdminNotificationSettings()"><span class="is-violet">${pIcon('bell',19)}</span><div><b>Avtomatik xabarlar</b><small>Obuna va onboarding eslatmalari</small></div><em>${activeTemplates} faol ${pIcon('arrowRight',16)}</em></button>
        <button onclick="openAdminLifecycleSettings()"><span class="is-amber">${pIcon('lock',19)}</span><div><b>Do'kon holati parametrlari</b><small>Muzlatish, o'chirish va owner xabarlari</small></div><em>${pIcon('arrowRight',16)}</em></button>
        <button onclick="openAdminIntegrationsInfo()"><span class="is-green">${pIcon('layers',19)}</span><div><b>Integratsiyalar</b><small>BILLZ va to'lov provayderlari holati</small></div><em>${pIcon('arrowRight',16)}</em></button>
        <button onclick="openAdminSupportPage()"><span class="is-amber">${pIcon('headset',19)}</span><div><b>Support</b><small>Foydalanuvchi murojaatlari</small></div><em>${pIcon('arrowRight',16)}</em></button>
      </div>
      <h2 class="plat-profile-section-title">UStorE</h2>
      <div class="plat-profile-list"><button onclick="openPage('ABOUT')"><span class="tone-blue">${pIcon('info',17)}</span><b>UStorE haqida</b><em>›</em></button><button onclick="openPrivacyPage()"><span class="tone-green">${pIcon('lock',17)}</span><b>Maxfiylik siyosati</b><em>›</em></button><button onclick="openTermsPage()"><span class="tone-violet">${pIcon('book',17)}</span><b>Foydalanish shartlari</b><em>›</em></button></div>
      <div class="plat-telegram-security">${pIcon('lock',19)}<div><b>Admin akkaunti Telegram bilan tasdiqlangan</b><small>Alohida login yoki parol talab qilinmaydi.</small></div>${pIcon('check',18)}</div>
      <button class="plat-admin-switch" onclick="toggleAdminRole()"><span>${pIcon('user',22)}</span><div><b>Foydalanuvchi rejimi</b><small>Platformaning foydalanuvchi qismiga qaytish</small></div><em>O'tish →</em></button>
      <div class="plat-version">UStorE Admin · 2026</div>`;
  }
  // 2026-08-28: REAL BUG topildi va tuzatildi — bu funksiya onTabEnter('dashboard')
  // va approveRequest()'da chaqirilardi, lekin HECH QACHON e'lon qilinmagan
  // edi (ReferenceError, konsolda jim yutilardi). Natijada dashboardSummary
  // hech qachon to'ldirilmagan va Admin Dashboard tabi abadiy "Yuklanmoqda..."
  // holatida qolib ketardi — pastdagi KPI kartalar HECH QACHON ko'rinmasdi.
  async function loadDashboardSummary() {
    try {
      const data = await callPlatformApi('platform_admin_dashboard_summary', {});
      dashboardSummary = data;
    } catch (e) { console.error(e); }
    finally { if (currentTab === 'dashboard') render(); }
  }
  async function loadAnalytics() {
    analyticsLoading = true;
    if (currentTab === 'dashboard') render();
    try {
      analyticsData = await callPlatformApi('platform_admin_analytics_summary', { period: analyticsPeriod });
    } catch (e) { console.error(e); }
    finally { analyticsLoading = false; if (currentTab === 'dashboard') render(); }
  }
  function setAnalyticsPeriod(period) { analyticsPeriod = period; loadAnalytics(); }
  // Kunlik savdo dinamikasi — sodda, bitta rangli ustunli diagramma (SVG/
  // path interpolatsiyasiz — mobil ekranda ishonchli, "rainbow" emas, spec
  // talabiga mos).
  function renderAnalyticsTrendBars(timeline) {
    if (!timeline || !timeline.length) return `
      <div class="plat-admin-empty is-compact">
        <span>${pIcon('chart', 22)}</span>
        <b>Bu davrda savdo ma'lumoti yo'q</b>
        <small>Tasdiqlangan obuna to'lovlari tushgach dinamika shu yerda ko'rinadi.</small>
      </div>`;
    const max = Math.max(1, ...timeline.map((p) => p.revenue));
    const showEvery = timeline.length > 12 ? Math.ceil(timeline.length / 8) : 1;
    return `
      <div class="plat-analytics-bars">
        ${timeline.map((p, i) => `
          <div class="plat-analytics-bar-col" title="${escapeHtml(p.label)}: ${money(p.revenue)} (${p.count} ta)">
            <div class="plat-analytics-bar" style="height:${Math.max(4, Math.round((p.revenue / max) * 100))}%"></div>
            <small>${i % showEvery === 0 || i === timeline.length - 1 ? escapeHtml(p.label) : ''}</small>
          </div>
        `).join('')}
      </div>
    `;
  }
  function renderAnalyticsSection() {
    const periods = [['7d', '7 kun'], ['30d', '30 kun'], ['90d', '90 kun'], ['all', 'Barcha vaqt']];
    const a = analyticsData;
    return `
      <section class="plat-admin-section plat-analytics-card">
        <div class="plat-admin-section-head">
          <div><span class="plat-admin-eyebrow">Moliyaviy ko'rsatkichlar</span><h2>Analitika</h2></div>
          <span class="plat-admin-section-icon">${pIcon('chart', 18)}</span>
        </div>
        <div class="plat-admin-period-switch">
          ${periods.map(([key, label]) => `<button class="${analyticsPeriod === key ? 'active' : ''}" onclick="setAnalyticsPeriod('${key}')">${label}</button>`).join('')}
        </div>
        ${!a || analyticsLoading ? '<div class="plat-admin-skeleton-grid"><i></i><i></i><i></i><i></i></div>' : `
          <div class="plat-analytics-kpi-grid">
            <div class="plat-analytics-kpi"><span>${pIcon('inbox',16)}</span><div><b>${a.totalCount}</b><small>Jami obuna to'lovi</small></div></div>
            <div class="plat-analytics-kpi"><span>${pIcon('shop',16)}</span><div><b>${a.newShopCount}</b><small>Yangi do'kon</small></div></div>
            <div class="plat-analytics-kpi"><span>${pIcon('clock',16)}</span><div><b>${a.renewalCount}</b><small>Uzaytirish</small></div></div>
            <div class="plat-analytics-kpi"><span>${pIcon('swap',16)}</span><div><b>${a.planChangeCount}</b><small>Tarif o'zgarishi</small></div></div>
            <div class="plat-analytics-kpi is-primary"><span>${pIcon('wallet',16)}</span><div><b>${money(a.revenue)}</b><small>Daromad</small></div></div>
            <div class="plat-analytics-kpi"><span>${pIcon('chart',16)}</span><div><b>${a.retentionRate === null ? '—' : a.retentionRate + '%'}</b><small>Retention · ${a.retentionCohortSize} shop</small></div></div>
          </div>
          <div class="plat-admin-analytics-block">
            <div class="plat-admin-subhead"><b>Savdo dinamikasi</b><small>Tasdiqlangan to'lovlar</small></div>
            ${renderAnalyticsTrendBars(a.salesTimeline)}
          </div>
          <div class="plat-admin-analytics-block">
            <div class="plat-admin-subhead"><b>To'lov davri bo'yicha</b><small>Oylik va yillik</small></div>
            <div class="plat-admin-period-stats">
              <div><span>Oylik</span><b>${a.byPeriod.MONTHLY.count} ta</b><small>${money(a.byPeriod.MONTHLY.revenue)}</small></div>
              <div><span>Yillik</span><b>${a.byPeriod.ANNUAL.count} ta</b><small>${money(a.byPeriod.ANNUAL.revenue)}</small></div>
            </div>
          </div>
          <div class="plat-admin-analytics-block">
            <div class="plat-admin-subhead"><b>Tarif bo'yicha</b><small>So'rovlar va tushum</small></div>
            ${a.byTariff.length ? `<div class="plat-admin-tariff-breakdown">${a.byTariff.map((t) => `<div><span>${escapeHtml(t.tariffName)}</span><b>${t.count} ta</b><small>${money(t.revenue)}</small></div>`).join('')}</div>` : `<div class="plat-admin-empty is-compact"><span>${pIcon('diamond',20)}</span><b>Bu davrda tarif savdosi yo'q</b></div>`}
          </div>
        `}
      </section>
    `;
  }

  function renderAdminDashboardTab() {
    const s = dashboardSummary;
    if (!s) return `<div class="plat-admin-loading"><span class="spinner"></span><b>Dashboard yuklanmoqda</b><small>Ko'rsatkichlar tayyorlanmoqda...</small></div>`;
    return `
      <div class="plat-admin-dash-head">
        <span class="plat-admin-eyebrow">Boshqaruv markazi</span>
        <h1>Dashboard</h1>
        <p>Platforma holati, obunalar va asosiy ko'rsatkichlar.</p>
      </div>
      <div class="plat-admin-kpi-grid">
        <button type="button" class="plat-admin-kpi-card is-primary" onclick="switchTab('shops')">
          <span class="plat-admin-kpi-icon">${pIcon('shop', 20)}</span>
          <span class="plat-admin-kpi-copy"><small>Faol do'konlar</small><b>${s.activeShopsCount}</b><em>${s.expiringSoonCount ? `${s.expiringSoonCount} tasi 7 kun ichida tugaydi` : 'Yaqin muddatda tugaydigan yo‘q'}</em></span>
          <span class="plat-admin-kpi-go">${pIcon('arrowRight',15)}</span>
        </button>
        <button type="button" class="plat-admin-kpi-card is-warn" onclick="openPage('EXPIRED_SHOPS')">
          <span class="plat-admin-kpi-icon">${pIcon('calendar', 20)}</span>
          <span class="plat-admin-kpi-copy"><small>Muddati tugagan</small><b>${s.expiredCount}</b><em>${s.expiredCount ? 'Muzlatilgan do‘konlar' : 'Muammo yo‘q'}</em></span>
          <span class="plat-admin-kpi-go">${pIcon('arrowRight',15)}</span>
        </button>
        <button type="button" class="plat-admin-kpi-card is-info" onclick="switchTab('requests')">
          <span class="plat-admin-kpi-icon">${pIcon('inbox', 20)}</span>
          <span class="plat-admin-kpi-copy"><small>Yangi so'rovlar</small><b>${s.newRequestsCount}</b><em>${s.newRequestsCount ? 'Tekshiruv kutmoqda' : 'Yangi so‘rov yo‘q'}</em></span>
          <span class="plat-admin-kpi-go">${pIcon('arrowRight',15)}</span>
        </button>
        <button type="button" class="plat-admin-kpi-card is-neutral" onclick="switchTab('profile')">
          <span class="plat-admin-kpi-icon">${pIcon('user', 20)}</span>
          <span class="plat-admin-kpi-copy"><small>Foydalanuvchilar</small><b>${s.totalUsersCount}</b><em>Do'kon egalari</em></span>
          <span class="plat-admin-kpi-go">${pIcon('arrowRight',15)}</span>
        </button>
      </div>
      ${renderAnalyticsSection()}
      ${(s.attentionItems || []).length ? `
        <section class="plat-admin-section">
          <div class="plat-admin-section-head"><div><span class="plat-admin-eyebrow">Nazorat</span><h2>Diqqat talab qiladi</h2></div><span class="plat-admin-section-icon is-warn">${pIcon('bell',18)}</span></div>
          <div class="plat-admin-attention-list">
            ${s.attentionItems.slice(0,6).map((it) => `
              <button class="plat-admin-attention-row" onclick="${it.type === 'NEW_REQUEST' ? "switchTab('requests')" : "switchTab('shops')"}">
                <span class="plat-admin-attention-dot"></span><span><b>${escapeHtml(it.label)}</b><small>${escapeHtml(it.detail || '')}</small></span>${pIcon('arrowRight',15)}
              </button>
            `).join('')}
          </div>
        </section>
      ` : ''}
      <section class="plat-admin-section">
        <div class="plat-admin-section-head"><div><span class="plat-admin-eyebrow">So'nggi faollik</span><h2>Yangi do'konlar</h2></div><button class="plat-admin-text-btn" onclick="switchTab('shops')">Barchasi ${pIcon('arrowRight',14)}</button></div>
        ${(s.recentShops || []).length ? `<div class="plat-admin-recent-list">${s.recentShops.slice(0,5).map((sh) => `
          <button onclick="switchTab('shops')"><span class="plat-admin-recent-icon">${pIcon('shop',16)}</span><span><b>${escapeHtml(sh.public_code)}</b><small>Platformaga qo'shilgan do'kon</small></span><span class="status-pill status-${sh.status}">${escapeHtml(adminShopStatusLabel(sh.status))}</span></button>
        `).join('')}</div>` : `<div class="plat-admin-empty is-compact"><span>${pIcon('shop',20)}</span><b>Hozircha do'kon yo'q</b></div>`}
      </section>
    `;
  }

  // ======================================================================
  // ADMIN: Do'konlar (mavjud shop-list/connect-bot shu yerga ko'chirilgan)
  // ======================================================================
  async function reloadAdminShops() {
    const data = await callPlatformApi('platform_list_shops', {});
    adminShops = data.shops || [];
    render();
  }
  function adminShopStatusLabel(status) {
    if (status === 'ACTIVE') return 'Faol';
    if (status === 'FROZEN') return 'Muzlatilgan';
    if (status === 'PROVISIONING') return 'Sozlanmoqda';
    if (status === 'TERMINATED') return "O'chirilgan";
    return status || 'Noma’lum';
  }
  function adminShopDaysBucket(s) {
    const d = daysUntil(s.subscriptionExpiresAt);
    if (d === null) return 'NONE';
    if (d <= 3) return '0_3';
    if (d <= 7) return '4_7';
    if (d <= 14) return '8_14';
    if (d <= 30) return '15_30';
    return '30_PLUS';
  }
  function filteredAdminShops() {
    const q = adminShopsSearchQuery.trim().toLowerCase();
    let list = adminShops.filter((s) => {
      if (adminShopsStatusFilter !== 'ALL' && s.status !== adminShopsStatusFilter) return false;
      if (adminShopsTariffFilter !== 'ALL' && (s.tariffName || 'Tarifsiz') !== adminShopsTariffFilter) return false;
      if (adminShopsDaysFilter !== 'ALL' && adminShopDaysBucket(s) !== adminShopsDaysFilter) return false;
      if (!q) return true;
      const haystack = [s.botName, s.botUsername, s.publicCode, s.ownerTelegramId, s.tariffName].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    if (adminShopsSort === 'OLDEST') list = list.slice().sort((a,b) => new Date(a.createdAt||0)-new Date(b.createdAt||0));
    else if (adminShopsSort === 'EXPIRING') list = list.slice().sort((a,b) => (daysUntil(a.subscriptionExpiresAt) ?? 999999) - (daysUntil(b.subscriptionExpiresAt) ?? 999999));
    else if (adminShopsSort === 'AZ') list = list.slice().sort((a,b) => String(a.botName||a.botUsername||a.publicCode||'').localeCompare(String(b.botName||b.botUsername||b.publicCode||''), 'uz'));
    else list = list.slice().sort((a,b) => new Date(b.createdAt||0)-new Date(a.createdAt||0));
    return list;
  }
  function setAdminShopsSearch(value) { adminShopsSearchQuery = value; rerenderActivePage(); }
  function setAdminShopsStatusFilter(status) { adminShopsStatusFilter = status; rerenderActivePage(); }
  function setAdminShopsTariffFilter(value) { adminShopsTariffFilter = value; rerenderActivePage(); }
  function setAdminShopsDaysFilter(value) { adminShopsDaysFilter = value; rerenderActivePage(); }
  function setAdminShopsSort(value) { adminShopsSort = value; rerenderActivePage(); }
  function toggleAdminShopsFilters() { adminShopsFiltersOpen = !adminShopsFiltersOpen; rerenderActivePage(); }
  function resetAdminShopFilters() {
    adminShopsStatusFilter = 'ALL'; adminShopsTariffFilter = 'ALL'; adminShopsDaysFilter = 'ALL'; adminShopsSort = 'NEWEST';
    rerenderActivePage();
  }
  function renderAdminShopsTab() {
    const list = filteredAdminShops();
    const statusOptions = [['ACTIVE', 'Faol'], ['FROZEN', 'Muzlatilgan'], ['PROVISIONING', 'Sozlanmoqda'], ['TERMINATED', "O'chirilgan"]];
    const counts = {
      all: adminShops.length,
      active: adminShops.filter((s)=>s.status==='ACTIVE').length,
      frozen: adminShops.filter((s)=>s.status==='FROZEN').length,
      provisioning: adminShops.filter((s)=>s.status==='PROVISIONING').length,
    };
    const tariffNames = Array.from(new Set(adminShops.map((s)=>s.tariffName).filter(Boolean))).sort();
    const advancedCount = Number(adminShopsTariffFilter !== 'ALL') + Number(adminShopsDaysFilter !== 'ALL') + Number(adminShopsSort !== 'NEWEST') + Number(!['ALL','ACTIVE','FROZEN'].includes(adminShopsStatusFilter));
    return `
      <div class="plat-admin-list-head">
        <span class="plat-admin-eyebrow">Platforma katalogi</span>
        <h1>Do'konlar</h1>
        <p>Barcha do'konlar holati va obunalarini bitta joydan boshqaring.</p>
      </div>
      <div class="plat-admin-summary-strip">
        <div><b>${counts.all}</b><small>Jami</small></div><div><b>${counts.active}</b><small>Faol</small></div><div><b>${counts.frozen}</b><small>Muzlatilgan</small></div><div><b>${counts.provisioning}</b><small>Sozlanmoqda</small></div>
      </div>
      <div class="plat-admin-search-row">
        <label class="plat-admin-search">${pIcon('search',18)}<input type="text" placeholder="Do'kon, @username yoki owner ID" value="${escapeHtml(adminShopsSearchQuery)}" oninput="setAdminShopsSearch(this.value)"></label>
        <button class="plat-admin-filter-toggle ${adminShopsFiltersOpen || advancedCount ? 'active' : ''}" onclick="toggleAdminShopsFilters()" aria-label="Filtrlar">${pIcon('filter',18)}${advancedCount ? `<i>${advancedCount}</i>` : ''}</button>
      </div>
      <div class="plat-admin-quick-tabs">
        ${[['ALL','Hammasi',counts.all],['ACTIVE','Faol',counts.active],['FROZEN','Muzlatilgan',counts.frozen]].map(([key,label,count])=>`<button class="${adminShopsStatusFilter===key?'active':''}" onclick="setAdminShopsStatusFilter('${key}')"><span>${label}</span><em>${count}</em></button>`).join('')}
      </div>
      ${adminShopsFiltersOpen ? `
        <section class="plat-admin-filter-panel">
          <div class="plat-admin-filter-panel-head"><div><b>Kengaytirilgan filtr</b><small>Natijani aniqroq saralang</small></div><button onclick="resetAdminShopFilters()">Tozalash</button></div>
          <div class="plat-admin-filter-grid">
            <label><span>Holati</span><select onchange="setAdminShopsStatusFilter(this.value)"><option value="ALL" ${adminShopsStatusFilter==='ALL'?'selected':''}>Barchasi</option><option value="ACTIVE" ${adminShopsStatusFilter==='ACTIVE'?'selected':''}>Faol</option><option value="FROZEN" ${adminShopsStatusFilter==='FROZEN'?'selected':''}>Muzlatilgan</option><option value="PROVISIONING" ${adminShopsStatusFilter==='PROVISIONING'?'selected':''}>Sozlanmoqda</option><option value="TERMINATED" ${adminShopsStatusFilter==='TERMINATED'?'selected':''}>O'chirilgan</option></select></label>
            <label><span>Tarif</span><select onchange="setAdminShopsTariffFilter(this.value)"><option value="ALL">Barcha tariflar</option>${tariffNames.map((name)=>`<option value="${escapeHtml(name)}" ${adminShopsTariffFilter===name?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></label>
            <label><span>Qolgan muddat</span><select onchange="setAdminShopsDaysFilter(this.value)"><option value="ALL">Barcha muddatlar</option><option value="0_3" ${adminShopsDaysFilter==='0_3'?'selected':''}>0–3 kun</option><option value="4_7" ${adminShopsDaysFilter==='4_7'?'selected':''}>4–7 kun</option><option value="8_14" ${adminShopsDaysFilter==='8_14'?'selected':''}>8–14 kun</option><option value="15_30" ${adminShopsDaysFilter==='15_30'?'selected':''}>15–30 kun</option><option value="30_PLUS" ${adminShopsDaysFilter==='30_PLUS'?'selected':''}>30+ kun</option><option value="NONE" ${adminShopsDaysFilter==='NONE'?'selected':''}>Muddat yo'q</option></select></label>
            <label><span>Saralash</span><select onchange="setAdminShopsSort(this.value)"><option value="NEWEST" ${adminShopsSort==='NEWEST'?'selected':''}>Eng yangi</option><option value="OLDEST" ${adminShopsSort==='OLDEST'?'selected':''}>Eng eski</option><option value="EXPIRING" ${adminShopsSort==='EXPIRING'?'selected':''}>Tez tugaydigan</option><option value="AZ" ${adminShopsSort==='AZ'?'selected':''}>A–Z</option></select></label>
          </div>
        </section>` : ''}
      <div class="plat-admin-result-head"><b>${list.length} ta do'kon</b><small>${adminShopsSearchQuery || advancedCount || adminShopsStatusFilter!=='ALL' ? 'Filtrlangan natija' : 'Barcha do‘konlar'}</small></div>
      <div class="plat-admin-shop-list">
        ${list.length ? list.map(renderAdminShopRow).join('') : renderAdminShopsEmpty()}
      </div>
    `;
  }
  function renderAdminShopsEmpty() {
    const filtered = !!(adminShopsSearchQuery || adminShopsStatusFilter !== 'ALL' || adminShopsTariffFilter !== 'ALL' || adminShopsDaysFilter !== 'ALL');
    if (filtered) return `<div class="plat-admin-empty" aria-label="Filtrga mos do'kon topilmadi"><span>${pIcon('search',24)}</span><b>Natija topilmadi</b><small>Qidiruv yoki filtrlarni o'zgartirib ko'ring.</small><button onclick="resetAdminShopFilters(); setAdminShopsSearch('')">Filtrlarni tozalash</button></div>`;
    return `<div class="plat-admin-empty" aria-label="Hozircha do'kon ulanmagan"><span>${pIcon('shop',24)}</span><b>Hozircha do'kon yo'q</b><small>Yangi obuna tasdiqlanib do'kon ulanganda shu yerda ko'rinadi.</small></div>`;
  }
  function renderAdminShopRow(s) {
    const left = daysUntil(s.subscriptionExpiresAt);
    const title = s.botName || s.botUsername || s.publicCode || "Nomsiz do'kon";
    const username = s.botUsername ? '@' + s.botUsername : s.publicCode || 'Bot ulanmagan';
    const expiryClass = left !== null && left <= 0 ? 'is-danger' : left !== null && left <= 7 ? 'is-warn' : '';
    const expiryText = left === null ? 'Obuna muddati yo‘q' : left <= 0 ? 'Obuna tugagan' : `${left} kun qoldi`;
    return `
      <button type="button" class="plat-admin-shop-card" onclick="openShopDetails('${s.id}')">
        <span class="plat-admin-shop-avatar">${pIcon('shop',20)}</span>
        <span class="plat-admin-shop-main">
          <span class="plat-admin-shop-title"><b>${escapeHtml(title)}</b><span class="status-pill status-${s.status}">${escapeHtml(adminShopStatusLabel(s.status))}</span></span>
          <small>${escapeHtml(username)} · owner ${escapeHtml(s.ownerTelegramId || '-')}</small>
          <span class="plat-admin-shop-meta"><em>${escapeHtml(s.tariffName || 'Tarifsiz')}</em><em class="${expiryClass}">${escapeHtml(expiryText)}</em>${s.subscriptionExpiresAt ? `<em>${formatDate(s.subscriptionExpiresAt)} gacha</em>` : ''}</span>
        </span>
        <span class="plat-admin-shop-chevron">${pIcon('arrowRight',17)}</span>
      </button>`;
  }
  function openShopDetails(shopId) {
    selectedShopDetails = adminShops.find((s) => s.id === shopId) || null;
    openPage('SHOP_DETAILS');
    loadSubscriptionHistory(shopId);
  }
  // 2026-08-28, 054-migratsiya: "Obuna tarixi" (spec 7-bo'lim) — har bir
  // tarif almashtirish/uzaytirish hodisasi to'liq breakdown bilan.
  let subscriptionHistoryForShop = null; // { shopId, rows } yoki null
  async function loadSubscriptionHistory(shopId) {
    subscriptionHistoryForShop = null;
    try {
      const data = await callPlatformApi('platform_list_subscription_history', { shopId });
      subscriptionHistoryForShop = { shopId, rows: data.history || [] };
    } catch (e) { console.error(e); }
    if (activePage === 'SHOP_DETAILS') rerenderActivePage();
  }

  // Dashboard "Muddati tugagan" KPI'dan ochiladi — status=FROZEN do'konlar,
  // muzlatilgan sanadan hozirgacha necha kun o'tganiga qarab guruhlangan.
  // Do'kon kartasi bosilsa mavjud Shop Details (Muzlatish/Qayta faollashtirish/
  // O'chirish/Kun qo'shish tugmalari allaqachon shu yerda) ochiladi — yangi
  // detail sahifa yaratilmadi, mavjudi qayta ishlatildi.
  function expiredShopAgeDays(s) {
    if (!s.frozenAt) return null;
    return Math.floor((Date.now() - new Date(s.frozenAt).getTime()) / (24 * 3600 * 1000));
  }
  function expiredShopBucket(days) {
    if (days === null) return "Muzlatilgan sana noma'lum";
    if (days <= 0) return 'Bugun muzlatilgan';
    if (days <= 7) return '1-7 kun oldin';
    if (days <= 14) return '8-14 kun oldin';
    if (days <= 30) return '15-30 kun oldin';
    return "30 kundan ortiq (o'chirish ko'rib chiqilsin)";
  }
  function renderExpiredShopsBody() {
    const list = adminShops.filter((s) => s.status === 'FROZEN');
    if (!list.length) return '<p class="empty">Hozircha muddati tugagan do\'kon yo\'q.</p>';
    const groups = new Map();
    list.slice().sort((a, b) => (expiredShopAgeDays(a) ?? -1) - (expiredShopAgeDays(b) ?? -1))
      .forEach((s) => {
        const key = expiredShopBucket(expiredShopAgeDays(s));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      });
    const bucketOrder = ['Bugun muzlatilgan', '1-7 kun oldin', '8-14 kun oldin', '15-30 kun oldin', "30 kundan ortiq (o'chirish ko'rib chiqilsin)", "Muzlatilgan sana noma'lum"];
    return bucketOrder.filter((k) => groups.has(k)).map((k) => `
      <div class="plat-expired-group">
        <h3 class="plat-expired-group-title">${escapeHtml(k)} <span>(${groups.get(k).length})</span></h3>
        <div class="card">
          ${groups.get(k).map(renderExpiredShopRow).join('')}
        </div>
      </div>
    `).join('');
  }
  function renderExpiredShopRow(s) {
    const days = expiredShopAgeDays(s);
    return `
      <div class="shop-row plat-clickable" onclick="openShopDetails('${s.id}')">
        <div>
          <div class="name">${escapeHtml(s.botName || s.botUsername || s.publicCode)}</div>
          <div class="meta">${s.botUsername ? '@' + escapeHtml(s.botUsername) : "bot yo'q"} · ${escapeHtml(s.tariffName || 'Tarifsiz')}</div>
          <div class="meta">${days === null ? "Muzlatilgan sana noma'lum" : days <= 0 ? 'Bugun muzlatildi' : `${days} kun oldin muzlatildi`}</div>
        </div>
        <span class="status-pill status-FROZEN">${statusLabel(s.status)}</span>
      </div>`;
  }
  // 2026-08-28: Billz/Click/Payme/Uzum integratsiya UX birlashtirish. Avval
  // Billz "✅ Ulangan" derdi, qolgan uchtasi "✅ Ruxsat berilgan" — ikkalasi
  // ham AYNAN bir xil narsa (platform ruxsat-tumblernin holati), lekin
  // "Ulangan" so'zi HAQIQATAN ulanganday tuyulardi — bu chalkash edi, chunki
  // ruxsat berilgan bo'lish do'kon o'zi kredensial kiritganini bildirmaydi.
  // Endi 4 tasi ham BIR XIL so'z bilan (ruxsat), + alohida, real ulanish
  // holatini *_connections jadvalidan ko'rsatadigan ikkinchi qator bilan.
  function integrationStatusBadge(status, opts) {
    opts = opts || {};
    if (status === 'ERROR') return { label: `Xatolik${opts.lastError ? ': ' + escapeHtml(opts.lastError) : ''}`, tone: 'danger' };
    if (status === 'CONNECTED') {
      if (opts.verified === false) return { label: 'Ulangan, hali tekshirilmagan', tone: 'warn' };
      if (opts.verified === true) return { label: 'Ulangan va tekshirilgan', tone: 'ok' };
      return { label: 'Ulangan', tone: 'ok' };
    }
    return { label: 'Sozlanmagan', tone: 'muted' };
  }
  function renderIntegrationRow(name, accessGranted, toggleOnclick, status, opts) {
    const badge = integrationStatusBadge(status, opts);
    return `
      <div class="plat-integration-row">
        <div class="plat-mini-row">
          <span>${name}</span>
          <button class="billz-toggle-btn status-pill ${accessGranted ? 'status-ACTIVE' : ''}" onclick="${toggleOnclick}">
            ${accessGranted ? '✅ Ruxsat berilgan' : '— Ruxsat berilmagan'}
          </button>
        </div>
        <div class="plat-integration-status-line is-${badge.tone}"><span class="plat-integration-status-dot"></span>${badge.label}</div>
      </div>
    `;
  }
  function renderShopDetailsBody() {
    const s = selectedShopDetails;
    if (!s) return '<p class="empty">Do\'kon topilmadi.</p>';
    return `
      <div class="card">
        <h2>Do'kon</h2>
        <div class="preview-row"><span>Owner</span><span>${escapeHtml(s.ownerTelegramId || '-')}</span></div>
        <div class="preview-row"><span>Telegram bot</span><span>${s.botUsername ? '@' + escapeHtml(s.botUsername) : '-'}</span></div>
        <div class="preview-row"><span>Yaratilgan</span><span>${formatDate(s.createdAt)}</span></div>
        <div class="preview-row"><span>Holati</span><span>${statusLabel(s.status)}</span></div>
      </div>
      <div class="card">
        <h2>Obuna</h2>
        <div class="preview-row"><span>Tarif</span><span>${escapeHtml(s.tariffName || 'Tarifsiz')}</span></div>
        <div class="preview-row"><span>Mahsulot limiti</span><span>${limitLabel(s.productLimit)}</span></div>
        <div class="preview-row"><span>Tugash sanasi</span><span>${s.subscriptionExpiresAt ? formatDate(s.subscriptionExpiresAt) : '-'}</span></div>
        <label for="plat-shop-tariff-select">Tarifni bog'lash / o'zgartirish</label>
        <select id="plat-shop-tariff-select">
          <option value="">— tanlang —</option>
          ${adminTariffs.length ? adminTariffs.filter((t) => t.isActive).map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('') : tariffs.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
        </select>
        <button class="secondary" onclick="applyTariffFromShopDetails('${s.id}')">Tarifni bog'lash</button>
      </div>
      ${s.status !== 'TERMINATED' ? renderGrantDaysCard(s.id) : ''}
      <div class="card">
        <h2>Integratsiyalar</h2>
        <p class="muted plat-integrations-hint">Yuqoridagi tugma faqat RUXSATni yoqadi/o'chiradi — do'kon o'zi ulanish kredensiallarini kiritmaguncha "Ulangan" bo'lib qolmaydi. Haqiqiy holat pastda.</p>
        ${renderIntegrationRow('BILLZ', s.billzAccessGranted, `toggleBillzAccess('${s.id}', ${!s.billzAccessGranted})`, s.billzConnectionStatus, { lastError: s.billzLastError })}
        ${renderIntegrationRow('CLICK', s.clickAccessGranted, `toggleClickAccess('${s.id}', ${!s.clickAccessGranted})`, s.clickConnectionStatus, { verified: s.clickVerified })}
        ${renderIntegrationRow('PAYME', s.paymeAccessGranted, `togglePaymeAccess('${s.id}', ${!s.paymeAccessGranted})`, s.paymeConnectionStatus, { verified: s.paymeVerified })}
        ${renderIntegrationRow('UZUM', s.uzumAccessGranted, `toggleUzumAccess('${s.id}', ${!s.uzumAccessGranted})`, s.uzumConnectionStatus, {})}
      </div>
      ${renderLifecycleControlsCard(s)}
      ${renderSubscriptionHistoryCard(s.id)}
    `;
  }
  function subscriptionHistoryEventLabel(eventType) {
    if (eventType === 'NEW') return 'Birinchi obuna';
    if (eventType === 'EXTEND') return 'Uzaytirildi';
    return "Tarif o'zgartirildi";
  }
  function renderSubscriptionHistoryCard(shopId) {
    if (!subscriptionHistoryForShop || subscriptionHistoryForShop.shopId !== shopId) {
      return `<div class="card"><h2>Obuna tarixi</h2><p class="muted">Yuklanmoqda...</p></div>`;
    }
    const rows = subscriptionHistoryForShop.rows;
    if (!rows.length) return `<div class="card"><h2>Obuna tarixi</h2><p class="empty">Hozircha yozuv yo'q.</p></div>`;
    return `
      <div class="card">
        <h2>Obuna tarixi</h2>
        ${rows.map((h) => `
          <div class="plat-history-row">
            <div class="plat-history-row-head"><b>${escapeHtml(subscriptionHistoryEventLabel(h.eventType))}${h.newTariffName ? ': ' + escapeHtml(h.newTariffName) : ''}</b><small>${formatDate(h.createdAt)}</small></div>
            <div class="preview-row"><span>Sotib olingan</span><span>${h.purchasedDays} kun · ${money(h.purchasedAmount)} (${h.billingPeriod === 'ANNUAL' ? 'yillik' : 'oylik'})</span></div>
            ${h.convertedDays > 0 ? `<div class="preview-row"><span>Eski tarifdan konvertatsiya</span><span>${Math.round(h.remainingPaidDaysBefore)} kun (${money(h.remainingValueConverted)}) → +${h.convertedDays} kun</span></div>` : ''}
            ${h.bonusDays > 0 ? `<div class="preview-row"><span>Bonus kunlar</span><span>${h.bonusDays} kun</span></div>` : ''}
            <div class="preview-row"><span>Yangi tugash sanasi</span><span>${formatDate(h.newExpiresAt)}</span></div>
          </div>
        `).join('')}
      </div>
    `;
  }
  async function applyTariffFromShopDetails(shopId) {
    const sel = document.getElementById('plat-shop-tariff-select');
    const tariffId = sel ? sel.value : '';
    if (!tariffId) return alert('Tarif tanlang.');
    try {
      await callPlatformApi('platform_apply_tariff', { shopId, tariffId, notifyCustomer: true });
      await reloadAdminShops();
      selectedShopDetails = adminShops.find((s) => s.id === shopId) || null;
      alert('Tarif bog\'landi.');
      render();
      loadSubscriptionHistory(shopId);
    } catch (e) { alert(e.message || String(e)); }
  }

  // ---- 15-band: qo'lda kun qo'shish -------------------------------------
  function renderGrantDaysCard(shopId) {
    const days = [1, 3, 7, 14];
    const reasons = ['Texnik nosozlik', 'Kompensatsiya', 'Aksiya'];
    return `
      <div class="card">
        <h2>Kun qo'shish</h2>
        <div style="display:flex; gap:6px; flex-wrap:wrap">
          ${days.map((d) => `<button class="plat-small-btn ${grantDaysPreset === d ? 'primary' : 'secondary'}" style="width:auto" onclick="setGrantDaysPreset(${d})">+${d} kun</button>`).join('')}
          <button class="plat-small-btn ${grantDaysPreset === 'other' ? 'primary' : 'secondary'}" style="width:auto" onclick="setGrantDaysPreset('other')">Boshqa</button>
        </div>
        ${grantDaysPreset === 'other' ? `<input type="text" id="plat-grant-days-custom" inputmode="numeric" placeholder="Kun soni" style="margin-top:8px">` : ''}
        <label style="margin-top:10px">Sabab</label>
        <select id="plat-grant-days-reason-select" onchange="setGrantDaysReasonPreset(this.value)">
          <option value="">— tanlang —</option>
          ${reasons.map((r) => `<option value="${r}" ${grantDaysReasonPreset === r ? 'selected' : ''}>${r}</option>`).join('')}
          <option value="other" ${grantDaysReasonPreset === 'other' ? 'selected' : ''}>Boshqa</option>
        </select>
        ${grantDaysReasonPreset === 'other' ? `<input type="text" id="plat-grant-days-reason-other" placeholder="Sababni yozing" style="margin-top:8px">` : ''}
        <button class="primary ${grantDaysSubmitting ? 'plat-btn-dimmed' : ''}" style="margin-top:10px" onclick="submitGrantDays('${shopId}')">${grantDaysSubmitting ? '<span class="spinner"></span> Yuborilmoqda...' : "Kun qo'shish"}</button>
      </div>
    `;
  }
  function setGrantDaysPreset(preset) { grantDaysPreset = preset; render(); }
  function setGrantDaysReasonPreset(preset) { grantDaysReasonPreset = preset; render(); }
  async function submitGrantDays(shopId) {
    if (grantDaysSubmitting) return;
    const days = grantDaysPreset === 'other'
      ? Number((document.getElementById('plat-grant-days-custom')?.value || '').trim())
      : Number(grantDaysPreset);
    if (!Number.isFinite(days) || days <= 0) return alert('Kun sonini tanlang yoki kiriting.');
    const reason = grantDaysReasonPreset === 'other'
      ? (document.getElementById('plat-grant-days-reason-other')?.value || '').trim()
      : (grantDaysReasonPreset || '');
    if (!reason) return alert('Sababni tanlang yoki kiriting.');
    grantDaysSubmitting = true;
    render();
    try {
      await callPlatformApi('platform_grant_subscription_days', { shopId, days, reason });
      grantDaysPreset = null;
      grantDaysReasonPreset = null;
      await reloadAdminShops();
      selectedShopDetails = adminShops.find((s) => s.id === shopId) || null;
      showActionToast("✅ Kun qo'shildi.");
    } catch (e) { alert(e.message || String(e)); }
    finally { grantDaysSubmitting = false; render(); }
  }
  // Kichik, ekranni bloklamaydigan holat xabari (mavjud shop-app'dagi
  // showActionToast naqshiga o'xshash, lekin platform.css'ning o'zida — bu
  // yerda shunchaki qisqa alert() bilan almashtiriladi, alohida toast UI
  // hozircha yo'q.
  function showActionToast(text) { alert(text); }

  // ---- 16/18/19-bandlar: muzlatish/qayta faollashtirish/o'chirish -------
  function renderLifecycleControlsCard(s) {
    if (s.status === 'PROVISIONING') return '';
    return `
      <div class="card">
        <h2>Boshqaruv</h2>
        ${s.status === 'ACTIVE' ? `
          <label>Muzlatish sababi</label>
          <input type="text" id="plat-freeze-reason" list="plat-freeze-reasons" placeholder="Sababni tanlang yoki yozing">
          <datalist id="plat-freeze-reasons">${(platformLifecycleSettings.freezeReasons||[]).map((reason)=>`<option value="${escapeHtml(reason)}"></option>`).join('')}</datalist>
          <button class="secondary ${lifecycleActionSubmitting ? 'plat-btn-dimmed' : ''}" onclick="submitFreezeShop('${s.id}')">❄️ Muzlatish</button>
        ` : ''}
        ${s.status === 'FROZEN' ? `<button class="primary ${lifecycleActionSubmitting ? 'plat-btn-dimmed' : ''}" onclick="submitReactivateShop('${s.id}')">✅ Qayta faollashtirish</button>` : ''}
        ${s.status !== 'TERMINATED' ? renderTerminateSection(s.id) : '<p class="muted">Bu do\'kon o\'chirilgan.</p>'}
      </div>
    `;
  }
  function renderTerminateSection(shopId) {
    if (terminateStep === 'reason') {
      return `
        <label style="margin-top:14px">O'chirish sababi</label>
        <input type="text" id="plat-terminate-reason" list="plat-terminate-reasons" value="${escapeHtml(terminateReasonDraft)}" placeholder="Sababni tanlang yoki yozing" oninput="terminateReasonDraft=this.value">
        <datalist id="plat-terminate-reasons">${(platformLifecycleSettings.terminateReasons||[]).map((reason)=>`<option value="${escapeHtml(reason)}"></option>`).join('')}</datalist>
        <div style="display:flex; gap:8px; margin-top:8px">
          <button class="secondary" style="flex:1; margin-top:0" onclick="cancelTerminateShop()">Bekor qilish</button>
          <button class="secondary" style="flex:1; margin-top:0; color:#dc2626" onclick="confirmTerminateStepReason()">Davom etish</button>
        </div>
      `;
    }
    if (terminateStep === 'confirm') {
      return `
        <div class="notice error" style="margin-top:14px">Bu amal do'kon faoliyatini to'xtatadi. Davom etasizmi?</div>
        <div style="display:flex; gap:8px; margin-top:8px">
          <button class="secondary" style="flex:1; margin-top:0" onclick="cancelTerminateShop()">Bekor qilish</button>
          <button class="secondary ${lifecycleActionSubmitting ? 'plat-btn-dimmed' : ''}" style="flex:1; margin-top:0; color:#dc2626" onclick="submitTerminateShop('${shopId}')">${lifecycleActionSubmitting ? '<span class="spinner"></span>' : "Ha, o'chirish"}</button>
        </div>
      `;
    }
    return `<button class="secondary" style="margin-top:14px; color:#dc2626" onclick="startTerminateShop()">🗑 O'chirish</button>`;
  }
  function startTerminateShop() { terminateStep = 'reason'; terminateReasonDraft = ''; render(); }
  function cancelTerminateShop() { terminateStep = null; terminateReasonDraft = ''; render(); }
  function confirmTerminateStepReason() {
    const reason = (document.getElementById('plat-terminate-reason')?.value || '').trim();
    if (!reason) return alert('Sababni kiriting.');
    terminateReasonDraft = reason;
    terminateStep = 'confirm';
    render();
  }
  async function submitFreezeShop(shopId) {
    if (lifecycleActionSubmitting) return;
    const reason = (document.getElementById('plat-freeze-reason')?.value || '').trim();
    if (!reason) return alert('Sababni kiriting.');
    lifecycleActionSubmitting = true;
    render();
    try {
      await callPlatformApi('platform_freeze_shop', { shopId, reason });
      await reloadAdminShops();
      selectedShopDetails = adminShops.find((s) => s.id === shopId) || null;
    } catch (e) { alert(e.message || String(e)); }
    finally { lifecycleActionSubmitting = false; render(); }
  }
  async function submitReactivateShop(shopId) {
    if (lifecycleActionSubmitting) return;
    lifecycleActionSubmitting = true;
    render();
    try {
      await callPlatformApi('platform_reactivate_shop', { shopId });
      await reloadAdminShops();
      selectedShopDetails = adminShops.find((s) => s.id === shopId) || null;
    } catch (e) { alert(e.message || String(e)); }
    finally { lifecycleActionSubmitting = false; render(); }
  }
  async function submitTerminateShop(shopId) {
    if (lifecycleActionSubmitting) return;
    const reason = terminateReasonDraft.trim();
    if (!reason) return alert('Sababni kiriting.');
    lifecycleActionSubmitting = true;
    render();
    try {
      await callPlatformApi('platform_terminate_shop', { shopId, reason });
      terminateStep = null;
      terminateReasonDraft = '';
      await reloadAdminShops();
      selectedShopDetails = adminShops.find((s) => s.id === shopId) || null;
    } catch (e) { alert(e.message || String(e)); }
    finally { lifecycleActionSubmitting = false; render(); }
  }

  // Billz (billz.ai) integratsiyasi — boshqarilgan/beta chiqarilish: faqat
  // bosh admin qaysi do'konlarga ruxsat berganini belgilaydi. Mantiq
  // O'ZGARTIRILMAGAN — faqat joylashuvi Shop Details sahifasiga ko'chdi.
  async function toggleBillzAccess(shopId, enable) {
    try {
      await callPlatformApi('platform_set_billz_access', { shopId, enabled: enable });
      await reloadAdminShops();
      selectedShopDetails = adminShops.find((s) => s.id === shopId) || selectedShopDetails;
      render();
    } catch (e) { alert(e.message || String(e)); }
  }
  // Click.uz avtomatik to'lov integratsiyasi — Billz'ning aynan bir xil
  // ruxsat-darvoza naqshi.
  async function toggleClickAccess(shopId, enable) {
    try {
      await callPlatformApi('platform_set_click_access', { shopId, enabled: enable });
      await reloadAdminShops();
      selectedShopDetails = adminShops.find((s) => s.id === shopId) || selectedShopDetails;
      render();
    } catch (e) { alert(e.message || String(e)); }
  }
  // Payme/Uzum avtomatik to'lov integratsiyasi — aynan bir xil naqsh.
  async function togglePaymeAccess(shopId, enable) {
    try {
      await callPlatformApi('platform_set_payme_access', { shopId, enabled: enable });
      await reloadAdminShops();
      selectedShopDetails = adminShops.find((s) => s.id === shopId) || selectedShopDetails;
      render();
    } catch (e) { alert(e.message || String(e)); }
  }
  async function toggleUzumAccess(shopId, enable) {
    try {
      await callPlatformApi('platform_set_uzum_access', { shopId, enabled: enable });
      await reloadAdminShops();
      selectedShopDetails = adminShops.find((s) => s.id === shopId) || selectedShopDetails;
      render();
    } catch (e) { alert(e.message || String(e)); }
  }

  // ---- Bot ulash (mavjud funksiya, xatti-harakati o'zgarishsiz) ---------
  function renderConnectShopBody() {
    const v = verifyResult;
    return `
      <div class="card">
        <h2>1. Bot token</h2>
        <label for="f-token">Telegram bot token</label>
        <input type="password" id="f-token" autocomplete="off" placeholder="123456789:AA...">
        <button class="primary" id="btn-verify" ${verifying ? 'disabled' : ''}>${verifying ? '<span class="spinner"></span> Tekshirilmoqda...' : 'Tekshirish'}</button>
        ${v ? `
          <div class="preview-row"><span>Bot</span><span>${escapeHtml(v.name || '-')} ${v.username ? '(@' + escapeHtml(v.username) + ')' : ''}</span></div>
          <div class="preview-row"><span>Telegram bot ID</span><span>${escapeHtml(v.telegramBotId)}</span></div>
          ${v.alreadyConnected ? '<p class="notice error">Bu bot allaqachon boshqa do\'konga ulangan.</p>' : ''}
          ${v.retryable ? '<p class="notice warn">Bu bot avval ulanishga urinilgan, lekin tugallanmagan — hozir qayta urinish sifatida davom etadi.</p>' : ''}
          ${!v.alreadyConnected ? '<p class="notice success">✓ Token to\'g\'ri. OWNER ID kiriting.</p>' : ''}
        ` : ''}
      </div>
      ${v && !v.alreadyConnected ? `
      <div class="card">
        <h2>2. Do'kon egasi (OWNER)</h2>
        <label for="f-owner">OWNER Telegram ID (raqam)</label>
        <input type="text" id="f-owner" inputmode="numeric" placeholder="123456789">
        <button class="primary" id="btn-connect" ${connecting ? 'disabled' : ''}>${connecting ? '<span class="spinner"></span> Ulanmoqda...' : 'Ulash'}</button>
      </div>` : ''}
      ${connectError ? `<div class="notice error">${escapeHtml(connectError)}</div>` : ''}
      ${connectSuccess ? `<div class="notice success">✓ Do'kon ulandi (holat: ${escapeHtml(connectSuccess.status)}).</div>` : ''}
    `;
  }
  function wireConnectShopView() {
    const tokenInput = document.getElementById('f-token');
    const verifyBtn = document.getElementById('btn-verify');
    if (verifyBtn) verifyBtn.onclick = async () => {
      const token = (tokenInput.value || '').trim();
      if (!token) return;
      connectError = null; verifying = true; rerenderActivePage();
      try {
        const result = await callPlatformApi('platform_verify_bot', { botToken: token });
        pendingBotToken = token;
        verifyResult = result;
      } catch (e) { connectError = e.message || String(e); pendingBotToken = ''; }
      finally { verifying = false; rerenderActivePage(); }
    };
    const ownerInput = document.getElementById('f-owner');
    const connectBtn = document.getElementById('btn-connect');
    if (connectBtn) connectBtn.onclick = async () => {
      const ownerId = (ownerInput.value || '').trim();
      if (!/^\d{5,15}$/.test(ownerId)) { connectError = "OWNER Telegram ID noto'g'ri."; rerenderActivePage(); return; }
      if (!pendingBotToken) { connectError = "Token yo'qoldi, qaytadan tekshiring."; rerenderActivePage(); return; }
      connectError = null; connecting = true; rerenderActivePage();
      try {
        const result = await callPlatformApi('platform_connect_bot', { botToken: pendingBotToken, ownerTelegramId: ownerId });
        connectSuccess = result;
        if (result.error === 'telegram_config_failed_retry_available') {
          connectError = 'Do\'kon yaratildi, lekin Telegram sozlamalari (menu/webhook) muvaffaqiyatsiz bo\'ldi. "Tekshirish" tugmasini bosib qayta urining.';
        } else {
          await reloadAdminShops();
        }
      } catch (e) { connectError = e.message || String(e); }
      finally { pendingBotToken = ''; connecting = false; rerenderActivePage(); }
    };
  }

  // ======================================================================
  // USER: Arizalarim / ariza holati / chek yuborish
  // ======================================================================
  function receiptSourceLabel(source) {
    if (source === 'PAYMENT_PAGE') return "To'lov oynasi";
    if (source === 'MY_REQUESTS') return 'Arizalarim';
    if (source === 'TELEGRAM_BOT') return 'Telegram bot';
    return '—';
  }
  function requestShopName(r) {
    if (r?.requestedShopName) return r.requestedShopName;
    const shop = myShops.find((s) => s.id === r?.shopId) || adminShops.find((s) => s.id === r?.shopId);
    return shop ? (shop.shopName || shop.name || shop.botUsername || "Do'kon") : "Do'kon";
  }
  function userRequestDisplayStatus(r) {
    if (r.status === 'REJECTED') return { key: 'REJECTED', label: 'Rad etildi', tone: 'danger' };
    if (r.status === 'APPROVED' && r.shopCreated) return { key: 'ACTIVATED', label: "Do'kon faollashtirildi", tone: 'ok' };
    if (r.status === 'APPROVED') return { key: 'PAYMENT_APPROVED', label: "To'lov tasdiqlandi", tone: 'ok' };
    if (r.paymentClaimedAt) return { key: 'REVIEWING', label: "To'lov tekshirilmoqda", tone: 'info' };
    return { key: 'PAYMENT_PENDING', label: "To'lov kutilmoqda", tone: 'muted' };
  }
  function requestSecondaryStatus(r) {
    if (r.status !== 'NEW') return null;
    if (r.hasReceipt) return { key: 'RECEIPT_SENT', label: 'Chek yuborildi', tone: 'info' };
    if (r.receiptRequestedAt) return { key: 'RECEIPT_REQUESTED', label: "Chek so'raldi", tone: 'warn' };
    return null;
  }
  async function loadMyRequests(shouldRender = true) {
    if (myRequestsLoading) return;
    myRequestsLoading = true;
    try {
      const data = await callPlatformApi('platform_list_my_subscription_requests', {});
      myRequests = Array.isArray(data.requests) ? data.requests : [];
      if (selectedMyRequestId && !myRequests.some((r) => r.id === selectedMyRequestId)) selectedMyRequestId = null;
    } catch (e) { console.error('load my requests error', e); }
    finally {
      myRequestsLoading = false;
      if (shouldRender && !isAdminMode && (activePage === 'MY_REQUESTS' || activePage === 'MY_REQUEST_DETAILS' || (!activePage && currentTab === 'home'))) render();
    }
  }
  async function loadRequestHistory(requestId, shouldRender = true) {
    if (!requestId || requestHistoryLoadingId === requestId) return;
    requestHistoryLoadingId = requestId;
    try {
      const data = await callPlatformApi('platform_get_subscription_request_history', { requestId });
      requestHistoryById[requestId] = Array.isArray(data.history) ? data.history : [];
      if (data.request) {
        const userIdx = myRequests.findIndex((r) => r.id === requestId);
        if (userIdx >= 0) myRequests[userIdx] = data.request;
        const adminIdx = requests.findIndex((r) => r.id === requestId);
        if (adminIdx >= 0) requests[adminIdx] = data.request;
      }
    } catch (e) { console.error('request history error', e); }
    finally {
      requestHistoryLoadingId = null;
      if (shouldRender && ['MY_REQUEST_DETAILS','REQUEST_DETAILS'].includes(activePage)) render();
    }
  }
  function openMyRequests() {
    if (isAdminMode) return;
    selectedMyRequestId = null;
    openPage('MY_REQUESTS');
    loadMyRequests();
  }
  function openMyRequestDetails(requestId, autoUpload) {
    if (isAdminMode) return;
    selectedMyRequestId = requestId;
    clearMyRequestReceiptFile(false);
    openPage('MY_REQUEST_DETAILS');
    loadRequestHistory(requestId);
    if (autoUpload) setTimeout(() => document.getElementById('plat-my-request-receipt')?.click(), 120);
  }
  function renderMyRequestsBody() {
    if (myRequestsLoading && !myRequests.length) return `<div class="plat-request-list-loading"><span class="spinner"></span><b>Arizalar yuklanmoqda...</b></div>`;
    if (!myRequests.length) return `<div class="plat-my-requests-empty"><span>${pIcon('inbox',28)}</span><h2>Hozircha ariza yo'q</h2><p>Yangi do'kon, obuna uzaytirish yoki tarif o'zgartirish so'rovlari shu yerda ko'rinadi.</p></div>`;
    return `<div class="plat-my-requests-intro"><span class="plat-admin-eyebrow">Ariza markazi</span><h2>Barcha so'rovlaringiz bir joyda</h2><p>Holat, chek so'rovi va yakuniy natijani kuzating.</p></div><div class="plat-my-request-list">${myRequests.map(renderMyRequestCard).join('')}</div>`;
  }
  function renderMyRequestCard(r) {
    const ds = userRequestDisplayStatus(r);
    const shopName = requestShopName(r);
    const secondary = requestSecondaryStatus(r);
    return `<button class="plat-my-request-card" onclick="openMyRequestDetails('${r.id}')">
      <span class="plat-my-request-card-icon">${pIcon(r.kind === 'NEW_SHOP' ? 'shop' : 'diamond',18)}</span>
      <span class="plat-my-request-card-main"><span class="plat-my-request-card-top"><b>${escapeHtml(requestTypeLabel(r))}</b><span class="plat-request-status-stack"><em class="plat-request-status-pill is-${ds.tone}">${escapeHtml(ds.label)}</em>${secondary?`<em class="plat-request-secondary-pill is-${secondary.tone}">${escapeHtml(secondary.label)}</em>`:''}</span></span><strong>${escapeHtml(shopName)}</strong><small>${escapeHtml(r.tariffName)} · ${r.billingPeriod === 'ANNUAL' ? 'Yillik' : 'Oylik'} · ${money(r.tariffPrice)}</small><span>${formatDateTime(r.createdAt)}</span></span>
      <span class="plat-my-request-chevron">${pIcon('arrowRight',16)}</span>
    </button>`;
  }
  function historyEventInfo(h) {
    const source = h?.metadata?.source ? ` · ${receiptSourceLabel(String(h.metadata.source))}` : '';
    if (h.eventType === 'PAYMENT_STARTED') return { icon: 'wallet', label: "To'lov oynasi ochildi", note: '' };
    if (h.eventType === 'REQUEST_SUBMITTED') return { icon: 'send', label: "So'rov yuborildi", note: '' };
    if (h.eventType === 'PAYMENT_CLAIMED') return { icon: 'clock', label: "To'ladim bosildi", note: '' };
    if (h.eventType === 'RECEIPT_REQUESTED') return { icon: 'file', label: "Chek so'raldi", note: '' };
    if (h.eventType === 'RECEIPT_UPLOADED') return { icon: 'upload', label: 'Chek yuborildi', note: source };
    if (h.eventType === 'PAYMENT_APPROVED') return { icon: 'check', label: "To'lov tasdiqlandi", note: '' };
    if (h.eventType === 'REQUEST_REJECTED') return { icon: 'info', label: 'Rad etildi', note: h?.metadata?.reason ? ` · ${String(h.metadata.reason)}` : '' };
    if (h.eventType === 'SHOP_CREATED') return { icon: 'shop', label: "Do'kon yaratildi", note: h?.metadata?.shopName ? ` · ${String(h.metadata.shopName)}` : '' };
    return { icon: 'clock', label: String(h.eventType || 'Yangilandi').replaceAll('_',' '), note: '' };
  }
  function fallbackRequestHistory(r) {
    const rows = [];
    if (r.createdAt) rows.push({ eventType:(r.kind === 'NEW_SHOP' && !r.paymentClaimedAt ? 'PAYMENT_STARTED' : 'REQUEST_SUBMITTED'), createdAt:r.createdAt, metadata:{} });
    if (r.paymentClaimedAt) rows.push({ eventType:'PAYMENT_CLAIMED', createdAt:r.paymentClaimedAt, metadata:{} });
    if (r.receiptRequestedAt) rows.push({ eventType:'RECEIPT_REQUESTED', createdAt:r.receiptRequestedAt, metadata:{} });
    if (r.receiptUploadedAt) rows.push({ eventType:'RECEIPT_UPLOADED', createdAt:r.receiptUploadedAt, metadata:{source:r.receiptSource} });
    if (r.reviewedAt && r.status === 'APPROVED') rows.push({ eventType:'PAYMENT_APPROVED', createdAt:r.reviewedAt, metadata:{} });
    if (r.reviewedAt && r.status === 'REJECTED') rows.push({ eventType:'REQUEST_REJECTED', createdAt:r.reviewedAt, metadata:{reason:r.rejectReason} });
    if (r.appliedAt) rows.push({ eventType:'SHOP_CREATED', createdAt:r.appliedAt, metadata:{shopName:r.requestedShopName,ownerTelegramId:r.ownerTelegramId} });
    return rows.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  }
  function renderRequestTimeline(history, r) {
    const rows = Array.isArray(history) && history.length ? history : fallbackRequestHistory(r);
    if (!rows.length) return `<p class="muted">Tarix hali shakllanmagan.</p>`;
    return `<div class="plat-application-timeline">${rows.map((h,idx) => { const info = historyEventInfo(h); return `<div class="plat-application-timeline-row ${idx===rows.length-1?'is-latest':''}"><span class="plat-application-timeline-dot">${pIcon(info.icon,14)}</span><div><b>${escapeHtml(info.label)}</b>${info.note?`<small>${escapeHtml(info.note.replace(/^ · /,''))}</small>`:''}<time>${formatDateTime(h.createdAt)}</time></div></div>`; }).join('')}</div>`;
  }
  function renderMyRequestDetailsBody() {
    const r = myRequests.find((x) => x.id === selectedMyRequestId);
    if (!r) return `<div class="plat-my-requests-empty"><span>${pIcon('info',26)}</span><h2>Ariza topilmadi</h2><button class="secondary" onclick="openMyRequests()">Arizalarga qaytish</button></div>`;
    const ds = userRequestDisplayStatus(r);
    const secondary = requestSecondaryStatus(r);
    const isPaymentDraft = r.kind === 'NEW_SHOP' && r.status === 'NEW' && !r.paymentClaimedAt;
    const needsReceipt = r.status === 'NEW' && !!r.paymentClaimedAt && !!r.receiptRequestedAt && !r.hasReceipt;
    const history = requestHistoryById[r.id] || [];
    return `<div class="plat-application-detail-hero"><div><span class="plat-admin-eyebrow">${escapeHtml(requestTypeLabel(r))}</span><h2>${escapeHtml(requestShopName(r))}</h2><p>${escapeHtml(r.tariffName)} · ${r.billingPeriod === 'ANNUAL' ? 'Yillik' : 'Oylik'}</p></div><span class="plat-request-status-stack"><span class="plat-request-status-pill is-${ds.tone}">${escapeHtml(ds.label)}</span>${secondary?`<span class="plat-request-secondary-pill is-${secondary.tone}">${escapeHtml(secondary.label)}</span>`:''}</span></div>
      ${isPaymentDraft ? `<section class="plat-payment-draft-resume"><span>${pIcon('wallet',20)}</span><div><h3>To'lov hali tasdiqlanmagan</h3><p>Telegram oynasi yopilib qolgan bo'lsa ham shu arizadan to'lovni davom ettirishingiz mumkin.</p><small>Ariza ${escapeHtml(paymentDraftTimeLeftLabel(r.paymentDeadlineAt))} ichida avtomatik o'chadi.</small><button class="primary" onclick="resumeNewShopPayment('${r.id}')">${pIcon('arrowRight',16)} To'lovni davom ettirish</button></div></section>` : ''}
      ${needsReceipt ? `<section class="plat-receipt-attention is-detail"><span class="plat-receipt-attention-icon">${pIcon('file',20)}</span><div><h3>To'lovni tasdiqlash uchun chek kerak</h3><p>To'lovingizni aniqlay olmadik. Tekshiruvni davom ettirish uchun to'lov chekini yuboring.</p></div></section>` : ''}
      <section class="plat-application-info-grid">
        <div><small>Ariza ID</small><b class="is-code">${escapeHtml(r.id)}</b></div><div><small>Summa</small><b>${money(r.tariffPrice)}</b></div>
        <div><small>Yaratildi</small><b>${formatDateTime(r.createdAt)}</b></div><div><small>To'lov usuli</small><b>${r.paymentMethod ? escapeHtml(paymentProviderName(r.paymentMethod)) : 'Hali tanlanmagan'}</b></div>
        ${r.kind === 'NEW_SHOP' ? `<div><small>Owner Telegram ID</small><b>${escapeHtml(r.ownerTelegramId || '—')}</b></div><div><small>Do'kon nomi</small><b>${escapeHtml(r.requestedShopName || 'Hali kiritilmagan')}</b></div>` : ''}
        ${r.hasReceipt ? `<div><small>Chek yuborilgan joy</small><b>${escapeHtml(receiptSourceLabel(r.receiptSource))}</b></div><div><small>Chek vaqti</small><b>${formatDateTime(r.receiptUploadedAt)}</b></div>` : ''}
      </section>
      ${(isPaymentDraft || needsReceipt) ? renderMyRequestReceiptUpload(r) : r.status === 'NEW' && r.hasReceipt ? `<div class="plat-receipt-sent-state"><span>${pIcon('check',18)}</span><div><b>✅ Chek yuborildi</b><small>To'lovingiz tekshirilmoqda.</small></div></div>` : ''}
      ${r.status === 'REJECTED' && r.rejectReason ? `<div class="notice error">Rad etish sababi: ${escapeHtml(r.rejectReason)}</div>` : ''}
      ${r.kind === 'NEW_SHOP' && r.shopCreated ? `<div class="plat-shop-created-user"><span>${pIcon('shop',20)}</span><div><b>Do'kon faollashtirildi</b><small>${escapeHtml(r.requestedShopName || requestShopName(r))} owner Telegram ID ${escapeHtml(r.ownerTelegramId || '—')} ga biriktirildi.</small></div></div>` : ''}
      <section class="plat-application-timeline-card"><div class="plat-application-section-title"><span>${pIcon('clock',17)}</span><div><b>Ariza tarixi</b><small>Har bir bosqich server vaqti bilan qayd etiladi.</small></div></div>${requestHistoryLoadingId===r.id && !history.length?`<div class="plat-request-list-loading"><span class="spinner"></span></div>`:renderRequestTimeline(history,r)}</section>`;
  }

  function renderMyRequestReceiptUpload(r) {
    return `<section class="plat-my-request-upload"><div class="plat-application-section-title"><span>${pIcon('upload',17)}</span><div><b>Chekni yuborish</b><small>JPG, PNG yoki WebP · 6 MB gacha</small></div></div>
      <input id="plat-my-request-receipt" type="file" hidden onchange="onMyRequestReceiptPicked(event)">
      ${myRequestReceiptPreviewUrl ? `<img src="${myRequestReceiptPreviewUrl}" alt="Chek preview" class="plat-my-request-receipt-preview">` : ''}
      ${myRequestReceiptFile ? `<div class="plat-upload-file-row"><span>${pIcon('file',15)} ${escapeHtml(myRequestReceiptFile.name)}</span><button onclick="clearMyRequestReceiptFile()">Olib tashlash</button></div>` : `<button class="secondary plat-upload-select" onclick="document.getElementById('plat-my-request-receipt').click()">${pIcon('upload',16)} Faylni tanlash</button>`}
      <button class="primary ${!myRequestReceiptFile || attachingMyRequestReceipt ? 'plat-btn-dimmed' : ''}" ${myRequestReceiptFile && !attachingMyRequestReceipt ? `onclick="attachMyRequestReceipt('${r.id}')"` : 'disabled'}>${attachingMyRequestReceipt?'<span class="spinner"></span> Yuborilmoqda...':"Chekni yuborish"}</button>
      <p class="plat-upload-bot-note">Yoki UStorE botga chek rasmini yuborishingiz mumkin. Bir nechta ochiq ariza bo'lsa, bot qaysi ariza ekanini tanlatadi.</p></section>`;
  }
  function onMyRequestReceiptPicked(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { alert('Faqat JPG, PNG yoki WebP rasm qabul qilinadi.'); return; }
    if (file.size > 6 * 1024 * 1024) { alert("Rasm hajmi 6MB dan katta bo'lmasin."); return; }
    clearMyRequestReceiptFile(false);
    myRequestReceiptFile = file;
    myRequestReceiptPreviewUrl = URL.createObjectURL(file);
    render();
  }
  function clearMyRequestReceiptFile(shouldRender = true) {
    myRequestReceiptFile = null;
    if (myRequestReceiptPreviewUrl) { try { URL.revokeObjectURL(myRequestReceiptPreviewUrl); } catch (_) {} }
    myRequestReceiptPreviewUrl = null;
    if (shouldRender) render();
  }
  async function attachMyRequestReceipt(requestId) {
    if (attachingMyRequestReceipt || !myRequestReceiptFile) return;
    attachingMyRequestReceipt = true; render();
    try {
      const upload = { base64: await fileToBase64(myRequestReceiptFile), mimeType: myRequestReceiptFile.type, fileName: myRequestReceiptFile.name };
      await callPlatformApi('platform_attach_request_receipt', { requestId, receiptImageUpload: upload, source: 'MY_REQUESTS' });
      clearMyRequestReceiptFile(false);
      await loadMyRequests(false);
      await loadRequestHistory(requestId, false);
      render();
    } catch (e) { alert(e.message || String(e)); }
    finally { attachingMyRequestReceipt = false; render(); }
  }
  function lifecycleUserText(template, shop) {
    const reason = shop?.lifecycleReason || "Administrator tomonidan belgilangan";
    const support = platformLifecycleSettings.supportLabel || "Admin bilan bog'lanish";
    return String(template || '')
      .replaceAll('{SHOP_NAME}', shop?.shopName || shop?.name || "Do'kon")
      .replaceAll('{REASON}', reason)
      .replaceAll('{ACTION}', platformLifecycleSettings.freezeActionText || '')
      .replaceAll('{SUPPORT_CONTACT}', support);
  }
  function openLifecycleSupport() {
    const url = String(platformLifecycleSettings.supportUrl || '').trim();
    if (url) {
      try { if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank'); }
      catch (_) { window.open(url, '_blank'); }
      return;
    }
    switchTab('help');
  }
  function renderUserLifecycleAttention() {
    if (isAdminMode) return '';
    const affected = myShops.filter((s) => s.status === 'FROZEN' || s.status === 'TERMINATED');
    if (!affected.length) return '';
    const shop = affected.find((s) => s.status === 'TERMINATED') || affected[0];
    const terminated = shop.status === 'TERMINATED';
    const title = terminated ? platformLifecycleSettings.terminateUserTitle : platformLifecycleSettings.freezeUserTitle;
    const body = lifecycleUserText(terminated ? platformLifecycleSettings.terminateUserBody : platformLifecycleSettings.freezeUserBody, shop);
    return `<section class="plat-lifecycle-attention ${terminated?'is-terminated':'is-frozen'}">
      <span class="plat-lifecycle-attention-icon">${pIcon(terminated?'info':'lock',22)}</span>
      <div class="plat-lifecycle-attention-copy"><span class="plat-admin-eyebrow">${terminated?"Do'kon o'chirilgan":"Do'kon muzlatilgan"}</span><h3>${escapeHtml(title)}</h3><p><b>${escapeHtml(shop.shopName || shop.name || "Do'kon")}</b></p><div class="plat-lifecycle-message">${escapeHtml(body).replaceAll('\\n','<br>')}</div>
      ${shop.lifecycleChangedAt?`<small>${formatDateTime(shop.lifecycleChangedAt)}</small>`:''}
      <div class="plat-lifecycle-actions">${!terminated?`<button class="secondary" onclick="switchTab('subscription')">Obunani ko'rish</button>`:''}<button class="primary" onclick="openLifecycleSupport()">${escapeHtml(platformLifecycleSettings.supportLabel || "Admin bilan bog'lanish")}</button></div></div>
    </section>`;
  }

  function renderUserRequestsHomeTop() {
    if (isAdminMode) return '';
    const needsReceipt = myRequests.find((r) => r.status === 'NEW' && r.receiptRequestedAt && !r.hasReceipt);
    const receiptSent = myRequests.find((r) => r.status === 'NEW' && r.receiptRequestedAt && r.hasReceipt);
    const active = needsReceipt || receiptSent;
    const attention = !active ? '' : needsReceipt
      ? `<section class="plat-receipt-attention"><span class="plat-receipt-attention-icon">${pIcon('file',20)}</span><div class="plat-receipt-attention-copy"><h3>To'lovni tasdiqlash uchun chek kerak</h3><p><b>${escapeHtml(requestShopName(needsReceipt))}</b> do'koni bo'yicha to'lovingizni aniqlay olmadik. Tekshiruvni davom ettirish uchun chek yuboring.</p><div><button class="primary" onclick="openMyRequestDetails('${needsReceipt.id}',true)">Chekni yuborish</button><button class="secondary" onclick="openMyRequestDetails('${needsReceipt.id}')">Arizani ko'rish</button></div></div></section>`
      : `<section class="plat-receipt-attention is-sent"><span class="plat-receipt-attention-icon">${pIcon('check',20)}</span><div class="plat-receipt-attention-copy"><h3>✅ Chek yuborildi</h3><p>To'lovingiz tekshirilmoqda.</p><div><button class="secondary" onclick="openMyRequestDetails('${receiptSent.id}')">Arizani ko'rish</button></div></div></section>`;
    const openCount = myRequests.filter((r) => r.status === 'NEW').length;
    return `${attention}<button class="plat-my-requests-home-link" onclick="openMyRequests()"><span>${pIcon('inbox',18)}</span><span><b>Arizalarim</b><small>${myRequests.length ? `${myRequests.length} ta ariza · ${openCount} ta faol` : "So'rovlaringiz holatini kuzating"}</small></span>${pIcon('arrowRight',16)}</button>`;
  }

  // ======================================================================
  // ADMIN: So'rovlar
  // ======================================================================
  async function loadRequests() {
    requestsLoading = true;
    try {
      const data = await callPlatformApi('platform_list_subscription_requests', {});
      requests = data.requests || [];
      if (selectedRequestId && !requests.some((r)=>r.id===selectedRequestId)) selectedRequestId = null;
    } catch (e) { console.error(e); }
    finally { requestsLoading = false; if (currentTab === 'requests') render(); }
  }
  function setRequestsFilter(f) { requestsFilter = f; requestsSubFilter = 'ALL'; loadRequests(); }
  function setRequestsSubFilter(v) { requestsSubFilter = v; render(); }
  function requestDisplayStatus(r) {
    if (r.status === 'REJECTED') return { key: 'REJECTED', label: 'Rad etildi', tone: 'danger' };
    if (r.status === 'APPROVED' && r.shopCreated) return { key: 'ACTIVATED', label: "Do'kon faollashtirildi", tone: 'ok' };
    if (r.status === 'APPROVED') return { key: 'PAYMENT_APPROVED', label: "To'lov tasdiqlandi", tone: 'ok' };
    if (r.paymentClaimedAt) return { key: 'REVIEWING', label: "To'lov tekshirilmoqda", tone: 'info' };
    return { key: 'PENDING', label: "To'lov kutilmoqda", tone: 'muted' };
  }
  const REQUESTS_SUB_FILTERS = [['ALL', 'Barchasi'], ['PENDING', "To'lov kutilmoqda"], ['REVIEWING', "To'lov tekshirilmoqda"], ['RECEIPT_REQUESTED', "Chek so'raldi"], ['RECEIPT_SENT', 'Chek yuborildi']];
  function setRequestsSearch(value) { requestsSearchQuery = value; render(); }
  function filteredRequestsForDisplay() {
    let list = requests.filter((r) => r.status === requestsFilter);
    if (requestsFilter === 'NEW' && requestsSubFilter !== 'ALL') {
      list = list.filter((r) => {
        if (requestsSubFilter === 'RECEIPT_REQUESTED') return requestSecondaryStatus(r)?.key === 'RECEIPT_REQUESTED';
        if (requestsSubFilter === 'RECEIPT_SENT') return requestSecondaryStatus(r)?.key === 'RECEIPT_SENT';
        return requestDisplayStatus(r).key === requestsSubFilter;
      });
    }
    const q = requestsSearchQuery.trim().toLowerCase();
    if (q) list = list.filter((r) => [r.requesterFirstName, r.requesterUsername, r.requesterTelegramId, r.tariffName, r.shopId].filter(Boolean).join(' ').toLowerCase().includes(q));
    return list;
  }
  function requestTypeLabel(r) {
    if (r.kind === 'NEW_SHOP') return "Yangi do'kon";
    if (r.upgradeAction === 'EXTEND') return 'Obunani uzaytirish';
    return "Tarifni o'zgartirish";
  }
  function renderAdminRequestsTab() {
    const list = filteredRequestsForDisplay();
    const open = requests.filter((r)=>r.status==='NEW');
    const pending = open.filter((r)=>requestDisplayStatus(r).key==='PENDING').length;
    const reviewing = open.filter((r)=>requestDisplayStatus(r).key==='REVIEWING').length;
    const receipt = open.filter((r)=>requestSecondaryStatus(r)?.key==='RECEIPT_REQUESTED').length;
    const approvedToday = requests.filter((r)=>r.status==='APPROVED' && r.reviewedAt && new Date(r.reviewedAt).toDateString()===new Date().toDateString()).length;
    return `
      <div class="plat-admin-list-head">
        <span class="plat-admin-eyebrow">To'lov nazorati</span>
        <h1>So'rovlar</h1>
        <p>Obuna va yangi do'kon to'lovlarini tezkor tekshiring.</p>
      </div>
      <div class="plat-admin-request-stats">
        <div><span class="is-blue">${pIcon('inbox',17)}</span><b>${open.length}</b><small>Yangi</small></div>
        <div><span class="is-violet">${pIcon('clock',17)}</span><b>${reviewing}</b><small>Tekshiruvda</small></div>
        <div><span class="is-amber">${pIcon('file',17)}</span><b>${receipt}</b><small>Chek so'ralgan</small></div>
        <div><span class="is-green">${pIcon('check',17)}</span><b>${approvedToday}</b><small>Bugun tasdiq</small></div>
      </div>
      <label class="plat-admin-search is-wide">${pIcon('search',18)}<input type="text" placeholder="Ism, @username, Telegram ID yoki tarif" value="${escapeHtml(requestsSearchQuery)}" oninput="setRequestsSearch(this.value)"></label>
      <div class="plat-admin-segment">
        ${[['NEW','Yangi',open.length],['APPROVED','Tasdiqlangan',requests.filter((r)=>r.status==='APPROVED').length],['REJECTED','Rad etilgan',requests.filter((r)=>r.status==='REJECTED').length]].map(([key,label,count])=>`<button class="${requestsFilter===key?'active':''}" onclick="setRequestsFilter('${key}')"><span>${label}</span><em>${count}</em></button>`).join('')}
      </div>
      ${requestsFilter === 'NEW' ? `<div class="plat-admin-request-subfilters">${REQUESTS_SUB_FILTERS.map(([key,label])=>`<button class="${requestsSubFilter===key?'active':''}" onclick="setRequestsSubFilter('${key}')">${label}${key==='PENDING'?` <em>${pending}</em>`:''}</button>`).join('')}</div>` : ''}
      <div class="plat-admin-result-head"><b>${list.length} ta so'rov</b><small>${requestsFilter==='NEW'?'Faol tekshiruvlar':requestsFilter==='APPROVED'?'Tasdiqlangan tarix':'Rad etilgan tarix'}</small></div>
      ${requestsLoading ? `<div class="plat-admin-loading"><span class="spinner"></span><b>So'rovlar yuklanmoqda</b></div>` : `<div class="plat-admin-request-list">${list.length ? list.map(renderRequestCard).join('') : renderAdminRequestsEmpty()}</div>`}
    `;
  }
  function renderAdminRequestsEmpty() {
    const search = !!requestsSearchQuery.trim();
    return `<div class="plat-admin-empty"><span>${pIcon(search?'search':'inbox',24)}</span><b>${search?'Natija topilmadi':requestsFilter==='NEW'?"Hozircha yangi so'rov yo'q":"Bu bo'limda so'rov yo'q"}</b><small>${search?"Qidiruv matnini o'zgartirib ko'ring.":"Yangi to'lov yoki obuna so'rovi kelganda shu yerda ko'rinadi."}</small></div>`;
  }
  function renderRequestCard(r) {
    const ds = requestDisplayStatus(r);
    const identity = r.requesterUsername ? '@'+r.requesterUsername : 'Telegram ID '+r.requesterTelegramId;
    const claimed = r.paymentClaimedAt ? `To'ladim: ${formatDateTime(r.paymentClaimedAt)}` : r.receiptRequestedAt ? `Chek so'ralgan: ${formatDateTime(r.receiptRequestedAt)}` : `Yaratildi: ${formatDateTime(r.createdAt)}`;
    const paymentNotice = r.hasReceipt
      ? `<div class="plat-admin-request-note is-info">Chek yuborildi · ${escapeHtml(receiptSourceLabel(r.receiptSource))}</div>`
      : r.receiptRequestedAt
        ? `<div class="notice">📎 Chek so'raldi — foydalanuvchi javobi kutilmoqda.</div>`
        : r.paymentClaimedAt
          ? `<div class="plat-admin-request-note is-info">To'lov tekshirilmoqda · chek biriktirilmagan.</div>`
          : `<div class="plat-admin-request-note">Chek yo'q · foydalanuvchi hali “To'ladim” demagan.</div>`;
    return `
      <div class="plat-admin-request-card" role="button" tabindex="0" onclick="openRequestDetails('${r.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openRequestDetails('${r.id}');}">
        <span class="plat-admin-request-top"><span><b>${escapeHtml(r.requesterFirstName || r.requesterTelegramId)}</b><small>${escapeHtml(identity)}</small></span><span class="plat-request-status-pill is-${ds.tone}">${escapeHtml(ds.label)}</span></span>
        <span class="plat-admin-request-mid"><span><small>${escapeHtml(requestTypeLabel(r))}</small><b>${escapeHtml(r.tariffName)} · ${r.billingPeriod === 'ANNUAL' ? 'Yillik' : 'Oylik'}</b>${r.paymentMethod ? `<em class="plat-request-method">${paymentProviderBadge(r.paymentMethod, true)} ${escapeHtml(paymentProviderName(r.paymentMethod))}</em>` : ''}</span><strong>${money(r.tariffPrice)}</strong></span>
        ${paymentNotice}
        <span class="plat-admin-request-foot"><small>${pIcon('clock',13)} ${escapeHtml(claimed)}</small><span class="plat-admin-request-foot-actions">${r.status === 'NEW' && r.paymentClaimedAt && !r.hasReceipt && !r.receiptRequestedAt ? `<button onclick="requestReceiptForRequest('${r.id}')">Chek so'rash</button>` : ''}${pIcon('arrowRight',16)}</span></span>
      </div>`;
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }
  function openRequestDetails(requestId) {
    selectedRequestId = requestId;
    rejectingRequestId = null;
    provisioningError = null;
    openPage('REQUEST_DETAILS');
    loadRequestHistory(requestId);
  }
  function renderRequestDetailsBody() {
    const r = requests.find((x)=>x.id===selectedRequestId);
    if (!r) return `<div class="plat-admin-empty"><span>${pIcon('info',24)}</span><b>So'rov topilmadi</b><small>Ro'yxatga qaytib qayta urinib ko'ring.</small></div>`;
    const ds = requestDisplayStatus(r);
    const history = requestHistoryById[r.id] || [];
    const isNewShop = r.kind === 'NEW_SHOP';
    const requesterIdentity = r.requesterUsername ? '@'+escapeHtml(r.requesterUsername) : 'Telegram ID: '+escapeHtml(r.requestedByUserId || r.requesterTelegramId);
    return `
      <div class="plat-admin-detail-hero">
        <span class="plat-admin-detail-icon">${pIcon('inbox',22)}</span>
        <div><span class="plat-admin-eyebrow">${escapeHtml(requestTypeLabel(r))}</span><h2>${escapeHtml(isNewShop ? (r.requestedShopName || r.requesterFirstName || 'Yangi do\'kon') : (r.requesterFirstName || r.requesterTelegramId))}</h2><p>${requesterIdentity}</p></div>
        <span class="plat-request-status-pill is-${ds.tone}">${escapeHtml(ds.label)}</span>
      </div>
      <section class="plat-admin-section">
        <div class="plat-admin-section-head"><div><span class="plat-admin-eyebrow">Ariza</span><h2>So'rov ma'lumotlari</h2></div></div>
        <div class="plat-admin-detail-grid">
          ${isNewShop ? `<div><small>Do'kon nomi</small><b>${escapeHtml(r.requestedShopName || '—')}</b></div><div><small>Owner Telegram ID</small><b>${escapeHtml(r.ownerTelegramId || '—')}</b></div><div><small>Ariza yuboruvchi</small><b>Telegram ID ${escapeHtml(r.requestedByUserId || r.requesterTelegramId)}</b></div>` : ''}
          <div><small>Tarif</small><b>${escapeHtml(r.tariffName)}</b></div><div><small>Davr</small><b>${r.billingPeriod==='ANNUAL'?'Yillik':'Oylik'}</b></div>
          <div><small>Summa</small><b>${money(r.tariffPrice)}</b></div><div><small>Obuna muddati</small><b>${escapeHtml(String(r.durationDays || 30))} kun</b></div>
          <div><small>To'lov usuli</small><b class="plat-admin-payment-method-value">${r.paymentMethod ? `${paymentProviderBadge(r.paymentMethod, true)} ${escapeHtml(paymentProviderName(r.paymentMethod))}` : '—'}</b></div><div><small>So'rov yaratildi</small><b>${formatDateTime(r.createdAt)}</b></div>
          <div><small>So'rov ID</small><b class="is-code">${escapeHtml(r.id)}</b></div><div><small>Tekshirish vaqti</small><b>${r.paymentClaimedAt ? formatDateTime(r.paymentClaimedAt) : 'Hali tasdiqlanmagan'}</b></div>
        </div>
      </section>
      <section class="plat-admin-section">
        <div class="plat-admin-section-head"><div><span class="plat-admin-eyebrow">Verifikatsiya</span><h2>To'lov holati</h2></div></div>
        <div class="plat-admin-payment-timeline">
          <div class="${r.paymentClaimedAt?'done':''}"><span>${pIcon('clock',16)}</span><p><b>“To'ladim” tasdig'i</b><small>${r.paymentClaimedAt ? formatDateTime(r.paymentClaimedAt) : 'Hali bosilmagan'}</small></p></div>
          <div class="${r.hasReceipt?'done':r.receiptRequestedAt?'warn':''}"><span>${pIcon('file',16)}</span><p><b>To'lov cheki</b><small>${r.hasReceipt?`Chek yuborildi · ${escapeHtml(receiptSourceLabel(r.receiptSource))} · ${formatDateTime(r.receiptUploadedAt)}`:r.receiptRequestedAt?`Chek so'raldi · ${formatDateTime(r.receiptRequestedAt)}`:'Ixtiyoriy · biriktirilmagan'}</small></p>${r.hasReceipt?`<button onclick="event.stopPropagation(); viewReceipt('${r.id}')">Ko'rish</button>`:''}</div>
          <div class="${r.status==='APPROVED'?'done':r.status==='REJECTED'?'danger':''}"><span>${pIcon('check',16)}</span><p><b>Admin qarori</b><small>${r.status==='NEW'?'Tekshiruv kutilmoqda':`${ds.label} · ${formatDateTime(r.reviewedAt)}`}</small></p></div>
        </div>
        ${r.status === 'REJECTED' && r.rejectReason ? `<div class="notice error">Sabab: ${escapeHtml(r.rejectReason)}</div>` : ''}
      </section>
      ${r.status === 'NEW' && r.receiptRequestedAt && !r.hasReceipt ? `<section class="plat-admin-receipt-wait"><span>${pIcon('file',20)}</span><div><b>To'lovni tasdiqlash uchun chek kerak</b><p>To'lovingizni aniqlay olmadik. Tekshiruvni davom ettirish uchun to'lov chekini yuboring.</p><small>Userga “Chekni yuborish” CTA ko'rsatilmoqda.</small></div></section>` : ''}
      ${r.status === 'NEW' && !r.paymentClaimedAt ? `<section class="plat-admin-section plat-admin-payment-wait"><div class="plat-admin-section-head"><div><span class="plat-admin-eyebrow">1-bosqich</span><h2>User to'lovi kutilmoqda</h2></div></div><div class="plat-admin-request-note">${pIcon('clock',16)} User hali “To'ladim”ni bosmagan. Bu bosqichda admin to'lovni tasdiqlamaydi, chek so'ramaydi va arizani qo'lda o'zgartirmaydi. To'lanmasa 1 soatda avtomatik o'chadi.</div></section>` : ''}
      ${r.status === 'NEW' && r.paymentClaimedAt ? `<section class="plat-admin-section"><div class="plat-admin-section-head"><div><span class="plat-admin-eyebrow">2-bosqich</span><h2>To'lovni tekshirish</h2></div></div><div class="plat-admin-detail-actions"><button class="primary" onclick="approveRequest('${r.id}')">${pIcon('check',17)} To'lovni tasdiqlash</button>${!r.hasReceipt ? `<button class="secondary" onclick="requestReceiptForRequest('${r.id}')">${pIcon('file',17)} Chek so'rash</button>` : ''}<button class="secondary is-danger" onclick="openRejectPrompt('${r.id}')">Rad etish</button></div>${rejectingRequestId === r.id ? `<div class="plat-reject-box"><input type="text" id="reject-reason-${r.id}" placeholder="Rad etish sababi"><button class="secondary" onclick="submitReject('${r.id}')">Yuborish</button></div>` : ''}</section>` : ''}
      ${isNewShop && r.status === 'APPROVED' && !r.shopCreated ? `<section class="plat-provision-stage"><span class="plat-provision-stage-icon">${pIcon('check',21)}</span><div><span class="plat-admin-eyebrow">Keyingi bosqich</span><h2>✅ To'lov tasdiqlandi</h2><p>To'lov tekshiruvi yakunlandi. Arizadagi ma'lumotlar bilan do'konni yarating.</p><button class="primary" onclick="openRequestProvisioning('${r.id}')">${pIcon('shop',17)} Do'kon qo'shish</button></div></section>` : ''}
      ${isNewShop && r.shopCreated ? `<section class="plat-provision-stage is-created"><span class="plat-provision-stage-icon">${pIcon('shop',21)}</span><div><span class="plat-admin-eyebrow">Provisioning yakunlandi</span><h2>✅ Do'kon yaratildi</h2><p><b>${escapeHtml(r.requestedShopName || 'Do\'kon')}</b> → Owner: Telegram ID ${escapeHtml(r.ownerTelegramId || '—')}</p>${r.appliedShopId?`<small>Shop ID: ${escapeHtml(r.appliedShopId)}</small>`:''}</div></section>` : ''}
      <section class="plat-application-timeline-card plat-admin-history"><div class="plat-application-section-title"><span>${pIcon('clock',17)}</span><div><b>Ariza tarixi</b><small>Server vaqtida saqlangan to'liq timeline.</small></div></div>${requestHistoryLoadingId===r.id && !history.length?`<div class="plat-request-list-loading"><span class="spinner"></span></div>`:renderRequestTimeline(history,r)}</section>
    `;
  }
  function openRequestProvisioning(requestId) {
    const r = requests.find((x) => x.id === requestId);
    if (!r || r.kind !== 'NEW_SHOP' || r.status !== 'APPROVED' || r.shopCreated) return;
    provisioningRequestId = requestId;
    provisioningError = null;
    provisioningSuccess = null;
    openPage('REQUEST_PROVISION');
  }
  function renderRequestProvisioningBody() {
    const r = requests.find((x) => x.id === provisioningRequestId);
    if (!r) return `<div class="plat-admin-empty"><span>${pIcon('info',24)}</span><b>Ariza topilmadi</b><small>So'rovlar bo'limiga qayting.</small></div>`;
    return `<div class="plat-provision-head"><span>${pIcon('shop',24)}</span><div><span class="plat-admin-eyebrow">Tasdiqlangan ariza</span><h2>${escapeHtml(r.requestedShopName || "Yangi do'kon")}</h2><p>Arizadagi ma'lumotlar avtomatik to'ldirildi. Qayta kiritish talab qilinmaydi.</p></div></div>
      <section class="plat-provision-summary">
        <div><small>Do'kon nomi</small><b>${escapeHtml(r.requestedShopName || '—')}</b></div><div><small>Owner Telegram ID</small><b>${escapeHtml(r.ownerTelegramId || '—')}</b></div>
        <div><small>Tarif</small><b>${escapeHtml(r.tariffName)}</b></div><div><small>Davr</small><b>${r.billingPeriod === 'ANNUAL' ? 'Yillik' : 'Oylik'}</b></div>
        <div><small>To'langan summa</small><b>${money(r.tariffPrice)}</b></div><div><small>Obuna muddati</small><b>${escapeHtml(String(r.durationDays || 30))} kun</b></div>
        <div><small>Bonus kunlar</small><b>+7 kun</b></div><div><small>Ariza ID</small><b class="is-code">${escapeHtml(r.id)}</b></div>
      </section>
      <section class="plat-provision-token-card"><div class="plat-application-section-title"><span>${pIcon('lock',17)}</span><div><b>Telegram bot tokeni</b><small>Do'kon botini ulash uchun mavjud xavfsiz provisioning tokeni kerak.</small></div></div><label class="plat-field-pro"><span>Bot token</span><input type="password" id="plat-provision-bot-token" autocomplete="off" placeholder="123456789:AA..."></label></section>
      ${provisioningError ? `<div class="notice error">${escapeHtml(provisioningError)}</div>` : ''}
      <button class="primary plat-provision-submit ${provisioningSubmitting?'plat-btn-dimmed':''}" ${provisioningSubmitting?'disabled':''} onclick="submitRequestProvisioning()">${provisioningSubmitting?'<span class="spinner"></span> Yaratilmoqda...':`${pIcon('shop',17)} Do'konni yaratish`}</button>`;
  }
  async function submitRequestProvisioning() {
    if (provisioningSubmitting || !provisioningRequestId) return;
    const token = String(document.getElementById('plat-provision-bot-token')?.value || '').trim();
    if (!token) { provisioningError = 'Telegram bot tokenini kiriting.'; render(); return; }
    provisioningSubmitting = true; provisioningError = null; render();
    try {
      const result = await callPlatformApi('platform_provision_shop_from_request', { requestId: provisioningRequestId, botToken: token });
      if (result?.error === 'telegram_config_failed_retry_available') {
        provisioningError = "Do'kon bazada yaratildi, lekin Telegram sozlamasi yakunlanmadi. Shu token bilan yana bir marta urinib ko'ring.";
        return;
      }
      const requestId = provisioningRequestId;
      provisioningSuccess = result;
      await loadRequests();
      await reloadAdminShops();
      await loadRequestHistory(requestId, false);
      provisioningRequestId = null;
      openRequestDetails(requestId);
    } catch (e) { provisioningError = e.message || String(e); }
    finally { provisioningSubmitting = false; render(); }
  }
  async function viewReceipt(requestId) {
    try {
      const data = await callPlatformApi('platform_get_subscription_receipt_url', { requestId });
      if (tg?.openLink) tg.openLink(data.url); else window.open(data.url, '_blank');
    } catch (e) { alert(e.message || String(e)); }
  }
  async function approveRequest(requestId) {
    if (!confirm("So'rovni tasdiqlaysizmi?")) return;
    try {
      await callPlatformApi('platform_approve_subscription_request', { requestId });
      await loadRequests();
      await loadRequestHistory(requestId, false);
      loadDashboardSummary();
      render();
    } catch (e) { alert(e.message || String(e)); }
  }
  async function requestReceiptForRequest(requestId) {
    try { window.event?.stopPropagation?.(); } catch (_) {}
    try {
      await callPlatformApi('platform_request_receipt', { requestId });
      await loadRequests();
      await loadRequestHistory(requestId, false);
      render();
    } catch (e) { alert(e.message || String(e)); }
  }
  function openRejectPrompt(requestId) { rejectingRequestId = requestId; render(); }
  async function submitReject(requestId) {
    const input = document.getElementById(`reject-reason-${requestId}`);
    const reason = (input?.value || '').trim();
    if (!reason) return alert('Sababni kiriting.');
    try {
      await callPlatformApi('platform_reject_subscription_request', { requestId, reason });
      rejectingRequestId = null;
      await loadRequests();
      await loadRequestHistory(requestId, false);
      render();
    } catch (e) { alert(e.message || String(e)); }
  }

  // ======================================================================
  // ADMIN: Tariflar CRUD (+ to'lov karta ma'lumoti shu yerda)
  // ======================================================================
  async function loadAdminSettings() {
    if (!isAdminMode) return;
    try {
      const [pData, mData, nData, lData] = await Promise.all([
        callPlatformApi('platform_get_payment_info', {}),
        callPlatformApi('platform_admin_list_payment_methods', {}),
        callPlatformApi('platform_admin_list_notification_templates', {}),
        callPlatformApi('platform_get_lifecycle_settings', {}),
      ]);
      paymentInfoDraft = { cardNumber: pData.cardNumber || '', cardHolder: pData.cardHolder || '', isActive: pData.isActive !== false };
      adminPaymentMethods = mData.methods || [];
      adminNotificationTemplates = nData.templates || [];
      if (lData?.settings) {
        platformLifecycleSettings = { ...platformLifecycleSettings, ...lData.settings };
        lifecycleSettingsDraft = JSON.parse(JSON.stringify(platformLifecycleSettings));
      }
      if (currentTab === 'profile' || ['ADMIN_PAYMENT_SETTINGS','ADMIN_NOTIFICATION_SETTINGS','ADMIN_NOTIFICATION_GROUP','ADMIN_LIFECYCLE_SETTINGS'].includes(activePage)) render();
    } catch (e) { console.error(e); }
  }
  async function loadAdminTariffs() {
    try {
      const tData = await callPlatformApi('platform_admin_list_tariffs', {});
      adminTariffs = tData.tariffs || [];
      if (currentTab === 'tariffs') render();
    } catch (e) { console.error(e); }
  }
  function renderAdminTariffsTab() {
    const activeCount = adminTariffs.filter((t)=>t.isActive).length;
    return `
      <div class="plat-admin-list-head is-with-action"><div><span class="plat-admin-eyebrow">Obuna katalogi</span><h1>Tariflar</h1><p>Tariflar, limitlar va foydalanuvchiga ko'rinadigan imkoniyatlarni boshqaring.</p></div><button class="plat-admin-add-btn" onclick="openNewTariffDraft()">${pIcon('plus',17)} Yangi tarif</button></div>
      <div class="plat-admin-tariff-summary"><div><b>${adminTariffs.length}</b><small>Jami tarif</small></div><div><b>${activeCount}</b><small>Faol</small></div><div><b>${adminTariffs.filter((t)=>t.isPopular).length}</b><small>Ommabop</small></div></div>
      ${tariffDraft ? renderTariffDraftForm() : ''}
      <div class="plat-admin-tariff-list">${adminTariffs.length ? adminTariffs.map(renderAdminTariffRow).join('') : `<div class="plat-admin-empty"><span>${pIcon('diamond',24)}</span><b>Hozircha tarif yo'q</b><small>Yangi tarif yaratish uchun yuqoridagi tugmadan foydalaning.</small></div>`}</div>
    `;
  }

  function openAdminPaymentSettings(){ openPage('ADMIN_PAYMENT_SETTINGS'); loadAdminSettings(); }
  function openAdminNotificationSettings(){ openPage('ADMIN_NOTIFICATION_SETTINGS'); loadAdminSettings(); }
  function openAdminLifecycleSettings(){ lifecycleSettingsDraft = JSON.parse(JSON.stringify(platformLifecycleSettings)); openPage('ADMIN_LIFECYCLE_SETTINGS'); loadAdminSettings(); }
  function renderAdminLifecycleSettingsBody() {
    const d = lifecycleSettingsDraft || platformLifecycleSettings;
    return `<div class="plat-settings-page-intro"><span class="plat-admin-eyebrow">Lifecycle boshqaruvi</span><h2>Muzlatish va o'chirish</h2><p>Do'kon holati o'zgarganda userga nima ko'rinishi, kimga murojaat qilishi va Telegram xabarlari qanday ishlashini boshqaring.</p></div>
      <section class="plat-settings-section plat-lifecycle-settings">
        <div class="plat-settings-section-head"><div><h3>Avtomatik muzlatish</h3><p>Obuna muddati tugaganda do'konni avtomatik muzlatish.</p></div></div>
        <label class="plat-toggle-row"><span><b>Obuna tugaganda muzlatish</b><small>Subscription cron orqali avtomatik bajariladi</small></span><input type="checkbox" id="lcs-auto-freeze" ${d.autoFreezeOnExpiry!==false?'checked':''}></label>
        <label class="plat-form-field"><span>Ma'lumotni saqlash muddati <em>kun</em></span><input type="number" id="lcs-retention" min="1" max="365" value="${escapeHtml(String(d.retentionDays||30))}"></label>
      </section>
      <section class="plat-settings-section plat-lifecycle-settings">
        <div class="plat-settings-section-head"><div><h3>Aloqa</h3><p>Muzlatilgan yoki o'chirilgan do'kon egasiga ko'rsatiladigan support manzili.</p></div></div>
        <div class="plat-form-grid"><label><span>Tugma nomi</span><input id="lcs-support-label" value="${escapeHtml(d.supportLabel||"Admin bilan bog'lanish")}"></label><label><span>Telegram / havola</span><input id="lcs-support-url" value="${escapeHtml(d.supportUrl||'')}" placeholder="https://t.me/... yoki tg://..."></label></div>
      </section>
      <section class="plat-settings-section plat-lifecycle-settings">
        <div class="plat-settings-section-head"><div><h3>Muzlatish</h3><p>Platform ichidagi attention-card va admin tanlaydigan sabablar.</p></div></div>
        <label class="plat-form-field"><span>Sarlavha</span><input id="lcs-freeze-title" value="${escapeHtml(d.freezeUserTitle||'')}"></label>
        <label class="plat-form-field"><span>Userga matn</span><textarea id="lcs-freeze-body" rows="4">${escapeHtml(d.freezeUserBody||'')}</textarea></label>
        <label class="plat-form-field"><span>Qayta ishga tushirish yo'riqnomasi</span><textarea id="lcs-freeze-action" rows="3">${escapeHtml(d.freezeActionText||'')}</textarea></label>
        <label class="plat-form-field"><span>Muzlatish sabablari <em>har qatorga bittadan</em></span><textarea id="lcs-freeze-reasons" rows="5">${escapeHtml((d.freezeReasons||[]).join('\n'))}</textarea></label>
      </section>
      <section class="plat-settings-section plat-lifecycle-settings">
        <div class="plat-settings-section-head"><div><h3>O'chirish</h3><p>Do'kon TERMINATED bo'lganda Platform ichida ko'rsatiladigan matn.</p></div></div>
        <label class="plat-form-field"><span>Sarlavha</span><input id="lcs-terminate-title" value="${escapeHtml(d.terminateUserTitle||'')}"></label>
        <label class="plat-form-field"><span>Userga matn</span><textarea id="lcs-terminate-body" rows="4">${escapeHtml(d.terminateUserBody||'')}</textarea></label>
        <label class="plat-form-field"><span>O'chirish sabablari <em>har qatorga bittadan</em></span><textarea id="lcs-terminate-reasons" rows="5">${escapeHtml((d.terminateReasons||[]).join('\n'))}</textarea></label>
      </section>
      <div class="plat-settings-note">${pIcon('bell',17)}<span>Telegramda yuboriladigan <b>Muzlatildi / Qayta faollashtirildi / O'chirildi</b> shablonlari “Avtomatik xabarlar” bo'limida alohida tahrirlanadi.</span></div>
      <button class="primary plat-settings-save-wide" onclick="saveLifecycleSettings()">${pIcon('check',16)} Parametrlarni saqlash</button>`;
  }
  async function saveLifecycleSettings() {
    const splitReasons = (id) => String(document.getElementById(id)?.value || '').split('\n').map((x)=>x.trim()).filter(Boolean);
    const payload = {
      autoFreezeOnExpiry: !!document.getElementById('lcs-auto-freeze')?.checked,
      retentionDays: Number(document.getElementById('lcs-retention')?.value || 30),
      supportLabel: String(document.getElementById('lcs-support-label')?.value || '').trim(),
      supportUrl: String(document.getElementById('lcs-support-url')?.value || '').trim() || null,
      freezeUserTitle: String(document.getElementById('lcs-freeze-title')?.value || '').trim(),
      freezeUserBody: String(document.getElementById('lcs-freeze-body')?.value || '').trim(),
      freezeActionText: String(document.getElementById('lcs-freeze-action')?.value || '').trim(),
      freezeReasons: splitReasons('lcs-freeze-reasons'),
      terminateUserTitle: String(document.getElementById('lcs-terminate-title')?.value || '').trim(),
      terminateUserBody: String(document.getElementById('lcs-terminate-body')?.value || '').trim(),
      terminateReasons: splitReasons('lcs-terminate-reasons'),
    };
    if (!payload.freezeReasons.length || !payload.terminateReasons.length) return alert("Kamida bitta sabab kiriting.");
    try {
      const result = await callPlatformApi('platform_update_lifecycle_settings', payload);
      platformLifecycleSettings = { ...platformLifecycleSettings, ...(result.settings||payload) };
      lifecycleSettingsDraft = JSON.parse(JSON.stringify(platformLifecycleSettings));
      alert('Saqlandi.');
      render();
    } catch (e) { alert(e.message || String(e)); }
  }
  function openAdminIntegrationsInfo(){ alert("Integratsiyalar shop detail orqali boshqariladi. Alohida integratsiyalar markazi keyingi bosqichda kengaytiriladi."); }

  function maskedCardNumber(v) {
    const d=String(v||'').replace(/\D/g,''); if(!d) return "Karta qo'shilmagan";
    return `${d.slice(0,4)} •••• •••• ${d.slice(-4)}`;
  }
  function shortUrl(v){ try{ const a=document.createElement('a'); a.href=String(v||''); const path=a.pathname||''; return (a.hostname||'') + (path.length>18?path.slice(0,18)+'…':path); }catch(_){ return String(v||'').slice(0,36); } }
  function paymentMethodIcon(type){ return paymentProviderName(type); }
  function renderAdminPaymentSettingsBody(){
    const cardActive = paymentInfoDraft?.isActive !== false && !!paymentInfoDraft?.cardNumber;
    return `
      <div class="plat-settings-page-intro"><span class="plat-admin-eyebrow">Checkout konfiguratsiyasi</span><h2>To'lov usullari</h2><p>Userga faqat faol qilingan to'lov usullari ko'rinadi.</p></div>
      <section class="plat-settings-section"><div class="plat-settings-section-head"><div><h3>To'lov kartasi</h3><p>Bank kartasi orqali qo'lda tekshiriladigan to'lov.</p></div>${paymentInfoDraft?.cardNumber?`<label class="plat-switch"><input type="checkbox" ${cardActive?'checked':''} onchange="togglePlatformCardActive(this.checked)"><span></span></label>`:''}</div>
      ${paymentInfoDraft?.cardNumber ? `<div class="plat-payment-method-card is-bank"><span class="plat-method-logo">${pIcon('card',20)}</span><div><b>${maskedCardNumber(paymentInfoDraft.cardNumber)}</b><small>${escapeHtml(paymentInfoDraft.cardHolder||'Karta egasi kiritilmagan')}</small></div><button onclick="editPlatformCard()">Tahrirlash</button></div>` : `<button class="plat-add-setting-card" onclick="editPlatformCard()">${pIcon('plus',18)}<span><b>Karta qo'shish</b><small>Karta raqami va egasini kiriting</small></span></button>`}
      ${paymentInfoDraft?.editing ? renderPlatformCardEditor() : ''}</section>
      <section class="plat-settings-section"><div class="plat-settings-section-head"><div><h3>To'lov havolalari</h3><p>Click, Payme va Paynet havolalarini boshqaring.</p></div><button class="plat-section-add" onclick="openNewPaymentMethodDraft()">${pIcon('plus',15)} Qo'shish</button></div>
      ${paymentMethodDraft ? renderPaymentMethodDraftForm() : ''}<div class="plat-payment-method-list">${adminPaymentMethods.length?adminPaymentMethods.map(renderAdminPaymentMethodRow).join(''):`<div class="plat-admin-empty is-compact"><span>${pIcon('wallet',22)}</span><b>Havola qo'shilmagan</b><small>Click, Payme yoki Paynet havolasini qo'shing.</small></div>`}</div></section>`;
  }
  function editPlatformCard(){ paymentInfoDraft = {...(paymentInfoDraft||{cardNumber:'',cardHolder:'',isActive:true}), editing:true}; render(); }
  function cancelPlatformCardEdit(){ paymentInfoDraft.editing=false; render(); }
  function renderPlatformCardEditor(){ return `<div class="plat-settings-editor"><div class="plat-settings-editor-head"><b>${paymentInfoDraft.cardNumber?'Kartani tahrirlash':"Karta qo'shish"}</b><button onclick="cancelPlatformCardEdit()">×</button></div><label>Karta raqami<input type="text" id="pi-card-number" inputmode="numeric" value="${escapeHtml(paymentInfoDraft.cardNumber||'')}" placeholder="8600 0000 0000 0000"></label><label>Karta egasi<input type="text" id="pi-card-holder" value="${escapeHtml(paymentInfoDraft.cardHolder||'')}" placeholder="F. I. Sh."></label><label class="plat-toggle-row"><span><b>Faol</b><small>User to'lov oynasida ko'rinadi</small></span><input type="checkbox" id="pi-card-active" ${paymentInfoDraft.isActive!==false?'checked':''}></label><div class="plat-settings-editor-actions"><button class="secondary" onclick="cancelPlatformCardEdit()">Bekor qilish</button><button class="primary" onclick="savePaymentInfo()">Saqlash</button></div></div>`; }
  async function togglePlatformCardActive(active){ paymentInfoDraft={...(paymentInfoDraft||{}),isActive:active}; try{await callPlatformApi('platform_set_payment_info',{cardNumber:paymentInfoDraft.cardNumber||'',cardHolder:paymentInfoDraft.cardHolder||'',isActive:active}); paymentInfo=null;}catch(e){alert(e.message||String(e)); loadAdminSettings();} }

  let notificationGroupKey = null;
  const NOTIFICATION_GROUPS = {
    EXPIRING:{title:'Obuna tugash eslatmalari',subtitle:'Tugashidan 7, 3 va 1 kun oldin',types:['EXPIRY_7D','EXPIRY_3D','EXPIRY_1D'],icon:'calendar',tone:'blue'},
    STATUS:{title:"Do'kon holati xabarlari",subtitle:"Muzlatildi, qayta faollashtirildi va o'chirildi",types:['FROZEN','REACTIVATED','TERMINATED'],icon:'lock',tone:'amber'},
    RETENTION:{title:"Muzlatilgan ma'lumot eslatmalari",subtitle:"Saqlash muddati tugashidan oldingi ogohlantirishlar",types:['GRACE_7D','GRACE_1D'],icon:'clock',tone:'blue'},
    VISITOR:{title:'Yangi foydalanuvchi eslatmalari',subtitle:"Mini App ochgan, hali obuna olmagan userlar",types:['VISITOR_1D','VISITOR_3D','VISITOR_7D'],icon:'user',tone:'violet'},
  };
  function renderAdminNotificationSettingsBody(){ return `<div class="plat-settings-page-intro"><span class="plat-admin-eyebrow">Telegram automation</span><h2>Avtomatik xabarlar</h2><p>Xabarlarni maqsadiga ko'ra guruhlab boshqaring.</p></div><div class="plat-notification-groups">${Object.entries(NOTIFICATION_GROUPS).map(([key,g])=>{const rows=adminNotificationTemplates.filter(t=>g.types.includes(t.type));const on=rows.filter(t=>t.isActive).length;return `<button onclick="openNotificationGroup('${key}')"><span class="is-${g.tone}">${pIcon(g.icon,20)}</span><div><b>${g.title}</b><small>${g.subtitle}</small><em>${on}/${g.types.length} faol</em></div>${pIcon('arrowRight',17)}</button>`}).join('')}</div><div class="plat-settings-note">${pIcon('info',17)}<span>Xabar matni, statusi va test yuborish har bir guruh ichida boshqariladi.</span></div>`; }
  function openNotificationGroup(key){ if(!NOTIFICATION_GROUPS[key])return; notificationGroupKey=key; openPage('ADMIN_NOTIFICATION_GROUP'); }
  function notificationGroupTitle(){ return NOTIFICATION_GROUPS[notificationGroupKey]?.title || 'Xabarlar'; }
  function renderAdminNotificationGroupBody(){ const g=NOTIFICATION_GROUPS[notificationGroupKey]; if(!g)return ''; const rows=adminNotificationTemplates.filter(t=>g.types.includes(t.type)); return `<div class="plat-settings-page-intro is-compact"><span class="plat-admin-eyebrow">Telegram xabarlari</span><h2>${escapeHtml(g.title)}</h2><p>${escapeHtml(g.subtitle)}</p></div>${notificationTemplateDraft?renderNotificationTemplateDraftForm():''}<div class="plat-notification-template-list">${rows.map(renderAdminNotificationTemplateRow).join('')}</div>`; }
  const NOTIFICATION_TEMPLATE_LABELS = {
    EXPIRY_7D: "Obuna tugashiga 7 kun qoldi",
    EXPIRY_3D: "Obuna tugashiga 3 kun qoldi",
    EXPIRY_1D: "Obuna tugashiga 1 kun qoldi",
    FROZEN: "Obuna tugab, do'kon muzlatildi",
    REACTIVATED: "Do'kon qayta faollashtirildi",
    TERMINATED: "Do'kon o'chirildi",
    GRACE_7D: "Muzlatilgan, ma'lumot o'chirilishiga 7 kun",
    GRACE_1D: "Muzlatilgan, ma'lumot o'chirilishiga 1 kun",
    // 2026-08-28, 055-migratsiya: Group A — Mini-App ochilgan, lekin
    // hech qachon do'kon egasi bo'lmagan foydalanuvchilarga eslatma.
    VISITOR_1D: "Mini-App ochdi, obuna bo'lmadi — 1 kundan keyin",
    VISITOR_3D: "Mini-App ochdi, obuna bo'lmadi — 3 kundan keyin",
    VISITOR_7D: "Mini-App ochdi, obuna bo'lmadi — 7 kundan keyin (oxirgi)",
  };
  function renderAdminNotificationTemplateRow(t) {
    const body = t.body || '';
    return `<div class="plat-notification-template-card"><span class="plat-template-status ${t.isActive?'is-on':''}">${pIcon(t.isActive?'check':'bell',16)}</span><div><b>${escapeHtml(NOTIFICATION_TEMPLATE_LABELS[t.type] || t.type)}</b><small>${escapeHtml(body.length>88?body.slice(0,88)+'…':body)}</small></div><label class="plat-switch"><input type="checkbox" ${t.isActive?'checked':''} onchange="toggleNotificationTemplateActive('${t.type}',this.checked)"><span></span></label><button onclick="openEditNotificationTemplateDraft('${t.type}')">Tahrirlash</button></div>`;
  }
  async function toggleNotificationTemplateActive(type,active){ const t=adminNotificationTemplates.find(x=>x.type===type); if(!t)return; try{await callPlatformApi('platform_update_notification_template',{type,body:t.body,imageUrl:t.imageUrl||null,isActive:active});t.isActive=active;render();}catch(e){alert(e.message||String(e));loadAdminSettings();} }
  function openEditNotificationTemplateDraft(type) {
    const t = adminNotificationTemplates.find((x) => x.type === type);
    if (!t) return;
    notificationTemplateDraft = { type: t.type, body: t.body, imageUrl: t.imageUrl || '', uploadedImageUrl: t.uploadedImageUrl || '', hasUploadedImage: t.hasUploadedImage === true, isActive: t.isActive };
    notificationTemplateImageFile = null;
    if (notificationTemplateImagePreviewUrl) { try { URL.revokeObjectURL(notificationTemplateImagePreviewUrl); } catch (_) {} }
    notificationTemplateImagePreviewUrl = null;
    notificationTemplateImageRemove = false;
    render();
  }
  function cancelNotificationTemplateDraft() {
    notificationTemplateDraft = null;
    notificationTemplateImageFile = null;
    if (notificationTemplateImagePreviewUrl) { try { URL.revokeObjectURL(notificationTemplateImagePreviewUrl); } catch (_) {} }
    notificationTemplateImagePreviewUrl = null;
    notificationTemplateImageRemove = false;
    render();
  }
  function renderNotificationTemplateDraftForm() {
    const d = notificationTemplateDraft;
    const preview = notificationTemplateImagePreviewUrl || (!notificationTemplateImageRemove ? (d.uploadedImageUrl || d.imageUrl || '') : '');
    return `<div class="plat-settings-editor plat-notification-editor"><div class="plat-settings-editor-head"><div><b>${escapeHtml(NOTIFICATION_TEMPLATE_LABELS[d.type] || d.type)}</b><small>Telegram shabloni</small></div><button onclick="cancelNotificationTemplateDraft()">×</button></div>
      <label class="plat-form-field"><span>Xabar matni</span><textarea id="ntd-body" rows="5">${escapeHtml(d.body)}</textarea></label>
      <div class="plat-template-vars"><b>O'zgaruvchilar</b><span>{SHOP_NAME}</span><span>{DAYS_LEFT}</span><span>{EXPIRY_DATE}</span><span>{RETENTION_DAYS_LEFT}</span><span>{REASON}</span><span>{ACTION}</span><span>{SUPPORT_CONTACT}</span></div>
      <div class="plat-media-upload">
        <div class="plat-media-upload-head"><div><b>Rasm <em>ixtiyoriy</em></b><small>Qurilma xotirasidan JPG, PNG yoki WebP · 3 MB gacha</small></div></div>
        <input type="file" id="ntd-image-file" hidden onchange="onNotificationTemplateImagePicked(event)">
        ${preview ? `<div class="plat-media-preview"><img src="${escapeHtml(preview)}" alt="Xabar rasmi"><div><button class="secondary" onclick="document.getElementById('ntd-image-file').click()">Almashtirish</button><button class="secondary is-danger" onclick="clearNotificationTemplateImage()">Olib tashlash</button></div></div>` : `<button class="plat-upload-zone is-compact" onclick="document.getElementById('ntd-image-file').click()">${pIcon('upload',18)}<div><b>Qurilmadan rasm yuklash</b><small>Galereya yoki kompyuter xotirasi</small></div></button>`}
        <label class="plat-form-field is-fallback-url"><span>Yoki rasm URL <em>fallback</em></span><input type="text" id="ntd-image" value="${escapeHtml(d.imageUrl)}" placeholder="https://..."></label>
      </div>
      <label class="plat-toggle-row"><span><b>Faol</b><small>Schedule ushbu shablonni yuboradi</small></span><input type="checkbox" id="ntd-active" ${d.isActive?'checked':''}></label>
      <div class="plat-settings-editor-actions is-three"><button class="secondary" onclick="cancelNotificationTemplateDraft()">Bekor qilish</button><button class="secondary" onclick="sendTestNotification('${d.type}')" ${sendingTestNotification?'disabled':''}>${sendingTestNotification?'Yuborilmoqda…':'Test'}</button><button class="primary" onclick="saveNotificationTemplateDraft()">Saqlash</button></div></div>`;
  }
  function onNotificationTemplateImagePicked(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return alert('Faqat JPG, PNG yoki WebP rasm qabul qilinadi.');
    if (file.size > 3 * 1024 * 1024) return alert("Rasm hajmi 3MB dan katta bo'lmasin.");
    notificationTemplateImageFile = file;
    notificationTemplateImageRemove = false;
    if (notificationTemplateImagePreviewUrl) { try { URL.revokeObjectURL(notificationTemplateImagePreviewUrl); } catch (_) {} }
    notificationTemplateImagePreviewUrl = URL.createObjectURL(file);
    render();
  }
  function clearNotificationTemplateImage() {
    notificationTemplateImageFile = null;
    notificationTemplateImageRemove = true;
    if (notificationTemplateImagePreviewUrl) { try { URL.revokeObjectURL(notificationTemplateImagePreviewUrl); } catch (_) {} }
    notificationTemplateImagePreviewUrl = null;
    render();
  }

  // Saqlanmagan tahrirni EMAS, bazadagi HOZIRGI (saqlangan) matnni test
  // qiladi — shu bilan admin chalkashib "hali saqlamagan loyihasi" ni
  // haqiqiy sifatida qabul qilib qolmaydi (Saqlash bosilmasa, o'zgarish
  // hali bazaga yozilmagan).
  let sendingTestNotification = false;
  async function sendTestNotification(type) {
    if (sendingTestNotification) return;
    sendingTestNotification = true;
    render();
    try {
      await callPlatformApi('platform_send_test_notification', { type });
      alert("Sinov xabari Telegram'ingizga yuborildi.");
    } catch (e) { alert(e.message || String(e)); }
    finally { sendingTestNotification = false; render(); }
  }
  async function saveNotificationTemplateDraft() {
    const body = document.getElementById('ntd-body').value.trim();
    const imageUrlRaw = document.getElementById('ntd-image').value.trim();
    const isActive = document.getElementById('ntd-active').checked;
    if (!body) return alert('Xabar matni bo\'sh bo\'lmasin.');
    if (imageUrlRaw && !/^https?:\/\//i.test(imageUrlRaw)) return alert("Rasm havolasi http:// yoki https:// bilan boshlanishi kerak.");
    try {
      const imageUpload = notificationTemplateImageFile ? { base64: await fileToBase64(notificationTemplateImageFile), mimeType: notificationTemplateImageFile.type, fileName: notificationTemplateImageFile.name } : undefined;
      await callPlatformApi('platform_update_notification_template', { type: notificationTemplateDraft.type, body, imageUrl: imageUrlRaw || null, imageUpload, removeImage: notificationTemplateImageRemove, isActive });
      cancelNotificationTemplateDraft();
      await loadAdminSettings();
    } catch (e) { alert(e.message || String(e)); }
  }
  function renderAdminPaymentMethodRow(m) {
    return `<div class="plat-payment-method-card">${paymentMethodVisual(m)}<div><b>${escapeHtml(m.displayName)}</b><small>${escapeHtml(shortUrl(m.paymentUrl))}${m.hasCustomLogo?' · Custom logo':''}</small></div><label class="plat-switch" onclick="event.stopPropagation()"><input type="checkbox" ${m.isActive?'checked':''} onchange="togglePaymentMethodActive('${m.id}',this.checked)"><span></span></label><button onclick="openEditPaymentMethodDraft('${m.id}')">Tahrirlash</button></div>`;
  }
  async function togglePaymentMethodActive(id,active){ const m=adminPaymentMethods.find(x=>x.id===id); if(!m)return; try{await callPlatformApi('platform_upsert_payment_method',{id:m.id,methodType:m.methodType,displayName:m.displayName,paymentUrl:m.paymentUrl,isActive:active,sortOrder:m.sortOrder||0});m.isActive=active;render();}catch(e){alert(e.message||String(e));loadAdminSettings();} }
  function resetPaymentMethodLogoDraft() {
    paymentMethodLogoFile = null;
    if (paymentMethodLogoPreviewUrl) { try { URL.revokeObjectURL(paymentMethodLogoPreviewUrl); } catch (_) {} }
    paymentMethodLogoPreviewUrl = null;
    paymentMethodLogoRemove = false;
  }
  function openNewPaymentMethodDraft() { resetPaymentMethodLogoDraft(); paymentMethodDraft = { id: null, methodType: 'CLICK', displayName: '', paymentUrl: '', logoUrl: '', hasCustomLogo: false, isActive: true }; render(); }
  function openEditPaymentMethodDraft(id) {
    const m = adminPaymentMethods.find((x) => x.id === id);
    if (!m) return;
    resetPaymentMethodLogoDraft();
    paymentMethodDraft = { id: m.id, methodType: m.methodType, displayName: m.displayName, paymentUrl: m.paymentUrl, logoUrl: m.logoUrl || '', hasCustomLogo: m.hasCustomLogo === true, isActive: m.isActive };
    render();
  }
  function cancelPaymentMethodDraft() { resetPaymentMethodLogoDraft(); paymentMethodDraft = null; render(); }
  function onPaymentMethodLogoPicked(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return alert('Faqat JPG, PNG yoki WebP rasm qabul qilinadi.');
    if (file.size > 3 * 1024 * 1024) return alert("Logo hajmi 3MB dan katta bo'lmasin.");
    paymentMethodLogoFile = file;
    paymentMethodLogoRemove = false;
    if (paymentMethodLogoPreviewUrl) { try { URL.revokeObjectURL(paymentMethodLogoPreviewUrl); } catch (_) {} }
    paymentMethodLogoPreviewUrl = URL.createObjectURL(file);
    render();
  }
  function clearPaymentMethodLogo() {
    paymentMethodLogoFile = null;
    paymentMethodLogoRemove = true;
    if (paymentMethodLogoPreviewUrl) { try { URL.revokeObjectURL(paymentMethodLogoPreviewUrl); } catch (_) {} }
    paymentMethodLogoPreviewUrl = null;
    render();
  }
  function renderPaymentMethodDraftForm() {
    const d = paymentMethodDraft;
    const preview = paymentMethodLogoPreviewUrl || (!paymentMethodLogoRemove ? d.logoUrl : '');
    return `<div class="plat-settings-editor plat-method-editor"><div class="plat-settings-editor-head"><b>${d.id?'To\'lov havolasini tahrirlash':"Yangi to'lov havolasi"}</b><button onclick="cancelPaymentMethodDraft()">×</button></div>
      <div class="plat-form-grid"><label><span>Provayder</span><select id="pmd-type">${['CLICK','PAYME','PAYNET'].map((t)=>`<option value="${t}" ${d.methodType===t?'selected':''}>${t}</option>`).join('')}</select></label><label><span>Ko'rinadigan nom</span><input type="text" id="pmd-name" value="${escapeHtml(d.displayName)}" placeholder="Click orqali to'lash"></label></div>
      <label class="plat-form-field"><span>To'lov havolasi</span><input type="text" id="pmd-url" value="${escapeHtml(d.paymentUrl)}" placeholder="https://..."></label>
      <div class="plat-media-upload"><div class="plat-media-upload-head"><div><b>To'lov tizimi logosi</b><small>Rasm bo'lsa user aynan shu logoni ko'radi va karta/logo bosilganda yuqoridagi havola ochiladi.</small></div></div>
        <input type="file" id="pmd-logo-file" hidden onchange="onPaymentMethodLogoPicked(event)">
        ${preview ? `<div class="plat-media-preview is-logo"><img src="${escapeHtml(preview)}" alt="Logo"><div><button class="secondary" onclick="document.getElementById('pmd-logo-file').click()">Almashtirish</button><button class="secondary is-danger" onclick="clearPaymentMethodLogo()">Olib tashlash</button></div></div>` : `<button class="plat-upload-zone is-compact" onclick="document.getElementById('pmd-logo-file').click()">${pIcon('upload',18)}<div><b>Qurilmadan logo yuklash</b><small>Yuklanmasa Click / Payme / Paynet wordmark ishlatiladi</small></div></button>`}
      </div>
      <label class="plat-toggle-row"><span><b>Faol</b><small>User to'lov oynasida ko'rinadi</small></span><input type="checkbox" id="pmd-active" ${d.isActive?'checked':''}></label>
      <div class="plat-settings-editor-actions"><button class="secondary" onclick="cancelPaymentMethodDraft()">Bekor qilish</button><button class="primary" onclick="savePaymentMethodDraft()">Saqlash</button></div></div>`;
  }

  async function savePaymentMethodDraft() {
    const methodType = document.getElementById('pmd-type').value;
    const displayName = document.getElementById('pmd-name').value.trim();
    const paymentUrl = document.getElementById('pmd-url').value.trim();
    const isActive = document.getElementById('pmd-active').checked;
    if (!displayName) return alert('Nomi kiritilishi shart.');
    if (!/^https?:\/\//i.test(paymentUrl)) return alert("To'lov havolasi http:// yoki https:// bilan boshlanishi kerak.");
    try {
      const logoImageUpload = paymentMethodLogoFile ? { base64: await fileToBase64(paymentMethodLogoFile), mimeType: paymentMethodLogoFile.type, fileName: paymentMethodLogoFile.name } : undefined;
      await callPlatformApi('platform_upsert_payment_method', { id: paymentMethodDraft.id || undefined, methodType, displayName, paymentUrl, logoImageUpload, removeLogo: paymentMethodLogoRemove, isActive });
      resetPaymentMethodLogoDraft();
      paymentMethodDraft = null;
      await loadAdminSettings();
    } catch (e) { alert(e.message || String(e)); }
  }
  function renderAdminTariffRow(t) {
    const features = Array.isArray(t.features) ? t.features : [];
    return `<button class="plat-admin-tariff-card ${t.isPopular?'is-popular':''} ${!t.isActive?'is-off':''}" onclick="openEditTariffDraft('${t.id}')">
      <span class="plat-admin-tariff-icon">${pIcon(t.isPopular?'bolt':'diamond',19)}</span>
      <span class="plat-admin-tariff-main"><span class="plat-admin-tariff-title"><b>${escapeHtml(t.name)}</b>${t.isPopular?'<em>Ommabop</em>':''}${!t.isActive?'<em class="is-off">O\'chiq</em>':''}</span><strong>${money(t.price)}<small>/oy</small></strong><small>${limitLabel(t.productLimit)} · ${features.length} ta imkoniyat</small></span>
      <span class="plat-admin-tariff-edit">Tahrirlash ${pIcon('arrowRight',15)}</span></button>`;
  }
  function openNewTariffDraft() { tariffDraft = { id: null, name: '', price: '', productLimit: '', isActive: true, isPopular: false, features: TARIFF_FEATURE_LIST.slice() }; render(); }
  function openEditTariffDraft(id) {
    const t = adminTariffs.find((x) => x.id === id);
    if (!t) return;
    tariffDraft = {
      id: t.id, name: t.name, price: t.price, productLimit: t.productLimit === null ? '' : t.productLimit,
      isActive: t.isActive, isPopular: t.isPopular,
      features: (Array.isArray(t.features) && t.features.length ? t.features : TARIFF_FEATURE_LIST).slice(),
    };
    render();
  }
  function renderTariffDraftForm() {
    const d = tariffDraft;
    return `<section class="plat-settings-section plat-tariff-editor">
      <div class="plat-settings-section-head"><div><span class="plat-admin-eyebrow">${d.id?'Tarif sozlamalari':'Yangi obuna rejasi'}</span><h3>${d.id?escapeHtml(d.name||'Tarifni tahrirlash'):'Yangi tarif yaratish'}</h3><p>User tarif kartasida ko'radigan nom, narx, limit va imkoniyatlarni belgilang.</p></div><button class="plat-editor-close" onclick="cancelTariffDraft()">×</button></div>
      <div class="plat-form-grid"><label><span>Tarif nomi</span><input type="text" id="td-name" value="${escapeHtml(d.name)}" placeholder="Masalan: Standard"></label><label><span>Oylik narx</span><input type="text" id="td-price" inputmode="numeric" value="${escapeHtml(String(d.price))}" placeholder="79000"></label></div>
      <label class="plat-form-field"><span>Mahsulot limiti <em>bo'sh = cheksiz</em></span><input type="text" id="td-limit" inputmode="numeric" value="${escapeHtml(String(d.productLimit))}" placeholder="200"></label>
      <label class="plat-form-field"><span>Tarif imkoniyatlari <em>har qatorga bittadan</em></span><textarea id="td-features" rows="6" placeholder="Telegram e-do'kon&#10;Katalog va mahsulotlar&#10;Ombor nazorati">${escapeHtml((d.features || []).join('\n'))}</textarea></label>
      <div class="plat-editor-options"><label><span><b>Tarif faol</b><small>Userlarga ko'rinadi</small></span><input type="checkbox" id="td-active" ${d.isActive ? 'checked' : ''}></label><label><span><b>Ommabop</b><small>Tarif kartasida badge chiqadi</small></span><input type="checkbox" id="td-popular" ${d.isPopular ? 'checked' : ''}></label></div>
      <div class="plat-settings-editor-actions"><button class="secondary" onclick="cancelTariffDraft()">Bekor qilish</button><button class="primary" onclick="saveTariffDraft()">Saqlash</button></div>
    </section>`;
  }
  function cancelTariffDraft() { tariffDraft = null; render(); }
  async function saveTariffDraft() {
    const name = document.getElementById('td-name').value.trim();
    const price = Number(document.getElementById('td-price').value);
    const limitRaw = document.getElementById('td-limit').value.trim();
    const productLimit = limitRaw ? Number(limitRaw) : null;
    const isActive = document.getElementById('td-active').checked;
    const isPopular = document.getElementById('td-popular').checked;
    const features = document.getElementById('td-features').value.split('\n').map((f) => f.trim()).filter(Boolean);
    try {
      await callPlatformApi('platform_upsert_tariff', { id: tariffDraft.id || undefined, name, price, productLimit, isActive, isPopular, features });
      tariffDraft = null;
      await loadAdminTariffs();
    } catch (e) { alert(e.message || String(e)); }
  }
  async function savePaymentInfo() {
    const cardNumber = document.getElementById('pi-card-number').value;
    const cardHolder = document.getElementById('pi-card-holder').value;
    const isActive = document.getElementById('pi-card-active') ? document.getElementById('pi-card-active').checked : paymentInfoDraft?.isActive !== false;
    try {
      await callPlatformApi('platform_set_payment_info', { cardNumber, cardHolder, isActive });
      paymentInfoDraft = { cardNumber, cardHolder, isActive, editing: false };
      paymentInfo = null; // keyingi to'lov sahifasi qayta yuklasin
      alert('Saqlandi.');
    } catch (e) { alert(e.message || String(e)); }
  }

  // render() ichida activePage === 'CONNECT_SHOP' bo'lsa wireConnectShopView()
  // avtomatik chaqiriladi — bu shunchaki aniqroq nom uchun ingichka wrapper.
  function rerenderActivePage() { render(); }
  boot();

  // ---- Global handler eksporti (inline onclick uchun) -------------------
  window.openPage = openPage;
  window.closePage = closePage;
  window.retryBoot = retryBoot;
  window.retryCurrentView = retryCurrentView;
  window.goHomePage = goHomePage;
  window.switchTab = switchTab;
  window.togglePersonMenu = togglePersonMenu;
  window.toggleFaq = toggleFaq;
  window.toggleAdminRole = toggleAdminRole;
  window.openTermsPage = openTermsPage;
  window.openPrivacyPage = openPrivacyPage;
  window.closeTermsPrivacyPage = closeTermsPrivacyPage;
  window.setConsentAccepted = setConsentAccepted;
  window.selectTariffAndContinue = selectTariffAndContinue;
  window.selectCardPayment = selectCardPayment;
  window.setTariffBillingPeriod = setTariffBillingPeriod;
  window.syncTariffCarouselDots = syncTariffCarouselDots;
  window.startNewShopFlow = startNewShopFlow;
  window.startNewShopWithTariff = startNewShopWithTariff;
  window.chooseNewShop = chooseNewShop;
  window.startChangeWithSelectedTariff = startChangeWithSelectedTariff;
  window.clearReceiptFile = clearReceiptFile;
  window.copyPlatformCardNumber = copyPlatformCardNumber;
  window.openExternalPaymentDirect = openExternalPaymentDirect;
  window.openExternalPaymentWarning = openExternalPaymentWarning;
  window.closeExternalPaymentWarning = closeExternalPaymentWarning;
  window.setExternalPaymentWarningChecked = setExternalPaymentWarningChecked;
  window.confirmExternalPaymentOpen = confirmExternalPaymentOpen;
  window.onReceiptPicked = onReceiptPicked;
  window.submitSubscriptionRequest = submitSubscriptionRequest;
  window.confirmPaymentClaim = confirmPaymentClaim;
  window.onRequestSentReceiptPicked = onRequestSentReceiptPicked;
  window.clearRequestSentReceiptFile = clearRequestSentReceiptFile;
  window.attachReceiptToSentRequest = attachReceiptToSentRequest;
  window.requestReceiptForRequest = requestReceiptForRequest;
  window.openMyRequests = openMyRequests;
  window.openMyRequestDetails = openMyRequestDetails;
  window.resumeNewShopPayment = resumeNewShopPayment;
  window.onMyRequestReceiptPicked = onMyRequestReceiptPicked;
  window.clearMyRequestReceiptFile = clearMyRequestReceiptFile;
  window.attachMyRequestReceipt = attachMyRequestReceipt;
  window.updateNewShopRequestIdentity = updateNewShopRequestIdentity;
  window.detectMyTelegramId = detectMyTelegramId;
  window.openRequestProvisioning = openRequestProvisioning;
  window.submitRequestProvisioning = submitRequestProvisioning;
  window.setAnalyticsPeriod = setAnalyticsPeriod;
  window.setAdminShopsSearch = setAdminShopsSearch;
  window.setAdminShopsStatusFilter = setAdminShopsStatusFilter;
  window.setAdminShopsTariffFilter = setAdminShopsTariffFilter;
  window.setAdminShopsDaysFilter = setAdminShopsDaysFilter;
  window.setAdminShopsSort = setAdminShopsSort;
  window.toggleAdminShopsFilters = toggleAdminShopsFilters;
  window.resetAdminShopFilters = resetAdminShopFilters;
  window.startUpgradeFor = startUpgradeFor;
  window.startExtendFor = startExtendFor;
  window.setDashboardShop = setDashboardShop;
  window.openMyShopManage = openMyShopManage;
  window.openShopDetails = openShopDetails;
  window.applyTariffFromShopDetails = applyTariffFromShopDetails;
  window.setGrantDaysPreset = setGrantDaysPreset;
  window.setGrantDaysReasonPreset = setGrantDaysReasonPreset;
  window.submitGrantDays = submitGrantDays;
  window.startTerminateShop = startTerminateShop;
  window.cancelTerminateShop = cancelTerminateShop;
  window.confirmTerminateStepReason = confirmTerminateStepReason;
  window.submitFreezeShop = submitFreezeShop;
  window.submitReactivateShop = submitReactivateShop;
  window.submitTerminateShop = submitTerminateShop;
  window.toggleBillzAccess = toggleBillzAccess;
  window.toggleClickAccess = toggleClickAccess;
  window.togglePaymeAccess = togglePaymeAccess;
  window.toggleUzumAccess = toggleUzumAccess;
  // 4.4/4.5-band: Yordam bo'limi
  window.openSupportPage = openSupportPage;
  window.filterHelpItems = filterHelpItems;
  window.submitNewSupportMessage = submitNewSupportMessage;
  window.openSupportThread = openSupportThread;
  window.sendSupportReply = sendSupportReply;
  window.onBugReportAttachmentPicked = onBugReportAttachmentPicked;
  window.submitBugReport = submitBugReport;
  window.openAdminSupportPage = openAdminSupportPage;
  window.setAdminSupportFilter = setAdminSupportFilter;
  window.setAdminSupportTypeFilter = setAdminSupportTypeFilter;
  window.openAdminSupportThread = openAdminSupportThread;
  window.closeAdminSupportThread = closeAdminSupportThread;
  window.setRequestsFilter = setRequestsFilter;
  window.setRequestsSubFilter = setRequestsSubFilter;
  window.setRequestsSearch = setRequestsSearch;
  window.openRequestDetails = openRequestDetails;
  window.viewReceipt = viewReceipt;
  window.approveRequest = approveRequest;
  window.openRejectPrompt = openRejectPrompt;
  window.submitReject = submitReject;
  window.openNewTariffDraft = openNewTariffDraft;
  window.openEditTariffDraft = openEditTariffDraft;
  window.saveTariffDraft = saveTariffDraft;
  window.cancelTariffDraft = cancelTariffDraft;
  window.savePaymentInfo = savePaymentInfo;
  window.openNewPaymentMethodDraft = openNewPaymentMethodDraft;
  window.openEditPaymentMethodDraft = openEditPaymentMethodDraft;
  window.cancelPaymentMethodDraft = cancelPaymentMethodDraft;
  window.savePaymentMethodDraft = savePaymentMethodDraft;
  window.onPaymentMethodLogoPicked = onPaymentMethodLogoPicked;
  window.clearPaymentMethodLogo = clearPaymentMethodLogo;
  window.openEditNotificationTemplateDraft = openEditNotificationTemplateDraft;
  window.cancelNotificationTemplateDraft = cancelNotificationTemplateDraft;
  window.saveNotificationTemplateDraft = saveNotificationTemplateDraft;
  window.onNotificationTemplateImagePicked = onNotificationTemplateImagePicked;
  window.clearNotificationTemplateImage = clearNotificationTemplateImage;
  window.sendTestNotification = sendTestNotification;
  window.openAdminPaymentSettings = openAdminPaymentSettings;
  window.openAdminNotificationSettings = openAdminNotificationSettings;
  window.openAdminLifecycleSettings = openAdminLifecycleSettings;
  window.saveLifecycleSettings = saveLifecycleSettings;
  window.openLifecycleSupport = openLifecycleSupport;
  window.openAdminIntegrationsInfo = openAdminIntegrationsInfo;
  window.editPlatformCard = editPlatformCard;
  window.cancelPlatformCardEdit = cancelPlatformCardEdit;
  window.togglePlatformCardActive = togglePlatformCardActive;
  window.togglePaymentMethodActive = togglePaymentMethodActive;
  window.openNotificationGroup = openNotificationGroup;
  window.toggleNotificationTemplateActive = toggleNotificationTemplateActive;
})();
