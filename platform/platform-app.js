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

  const tg = window.Telegram?.WebApp;
  if (tg) tg.expand();

  if (!window.APP_CONFIG) {
    document.getElementById('app').innerHTML = '<div class="notice error">config.public.js topilmadi.</div>';
    return;
  }
  const CONFIG = window.APP_CONFIG;

  async function callPlatformApi(action, payload) {
    const initData = tg?.initData || '';
    const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/platform-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        'apikey': CONFIG.SUPABASE_KEY,
      },
      body: JSON.stringify({ action, payload: payload || {}, initData }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Server xatosi (${res.status})`);
      err.details = data;
      throw err;
    }
    return data;
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
  };
  function pIcon(name, size) {
    const s = size || 18;
    return `<svg class="p-icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PICONS[name] || ''}</svg>`;
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

  // 5-band: Foydalanish shartlari/Maxfiylik siyosati versiyalari — backend
  // (platform-api/index.ts)dagi TERMS_VERSION/PRIVACY_VERSION bilan QO'LDA
  // sinxronlanadi (ikkita alohida deploy birligi, umumiy modul yo'q).
  const TERMS_VERSION = '1.0';
  const PRIVACY_VERSION = '1.0';

  // Obuna sotib olish oqimi (mijoz tarafi)
  let flowKind = null;        // 'NEW_SHOP' | 'UPGRADE'
  let flowTariffId = null;
  let flowShopId = null;      // UPGRADE uchun
  let paymentInfo = null;     // { cardNumber, cardHolder }
  let receiptFile = null;
  let receiptPreviewUrl = null;
  let consentAccepted = false; // Shartlar/Maxfiylikka rozilik checkbox — default FALSE, foydalanuvchi o'zi belgilashi shart
  let submittingRequest = false;
  let lastSubmittedRequestId = null;

  // Admin: do'konlar ro'yxati + bot ulash (mavjud funksiya, shu yerga ko'chirildi)
  let adminShops = [];
  let verifyResult = null;
  let verifying = false;
  let connecting = false;
  let connectError = null;
  let connectSuccess = null;
  let pendingBotToken = '';
  let selectedShopDetails = null; // adminShops ichidan tanlangan bitta qator

  // Admin: so'rovlar
  let requestsFilter = 'NEW';
  let requests = [];
  let requestsLoading = false;
  let rejectingRequestId = null;

  // Admin: tariflar CRUD
  let adminTariffs = [];
  let tariffDraft = null; // {id?, name, price, productLimit, isActive, isPopular} yoki null

  // Admin: dashboard
  let dashboardSummary = null;

  // Admin: Shop Details — obuna hayot sikli (15/18/19-bandlar)
  let grantDaysPreset = null;         // 1|3|7|14|'other'|null
  let grantDaysReasonPreset = null;   // 'Texnik nosozlik'|'Kompensatsiya'|'Aksiya'|'other'|null
  let grantDaysSubmitting = false;
  let terminateStep = null;           // null | 'reason' | 'confirm'
  let terminateReasonDraft = '';
  let lifecycleActionSubmitting = false;

  // Admin: to'lov ma'lumoti tahrirlash (Tariflar bo'limi ichida kichik bo'lim)
  let paymentInfoDraft = null;

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
  function openPage(pageId) { activePage = pageId; render(); }
  function closePage() { activePage = null; render(); }
  function goHomePage() {
    activePage = null;
    currentTab = isAdminMode ? 'dashboard' : 'home';
    render();
    onTabEnter(currentTab);
  }
  function switchTab(tab) {
    activePage = null;
    currentTab = tab;
    render();
    onTabEnter(tab);
  }
  function onTabEnter(tab) {
    if (tab === 'shops' && isAdminMode) reloadAdminShops();
    if (tab === 'requests') loadRequests();
    if (tab === 'tariffs' && isAdminMode) loadAdminTariffs();
    if (tab === 'dashboard') loadDashboardSummary();
  }

  function pageShell(title, bodyHtml, opts) {
    const backAction = (opts && opts.onBack) || 'closePage()';
    return `
      <div class="plat-page">
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
    render();
    onTabEnter(currentTab);
  }

  // ---- BOOT --------------------------------------------------------------
  async function boot() {
    if (!tg || !tg.initData) {
      document.getElementById('app').innerHTML = `
        <div class="wrap"><header class="top"><h1>UStorE</h1></header>
        <p class="notice error">⚠️ Bu panel faqat Telegram bot orqali ishlaydi.</p></div>`;
      return;
    }
    try {
      const data = await callPlatformApi('platform_boot', {});
      isSuperAdmin = data.isSuperAdmin === true;
      myShops = data.myShops || [];
      tariffs = data.tariffs || [];
      currentTab = myShops.length ? 'home' : 'home'; // ikkalasida ham 'home', render() landing/dashboard'ni tanlaydi
    } catch (e) {
      if (String(e.message || '').startsWith('forbidden:') || String(e.message || '').startsWith('auth_failed:')) {
        accessDenied = true;
      } else {
        bootError = e.message || String(e);
      }
    } finally {
      loading = false;
      render();
      // 2026-08-27: Dashboard'dagi "Yangi xabarlar" statistikasi/muhim-holat
      // uchun mySupportTickets kerak — avval faqat Yordam->Support sahifasi
      // ochilganda yuklanardi. Endi do'koni bor userlar uchun bosh sahifa
      // shu ma'lumotga ham muhtoj, shuning uchun fonda oldindan yuklanadi
      // (mavjud loadMySupportTickets() qayta ishlatiladi, dublikat yo'q).
      if (!isAdminMode && myShops.length) loadMySupportTickets();
    }
  }

  // ---- RENDER ROOT ---------------------------------------------------------
  function render() {
    const app = document.getElementById('app');
    if (accessDenied) {
      app.innerHTML = `<div class="wrap"><header class="top"><h1>UStorE</h1></header><div class="card"><p class="notice error">⛔ Xatolik yuz berdi. Iltimos, botni qayta oching.</p></div></div>`;
      return;
    }
    if (loading) {
      app.innerHTML = `<div class="wrap"><header class="top"><h1>UStorE</h1></header><p class="muted">Yuklanmoqda...</p></div>`;
      return;
    }
    if (bootError) {
      app.innerHTML = `<div class="wrap"><header class="top"><h1>UStorE</h1></header><div class="notice error">${escapeHtml(bootError)}</div></div>`;
      return;
    }

    if (activePage) {
      app.innerHTML = `${renderChrome('')}<div id="plat-page-container">${renderActivePage()}</div>`;
      if (activePage === 'CONNECT_SHOP') wireConnectShopView();
      return;
    }

    // 2026-08-27, USER platform redesign 3-band: Bosh sahifa endi ikki xil
    // holat — do'koni yo'q userga hamon marketing landing (3A), do'koni BOR
    // userga esa amaliy dashboard (5-band, renderShopDashboard). Avvalgi
    // "6-band root-cause fix" (har doim landing) shu spec bilan ATAYLAB
    // bekor qilinmoqda — MD buni aniq talab qiladi (skrinshot 02).
    const showLanding = !isAdminMode && currentTab === 'home' && !myShops.length;
    const showDashboard = !isAdminMode && currentTab === 'home' && myShops.length > 0;
    const body = showLanding ? renderLandingHero() : showDashboard ? renderShopDashboard() : renderTabBody();
    app.innerHTML = `${renderChrome(body)}`;
  }

  function renderChrome(bodyHtml) {
    return `
      <div class="plat-header">
        <div class="plat-header-title">${isAdminMode ? 'UStorE Admin' : 'UStorE'}</div>
        <button id="plat-person-btn" class="plat-header-btn" onclick="togglePersonMenu(event)" aria-label="Profil">${pIcon('user', 17)}</button>
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
    if (p === 'TARIFFS') return pageShell('Tarifni tanlang', renderTariffListBody());
    if (p === 'SUBSCRIPTION_TYPE') return pageShell('Obuna turi', renderSubscriptionTypeBody(), { onBack: "openPage('TARIFFS')" });
    if (p === 'SHOP_PICKER') return pageShell("Do'koningizni tanlang", renderShopPickerBody(), { onBack: "openPage('SUBSCRIPTION_TYPE')" });
    if (p === 'PAYMENT') return pageShell("Obuna uchun to'lov", renderPaymentBody(), { onBack: "openPage('SUBSCRIPTION_TYPE')" });
    if (p === 'REQUEST_SENT') return pageShell("So'rov yuborildi", renderRequestSentBody(), { onBack: 'goHomePage()' });
    if (p === 'CONNECT_SHOP') return pageShell("Yangi do'kon ulash", renderConnectShopBody(), { onBack: "closePage()" });
    if (p === 'SHOP_DETAILS') return pageShell("Do'kon tafsilotlari", renderShopDetailsBody(), { onBack: "switchTab('shops')" });
    if (p === 'TERMS') return pageShell("Foydalanish shartlari", renderTermsBody(), { onBack: "closeTermsPrivacyPage()" });
    if (p === 'PRIVACY') return pageShell("Maxfiylik siyosati", renderPrivacyBody(), { onBack: "closeTermsPrivacyPage()" });
    if (p === 'GUIDE_USAGE') return pageShell("UStorE'dan foydalanish", renderGuideUsageBody(), { onBack: "switchTab('help')" });
    if (p === 'GUIDE_SUBSCRIPTION') return pageShell("To'lov va obuna", renderGuideSubscriptionBody(), { onBack: "switchTab('help')" });
    if (p === 'GUIDE_SHOP_SETUP') return pageShell("Do'kon sozlash", renderGuideShopSetupBody(), { onBack: "switchTab('help')" });
    if (p === 'SUPPORT') return pageShell('Support bilan yozish', renderSupportBody(), { onBack: "switchTab('help')" });
    if (p === 'SUPPORT_THREAD') return pageShell(supportThreadTitle(), renderSupportThreadBody(), { onBack: "openPage('SUPPORT')" });
    if (p === 'BUG_REPORT') return pageShell('Muammo haqida xabar berish', renderBugReportBody(), { onBack: "switchTab('help')" });
    if (p === 'FAQ_FULL') return pageShell('Ko‘p beriladigan savollar', renderFaqFullBody(), { onBack: "switchTab('help')" });
    if (p === 'ADMIN_SUPPORT') return pageShell('Support', renderAdminSupportBody(), { onBack: "switchTab('profile')" });
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
      <div class="plat-hero">
        <h1 class="plat-hero-title">UStorE</h1>
        <p class="plat-hero-sub">Telegram'da o'z e-do'koningizni oching</p>
        <p class="plat-hero-desc">Mahsulotlaringizni soting, buyurtmalarni qabul qiling, omborni boshqaring — barchasi bitta tizimda.</p>
        <button class="primary" onclick="openPage('TARIFFS')">${pIcon('rocket', 16)} Obuna sotib olish</button>
        <button class="secondary" onclick="document.getElementById('plat-why-ustore').scrollIntoView({behavior:'smooth'})">${pIcon('play', 14)} Imkoniyatlarni ko'rish</button>
      </div>

      <div id="plat-why-ustore">
        <h2 class="plat-section-title">Nega UStorE?</h2>
        <p class="plat-section-sub">Savdoni murakkablashtirmang. Do'koningizni Telegram ichida bir joydan boshqaring.</p>
        <div class="plat-carousel">
          ${WHY_USTORE_CARDS.map(([icon, title, desc]) => `
            <div class="plat-carousel-item">
              <div class="plat-why-card">
                <div class="plat-why-card-icon">${pIcon(icon, 22)}</div>
                <div class="plat-why-card-title">${title}</div>
                <div class="plat-why-card-desc">${desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="plat-carousel-dots">${WHY_USTORE_CARDS.map(() => '<span class="plat-carousel-dot"></span>').join('')}</div>
      </div>

      <h2 class="plat-section-title">Qanday ishlaydi?</h2>
      <div class="plat-step-row">
        <div class="plat-step-num">1</div>
        <div><div class="plat-step-title">Tarifni tanlang</div><div class="plat-step-desc">Do'koningiz hajmiga mos tarifni tanlang.</div></div>
      </div>
      <div class="plat-step-row">
        <div class="plat-step-num">2</div>
        <div><div class="plat-step-title">Obunani faollashtiring</div><div class="plat-step-desc">To'lovni amalga oshiring va chekni yuboring.</div></div>
      </div>
      <div class="plat-step-row">
        <div class="plat-step-num">3</div>
        <div><div class="plat-step-title">Savdoni boshlang</div><div class="plat-step-desc">Do'koningiz tayyor bo'lgach mahsulotlarni joylashtiring va buyurtmalarni qabul qiling.</div></div>
      </div>

      <div class="plat-bonus-card">
        <div class="plat-bonus-title">${pIcon('gift', 18)} Birinchi obunada +7 kun bonus</div>
        <div class="plat-bonus-desc">Do'koningizni mahsulotlar bilan to'ldirib, katalog va sozlamalarni tayyorlab olish uchun.</div>
        <div class="plat-bonus-note">Birinchi obuna: 30 kun + 7 kun bonus = 37 kun.</div>
      </div>

      <div class="plat-section-title-row">
        <div><h2 class="plat-section-title">Tariflar</h2><p class="plat-section-sub">Biznesingiz uchun eng mos tarifni tanlang</p></div>
        <button class="plat-link-btn plat-inline-link" onclick="openPage('TARIFFS')">Barcha tariflar →</button>
      </div>
      ${renderBillingToggle()}
      ${renderTariffCards(false)}

      <h2 class="plat-section-title">Do'koningiz uchun ishonchli boshqaruv</h2>
      <div class="plat-trust-grid">
        ${[['lock', "Ma'lumotlaringiz himoyalangan"], ['phone', 'Telefon orqali boshqarish mumkin'], ['bolt', 'Telegram ichida ishlaydi'], ['cloud', "Ma'lumotlar xavfsiz serverlarda saqlanadi"]].map(([icon, text]) => `
          <div class="plat-trust-card">
            <div class="plat-trust-card-icon">${pIcon(icon, 20)}</div>
            <div class="plat-trust-card-text">${text}</div>
          </div>
        `).join('')}
      </div>

      <h2 class="plat-section-title">Ko'p beriladigan savollar</h2>
      <div class="card plat-faq-card">
        ${FAQ_ITEMS.map(([q, a]) => `
          <div class="plat-faq-item">
            <button class="plat-faq-q" onclick="toggleFaq(this)">
              <span>${q}</span>
              <span class="plat-faq-chevron">${pIcon('chevronDown', 16)}</span>
            </button>
            <div class="plat-faq-a"><div class="plat-faq-a-inner">${a}</div></div>
          </div>
        `).join('')}
      </div>

      <div class="plat-final-cta">
        <div class="plat-final-cta-title">Savdoni Telegram'da boshlashga tayyormisiz?</div>
        <div class="plat-final-cta-desc">UStorE bilan do'koningizni bitta tizimdan boshqaring.</div>
        <button class="primary" onclick="openPage('TARIFFS')">🚀 Obuna sotib olish</button>
      </div>
    `;
  }

  // 4.6-band: birinchi darajali imkoniyatlar — MD'da aniq ro'yxat berilgan
  // (hozirgi backendda tariflar orasida feature-restriction yo'q, faqat
  // mahsulot soni farq qiladi — shuning uchun bu ro'yxat HAMMA tarifda bir
  // xil ko'rsatiladi, "bu tarifda yo'q" degan o'zboshimcha cheklov qo'yilmaydi).
  const TARIFF_FEATURE_LIST = [
    'Marketing vositalari', "Yetkazib berish parametrlarini sozlash", "To'lov parametrlarini sozlash",
    'Click / Payme online ekvayring', "Billz'dan tovar yuklash", 'Hisobotlar', 'Ombor / qoldiq nazorati',
  ];
  function renderBillingToggle() {
    return `
      <div class="plat-billing-toggle">
        <button type="button" class="plat-billing-opt ${tariffBillingPeriod === 'monthly' ? 'active' : ''}" onclick="setTariffBillingPeriod('monthly')">
          <b>Oylik</b><small>Har oy to'lov</small>
        </button>
        <button type="button" class="plat-billing-opt ${tariffBillingPeriod === 'annual' ? 'active' : ''}" onclick="setTariffBillingPeriod('annual')">
          <b>Yillik <span class="plat-billing-free-badge">2 oy bepul</span></b><small>Yillik to'lov — 2 oy bepul</small>
        </button>
      </div>
      ${tariffBillingPeriod === 'annual' ? `
        <div class="plat-billing-promo">
          <span class="plat-billing-promo-icon">%</span>
          <div><b>Yillik obuna qiling va 2 oy bepul oling!</b><p>12 oy o'rniga 10 oylik to'lov bilan foydalaning.</p></div>
        </div>` : ''}
    `;
  }
  function setTariffBillingPeriod(period) { tariffBillingPeriod = period; render(); }

  // compact=false (landing teaser) -> gorizontal carousel; compact=true
  // (TARIFFS to'liq sahifasi) -> vertikal to'liq ro'yxat, ikkalasi ham bir
  // xil kartani (renderOneTariffCard) qayta ishlatadi.
  function renderOneTariffCard(t, opts) {
    opts = opts || {};
    const isCurrent = !!(opts.currentTariffId && opts.currentTariffId === t.id);
    const period = tariffBillingPeriod;
    const priceHtml = period === 'annual'
      ? `<div class="plat-tariff-price-strike">${money(annualOriginalPrice(t.price))}</div><div class="plat-tariff-price">${money(annualOfferPrice(t.price))}<span>/ 12 oy</span></div>`
      : `<div class="plat-tariff-price">${money(t.price)}<span>/oy</span></div>`;
    const ctaHtml = isCurrent
      ? `<button class="secondary plat-small-btn plat-tariff-current-btn" style="width:100%; margin-top:10px" disabled>${pIcon('check', 14)} Joriy tarif</button>`
      : `<button class="primary plat-small-btn" style="width:100%; margin-top:10px" onclick="${opts.onSelectJs || `selectTariffAndContinue('${t.id}')`}">${opts.ctaLabel || "Tarifni tanlash"}</button>`;
    return `
      <div class="plat-tariff-card ${flowTariffId === t.id ? 'selected' : ''} ${isCurrent ? 'is-current' : ''}">
        ${isCurrent ? '<span class="plat-tariff-badge is-current">✓ Joriy tarif</span>' : t.isPopular ? '<span class="plat-tariff-badge">🔥 Eng ommabop</span>' : ''}
        <div class="plat-tariff-name">${escapeHtml(t.name)}</div>
        ${priceHtml}
        ${period === 'annual' ? '<span class="plat-tariff-annual-badge">2 oy bepul</span>' : ''}
        <div class="plat-tariff-limit">${limitLabel(t.productLimit)}</div>
        <ul class="plat-tariff-features">
          ${TARIFF_FEATURE_LIST.map((f) => `<li>${pIcon('check', 13)}<span>${f}</span></li>`).join('')}
        </ul>
        ${ctaHtml}
      </div>
    `;
  }
  function renderTariffCards(compact, opts) {
    if (!tariffs.length) return '<p class="empty">Hozircha tarif mavjud emas.</p>';
    if (compact) {
      return `<div class="plat-tariff-grid">${tariffs.map((t) => renderOneTariffCard(t, opts)).join('')}</div>`;
    }
    // 4.4-band: 1 to'liq + keyingisining 15-25% qismi ko'rinadigan swipe
    // carousel — CSS scroll-snap orqali (plat-carousel/-item, platform.css).
    return `
      <div class="plat-carousel plat-tariff-carousel">${tariffs.map((t) => `<div class="plat-carousel-item plat-tariff-carousel-item">${renderOneTariffCard(t, opts)}</div>`).join('')}</div>
      <div class="plat-carousel-dots">${tariffs.map(() => '<span class="plat-carousel-dot"></span>').join('')}</div>
    `;
  }

  function renderTariffListBody() {
    return `
      <p class="muted">Sizga mos tarifni tanlang:</p>
      ${renderBillingToggle()}
      ${renderTariffCards(true)}
    `;
  }
  function selectTariffAndContinue(tariffId) {
    flowTariffId = tariffId;
    openPage('SUBSCRIPTION_TYPE');
  }

  // ======================================================================
  // OBUNA TURI (yangi do'kon / mavjud do'kon oshirish)
  // ======================================================================
  function renderSubscriptionTypeBody() {
    const tariff = tariffs.find((t) => t.id === flowTariffId);
    return `
      ${tariff ? `<div class="card plat-summary-card"><b>${escapeHtml(tariff.name)}</b> — ${money(tariff.price)}/oy · ${limitLabel(tariff.productLimit)}</div>` : ''}
      <button class="plat-choice-btn" onclick="chooseNewShop()">🆕 Yangi do'kon ochaman</button>
      ${myShops.length ? `<button class="plat-choice-btn" onclick="chooseUpgrade()">⬆️ Mavjud do'konim tarifini o'zgartiraman</button>` : `<p class="muted" style="margin-top:10px">Sizda hozircha ulangan do'kon yo'q — faqat yangi do'kon ochish mumkin.</p>`}
    `;
  }
  function chooseNewShop() {
    flowKind = 'NEW_SHOP';
    flowShopId = null;
    consentAccepted = false; // har bir yangi so'rov o'z alohida roziligini talab qiladi
    openPage('PAYMENT');
  }
  function chooseUpgrade() {
    flowKind = 'UPGRADE';
    consentAccepted = false;
    openPage('SHOP_PICKER');
  }

  function renderShopPickerBody() {
    if (!myShops.length) return '<p class="empty">Sizda ulangan do\'kon topilmadi.</p>';
    return `<div class="plat-shop-pick-list">${myShops.map((s) => `
      <button class="plat-shop-pick-row" onclick="pickUpgradeShop('${s.id}')">
        <div>
          <div class="name">${escapeHtml(s.botUsername ? '@' + s.botUsername : s.publicCode)}</div>
          <div class="meta">${escapeHtml(s.tariffName || 'Tarifsiz')} · ${limitLabel(s.productLimit)}</div>
        </div>
        <span>›</span>
      </button>
    `).join('')}</div>`;
  }
  function pickUpgradeShop(shopId) {
    flowShopId = shopId;
    openPage('PAYMENT');
  }

  // ======================================================================
  // TO'LOV (karta + nusxalash + chek yuklash)
  // ======================================================================
  async function ensurePaymentInfoLoaded() {
    if (paymentInfo) return;
    try { paymentInfo = await callPlatformApi('platform_get_payment_info', {}); }
    catch (e) { paymentInfo = { cardNumber: null, cardHolder: null }; }
  }
  function renderPaymentBody() {
    const tariff = tariffs.find((t) => t.id === flowTariffId);
    if (!paymentInfo) {
      ensurePaymentInfoLoaded().then(() => { if (activePage === 'PAYMENT') rerenderActivePage(); });
      return '<p class="muted">Yuklanmoqda...</p>';
    }
    return `
      ${tariff ? `<div class="card plat-summary-card"><b>${escapeHtml(tariff.name)}</b><br>To'lov summasi: <b>${money(tariff.price)}</b></div>` : ''}
      <div class="card">
        <h2>To'lov kartasi</h2>
        <div class="plat-card-number-row">
          <span id="plat-card-number" class="plat-card-number">${escapeHtml(paymentInfo.cardNumber || 'Karta raqami hali kiritilmagan')}</span>
          ${paymentInfo.cardNumber ? `<button class="plat-copy-btn" onclick="copyPlatformCardNumber()">📋 Nusxalash</button>` : ''}
        </div>
        ${paymentInfo.cardHolder ? `<p class="muted">${escapeHtml(paymentInfo.cardHolder)}</p>` : ''}
      </div>
      <div class="card">
        <h2>To'lov chekini yuboring</h2>
        <input type="file" id="plat-receipt-input" accept="image/*" class="hidden" onchange="onReceiptPicked(event)">
        <input type="file" id="plat-receipt-input-files" class="hidden" onchange="onReceiptPicked(event)">
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <button class="secondary" style="flex:1; margin-top:0" onclick="document.getElementById('plat-receipt-input').click()">🖼 Galereyadan tanlash</button>
          <button class="secondary" style="flex:1; margin-top:0" onclick="document.getElementById('plat-receipt-input-files').click()">📁 Fayllardan tanlash</button>
        </div>
        ${receiptPreviewUrl ? `<img src="${receiptPreviewUrl}" class="plat-receipt-preview">` : ''}
        ${connectError ? `<div class="notice error">${escapeHtml(connectError)}</div>` : ''}
      </div>
      <div class="card">
        <label class="plat-checkbox-row" style="align-items:flex-start">
          <input type="checkbox" id="plat-consent-checkbox" ${consentAccepted ? 'checked' : ''} onchange="setConsentAccepted(this.checked)">
          <span>Men UStorE <a href="#" onclick="event.preventDefault(); openTermsPage('PAYMENT');" style="color:#1d4ed8">Foydalanish shartlari</a> va <a href="#" onclick="event.preventDefault(); openPrivacyPage('PAYMENT');" style="color:#1d4ed8">Maxfiylik siyosati</a>ni o'qidim, tushundim va ularga roziman.</span>
        </label>
      </div>
      <button class="primary ${(!receiptFile || !consentAccepted || submittingRequest) ? 'plat-btn-dimmed' : ''}" onclick="submitSubscriptionRequest()">
        ${submittingRequest ? '<span class="spinner"></span> Yuborilmoqda...' : "So'rov yuborish"}
      </button>
    `;
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
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function submitSubscriptionRequest() {
    if (submittingRequest) return;
    // 5-band: checkbox native disabled EMAS (button.plat-btn-dimmed shunchaki
    // vizual) — shu sabab bosilganda aniq nima yetishmayotganini aytish kerak.
    if (!consentAccepted) { alert("Davom etish uchun Foydalanish shartlari va Maxfiylik siyosatiga rozilik bildiring."); return; }
    if (!receiptFile) { alert("Iltimos, to'lov chekini yuklang."); return; }
    submittingRequest = true;
    connectError = null;
    rerenderActivePage();
    try {
      const base64 = await fileToBase64(receiptFile);
      const result = await callPlatformApi('platform_submit_subscription_request', {
        kind: flowKind, shopId: flowShopId || undefined, tariffId: flowTariffId,
        requesterUsername: (tg?.initDataUnsafe?.user?.username) || null,
        requesterFirstName: (tg?.initDataUnsafe?.user?.first_name) || null,
        receiptImageUpload: { base64, mimeType: receiptFile.type, fileName: receiptFile.name },
        consentAccepted: true,
      });
      lastSubmittedRequestId = result.requestId;
      receiptFile = null;
      if (receiptPreviewUrl) { try { URL.revokeObjectURL(receiptPreviewUrl); } catch (_) {} }
      receiptPreviewUrl = null;
      openPage('REQUEST_SENT');
    } catch (e) {
      connectError = e.message || String(e);
      rerenderActivePage();
    } finally {
      submittingRequest = false;
    }
  }
  function renderRequestSentBody() {
    return `
      <div class="card plat-center">
        <div style="font-size:40px">✅</div>
        <h2>So'rov yuborildi</h2>
        <p class="muted">To'lovingiz tekshirilmoqda. Tasdiqlanganda Telegram orqali xabar beramiz.</p>
        <div class="status-pill" style="background:#fef3c7;color:#b45309">🟡 Tekshirilmoqda</div>
        <button class="primary" style="margin-top:16px" onclick="goHomePage()">Bosh sahifaga qaytish</button>
      </div>`;
  }

  // ======================================================================
  // 2026-08-27, USER platform redesign 5-band: do'koni BOR user uchun Bosh
  // sahifa — landing o'rniga amaliy dashboard. Faqat REAL ma'lumot: fake
  // reyting/faoliyat/"12 kun" kabi hardcode raqam yo'q — barchasi
  // myShops (platform_list_my_shops, boot()da yuklangan) va mySupportTickets
  // dan.
  // ======================================================================
  function renderShopDashboard() {
    if (!dashboardShopId || !myShops.some((s) => s.id === dashboardShopId)) dashboardShopId = myShops[0].id;
    const s = myShops.find((sh) => sh.id === dashboardShopId) || myShops[0];
    const left = daysUntil(s.subscriptionExpiresAt);
    const warn = left !== null && left <= 7;
    const firstName = tg?.initDataUnsafe?.user?.first_name || '';
    const activeShopsCount = myShops.filter((sh) => sh.status === 'ACTIVE').length;
    const unreadSupport = mySupportTickets.filter((t) => t.status === 'ANSWERED').length;
    const stats = [
      ['bag', 'Bugungi buyurtmalar', s.ordersToday],
      ['box', 'Mahsulotlar', s.usedProductCount],
      ['shop', 'Faol do‘konlar', activeShopsCount],
      ['chat', 'Yangi xabarlar', unreadSupport],
    ];
    const alerts = [];
    if (warn) alerts.push(['calendar', `Obuna tugashiga ${left <= 0 ? 'muddati o\'tdi' : left + ' kun qoldi'}`, `Tarif: ${s.tariffName || 'Tarifsiz'}`, "switchTab('subscription')"]);
    if (unreadSupport > 0) alerts.push(['chat', `${unreadSupport} ta yangi support javobi bor`, 'Tekshirib ko‘ring', "openSupportPage()"]);
    if (!s.botUsername) alerts.push(['bolt', 'Bot hali ulanmagan', "Do'kon sozlash bo'yicha yordam oling", "openPage('GUIDE_SHOP_SETUP')"]);
    const capabilities = [
      ['bolt', 'Marketing'], ['truck', 'Yetkazib berish parametrlarini sozlash'], ['card', 'Click / Payme / online ekvayring'],
      ['box', "Billz'dan tovar yuklash"], ['layers', 'Hisobotlar'], ['dashboard', 'Ombor'],
    ];
    return `
      <div class="card plat-dashboard-summary">
        <div class="plat-dashboard-summary-top">
          <span class="plat-shop-avatar plat-shop-avatar-lg">${shopAvatarHtml(s)}</span>
          <div class="plat-dashboard-summary-mid">
            ${firstName ? `<p class="plat-dashboard-greet">Salom, ${escapeHtml(firstName)} 👋</p>` : ''}
            <div class="plat-dashboard-summary-name">
              <b>${escapeHtml(s.shopName || (s.botUsername ? '@' + s.botUsername : s.publicCode))}</b>
              ${myShops.length > 1 ? `<button class="plat-shop-switch-btn" onclick="toggleDashboardShopMenu(event)">${pIcon('chevronDown', 14)}</button>` : ''}
            </div>
          </div>
          <span class="status-pill status-${s.status}">${statusLabel(s.status)}</span>
        </div>
        <div id="plat-dashboard-shop-menu" class="hidden plat-dashboard-shop-menu">
          ${myShops.map((sh) => `<button onclick="setDashboardShop('${sh.id}')">${escapeHtml(sh.shopName || sh.botUsername || sh.publicCode)}</button>`).join('')}
        </div>
        <div class="plat-dashboard-summary-bottom">
          <span>${pIcon('diamond', 13)} Tarif: <b>${escapeHtml(s.tariffName || 'Tarifsiz')}</b></span>
          ${s.subscriptionExpiresAt ? `<span class="${warn ? 'is-warn' : ''}">${pIcon('calendar', 13)} Obuna tugashiga ${left <= 0 ? 'muddati o\'tdi' : left + ' kun qoldi'}</span>` : ''}
        </div>
      </div>

      <div class="plat-stat-grid">
        ${stats.map(([icon, label, val]) => `<div class="card plat-stat-card"><span class="plat-stat-icon">${pIcon(icon, 18)}</span><small>${label}</small><b>${val}</b></div>`).join('')}
      </div>

      <h2 class="plat-section-title">Tezkor amallar</h2>
      <div class="plat-quick-actions">
        ${s.botUsername ? `<a class="plat-quick-action" href="https://t.me/${escapeHtml(s.botUsername)}" target="_blank" rel="noopener">${pIcon('shop', 19)}<span>Do'konni ochish</span></a>` : `<button class="plat-quick-action" onclick="openPage('GUIDE_SHOP_SETUP')">${pIcon('shop', 19)}<span>Do'konni ulash</span></button>`}
        <button class="plat-quick-action" onclick="switchTab('shops')">${pIcon('layers', 19)}<span>Do'konlarim</span></button>
        <button class="plat-quick-action" onclick="switchTab('subscription')">${pIcon('diamond', 19)}<span>Obunani boshqarish</span></button>
        <button class="plat-quick-action" onclick="switchTab('help')">${pIcon('chat', 19)}<span>Yordam</span></button>
      </div>

      ${alerts.length ? `
        <h2 class="plat-section-title">Muhim holatlar</h2>
        <div class="card plat-alert-list">
          ${alerts.map(([icon, title, sub, action]) => `
            <button type="button" class="plat-alert-row" onclick="${action}">
              <span class="plat-alert-icon">${pIcon(icon, 16)}</span>
              <span><b>${title}</b><small>${sub}</small></span>
              <span class="plat-alert-chevron">${pIcon('chevronDown', 14)}</span>
            </button>
          `).join('')}
        </div>` : `
        <div class="card plat-all-ok"><span>${pIcon('check', 16)}</span><b>Hammasi joyida</b></div>`}

      <div class="plat-section-title-row">
        <h2 class="plat-section-title">UStorE imkoniyatlari</h2>
        <button class="plat-link-btn plat-inline-link" onclick="openPage('GUIDE_USAGE')">Ko'proq ko'rish →</button>
      </div>
      <div class="plat-capability-grid">
        ${capabilities.map(([icon, label]) => `<div class="plat-capability-card">${pIcon(icon, 18)}<span>${label}</span></div>`).join('')}
      </div>
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
    const newShopCta = `
      <button type="button" class="plat-new-shop-cta" onclick="openPage('TARIFFS')">
        <span class="plat-new-shop-cta-icon">${pIcon('plus', 18)}</span>
        <span><b>Yangi do'kon ochish</b><small>Yangi do'kon yaratish va botni ulash</small></span>
      </button>`;
    if (!myShops.length) {
      return `
        <div class="plat-shops-header">
          <div class="plat-shops-header-icon">${pIcon('shop', 22)}</div>
          <div><h1>Do'konlarim</h1><p class="muted">Sizda hozircha do'kon yo'q</p></div>
        </div>
        ${newShopCta}`;
    }
    return `
      <div class="plat-shops-header">
        <div class="plat-shops-header-icon">${pIcon('shop', 22)}</div>
        <div><h1>Do'konlarim</h1><p class="muted">${myShops.length} ta do'kon · <span class="is-ok">${activeCount} ta faol</span></p></div>
        <button class="primary plat-small-btn plat-shops-header-cta" onclick="openPage('TARIFFS')">${pIcon('plus', 14)} Yangi do'kon</button>
      </div>
      <div class="plat-tip-banner">
        <span>${pIcon('bolt', 16)}</span>
        <div><b>Yangi do'kon ochish 2 daqiqadan kam vaqt oladi.</b><p>Bot yaratish, to'lov ulash va do'konni sozlash oson!</p></div>
      </div>
      <div class="plat-shop-card-list">${myShops.map((s) => `
        <div class="card plat-shop-card-v2">
          <div class="plat-shop-card-v2-head">
            <span class="plat-shop-avatar">${shopAvatarHtml(s)}</span>
            <div class="plat-shop-card-v2-title">
              <b>${escapeHtml(s.shopName || (s.botUsername ? '@' + s.botUsername : s.publicCode))}</b>
              <span class="status-pill status-${s.status}">${statusLabel(s.status)}</span>
              ${s.shopName && s.botUsername ? `<small>@${escapeHtml(s.botUsername)}</small>` : ''}
            </div>
            ${s.subscriptionExpiresAt ? (() => { const left = daysUntil(s.subscriptionExpiresAt); const warn = left !== null && left <= 7; return `<div class="plat-shop-days-pill ${warn ? 'is-warn' : 'is-ok'}">${pIcon('calendar', 14)}<span>${left <= 0 ? 'Tugagan' : `${left} kun qoldi`}</span></div>`; })() : ''}
          </div>
          <div class="plat-shop-metrics">
            <div><b>${s.usedProductCount}</b><small>mahsulot</small></div>
            <div><b>${s.usedOrderCount}</b><small>buyurtma</small></div>
            <div><b>${escapeHtml(s.tariffName || 'Tarifsiz')}</b><small>joriy tarif</small></div>
          </div>
          <div class="plat-shop-card-actions">
            ${s.botUsername ? `<a class="secondary plat-small-btn" href="https://t.me/${escapeHtml(s.botUsername)}" target="_blank" rel="noopener">${pIcon('shop', 14)} Do'konni ochish</a>` : '<span></span>'}
            <button class="secondary plat-small-btn" onclick="openMyShopManage('${s.id}')">${pIcon('gear', 14)} Boshqarish</button>
          </div>
          ${shopStatusRowHtml(s)}
        </div>
      `).join('')}</div>
      ${newShopCta}
      <div class="plat-grow-banner">
        <span>🎁</span>
        <div><b>Do'konlaringizni rivojlantiring!</b><p>Marketing vositalari, chegirmalar, aksiyalar va statistika bilan sotuvlaringizni oshiring.</p></div>
      </div>
    `;
  }
  // Ehtiyot: platform.js'da admin tarafda AYNAN shu nomdagi
  // openShopDetails() allaqachon bor (boshqa do'konlarni boshqarish uchun,
  // adminShops/selectedShopDetails ustida ishlaydi) — nom to'qnashib
  // ustidan yozib qo'ymasligi uchun user-tarafdagi funksiya ATAYLAB boshqa
  // nom bilan (openMyShopManage) yozildi.
  function openMyShopManage(shopId) { dashboardShopId = shopId; switchTab('subscription'); }

  function renderSubscriptionTab() {
    if (!myShops.length) {
      return `<p class="muted">Sizda hali do'kon yo'q — obuna sotib olish uchun avval tarif tanlang.</p><button class="primary" onclick="openPage('TARIFFS')">Tarif tanlash</button>`;
    }
    if (!dashboardShopId || !myShops.some((s) => s.id === dashboardShopId)) dashboardShopId = myShops[0].id;
    const s = myShops.find((sh) => sh.id === dashboardShopId) || myShops[0];
    const left = daysUntil(s.subscriptionExpiresAt);
    const warn = left !== null && left <= 7;
    return `
      ${myShops.length > 1 ? `<label class="plat-shop-selector"><span class="muted">Do'kon</span><select onchange="setDashboardShop(this.value)">${myShops.map((sh) => `<option value="${sh.id}" ${sh.id === s.id ? 'selected' : ''}>${escapeHtml(sh.shopName || sh.botUsername || sh.publicCode)}</option>`).join('')}</select></label>` : ''}
      <div class="card plat-subscription-summary">
        <div class="plat-subscription-summary-top">
          <span class="plat-shop-avatar plat-shop-avatar-lg">${pIcon('diamond', 20)}</span>
          <div>
            <p class="muted plat-tiny">Joriy tarifingiz</p>
            <div class="plat-subscription-summary-name"><b>${escapeHtml(s.tariffName || 'Tarifsiz')}</b><span class="status-pill status-${s.status}">${statusLabel(s.status)}</span></div>
            <p class="muted">Do'kon: ${escapeHtml(s.shopName || (s.botUsername ? '@' + s.botUsername : s.publicCode))}</p>
          </div>
        </div>
        <div class="plat-subscription-summary-mid">
          ${s.subscriptionExpiresAt ? `<div><p class="muted plat-tiny">Obuna tugash sanasi</p><b>${pIcon('calendar', 13)} ${formatDate(s.subscriptionExpiresAt)}</b><p class="${warn ? 'is-warn' : 'is-ok'} plat-tiny">${left <= 0 ? 'Tugagan' : `${left} kun qoldi`}</p></div>` : '<div><p class="muted">Obuna maʼlumoti yoʻq</p></div>'}
        </div>
        <div class="plat-subscription-summary-actions">
          <button class="primary plat-small-btn" onclick="startExtendFor('${s.id}')">${pIcon('rocket', 14)} Obunani uzaytirish</button>
          <button class="secondary plat-small-btn" onclick="startUpgradeFor('${s.id}')">Tarifni o'zgartirish</button>
        </div>
      </div>
      ${renderBillingToggle()}
      ${renderTariffCards(false, { currentTariffId: s.tariffId, onSelectJs: `startUpgradeFor('${s.id}')`, ctaLabel: "Tanlash" })}
    `;
  }
  function setDashboardShop(shopId) { dashboardShopId = shopId; render(); }
  // "Uzaytirish" ham texnik jihatdan xuddi shu UPGRADE oqimi (joriy tarifni
  // qayta tanlab, to'lovni takrorlash) — alohida backend action yo'q, mavjud
  // subscription request flow qayta ishlatiladi (yangi logika o'ylab topilmadi).
  function startExtendFor(shopId) { startUpgradeFor(shopId); }
  function startUpgradeFor(shopId) {
    flowKind = 'UPGRADE';
    flowShopId = shopId;
    flowTariffId = null;
    openPage('TARIFFS');
  }

  // 8.2/9-band: birinchi 3 tasi navigation card (qo'llanma sahifasiga
  // o'tadi), oxirgi 2 tasi (support/muammo) action card — o'ng tarafida
  // aniq tugma bilan sal ajralib turadi (screenshot 05).
  const HELP_NAV_ROWS = [
    ['book', 'plat-help-icon-blue', "UStorE'dan foydalanish", 'Platforma imkoniyatlari va foydalanish bo‘yicha qo‘llanma', "openPage('GUIDE_USAGE')"],
    ['card', 'plat-help-icon-green', "To'lov va obuna", "Tariflar, to'lov usullari va obuna bo'yicha ma'lumot", "openPage('GUIDE_SUBSCRIPTION')"],
    ['shop', 'plat-help-icon-orange', "Do'kon sozlash", "Do'konni yaratish, sozlash va botni ulash bo'yicha yordam", "openPage('GUIDE_SHOP_SETUP')"],
  ];
  function renderHelpTab() {
    return `
      <div class="plat-help-hero">
        <div><h1>Yordam markazi</h1><p class="muted">Savolingizga javob toping yoki biz bilan bog'laning</p></div>
        <span class="plat-help-hero-icon">${pIcon('chat', 34)}</span>
      </div>
      <div class="plat-help-list">
        ${HELP_NAV_ROWS.map(([icon, tone, title, desc, action]) => `
          <button type="button" class="card plat-help-row" onclick="${action}">
            <span class="plat-help-row-icon ${tone}">${pIcon(icon, 20)}</span>
            <span class="plat-help-row-copy"><b>${title}</b><small>${desc}</small></span>
            <span class="plat-help-row-chevron">${pIcon('back', 15)}</span>
          </button>
        `).join('')}
        <div class="card plat-help-row plat-help-row-action">
          <span class="plat-help-row-icon plat-help-icon-blue">${pIcon('headset', 20)}</span>
          <span class="plat-help-row-copy"><b>Support bilan yozish</b><small>Bizning jamoa bilan chatda yozing, savollaringizga tez javob oling</small></span>
          <button class="primary plat-small-btn" onclick="openSupportPage()">${pIcon('chat', 13)} Yozish</button>
        </div>
        <div class="card plat-help-row plat-help-row-action plat-help-row-green">
          <span class="plat-help-row-icon plat-help-icon-green">${pIcon('mail', 20)}</span>
          <span class="plat-help-row-copy"><b>Muammo haqida xabar berish</b><small>Xatolik yoki muammo haqida bizga xabar bering, tekshirib chiqamiz</small></span>
          <button class="secondary plat-small-btn plat-btn-green" onclick="openPage('BUG_REPORT')">${pIcon('mail', 13)} Xabar berish</button>
        </div>
      </div>
      <div class="plat-section-title-row">
        <h2 class="plat-section-title">Tez-tez so'raladigan savollar</h2>
        <button class="plat-link-btn plat-inline-link" onclick="openPage('FAQ_FULL')">Ko'proq ko'rish →</button>
      </div>
      <div class="card plat-faq-preview">
        ${FAQ_PREVIEW_ITEMS.map((q) => `<button type="button" class="plat-faq-preview-row" onclick="openPage('FAQ_FULL')"><span class="plat-faq-preview-icon">?</span><span>${q}</span><span class="plat-faq-preview-chevron">${pIcon('back', 14)}</span></button>`).join('')}
      </div>
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
      <p class="muted" style="margin-bottom:14px">Do'koningizni ochishdan birinchi buyurtmagacha bo'lgan yo'l — bosqichma-bosqich.</p>
      ${guideStep(1, 'Tarifni tanlang', "Do'koningiz hajmiga mos tarifni tanlang.", `<button class="secondary plat-small-btn" style="margin-top:8px" onclick="openPage('TARIFFS')">Tariflarni ko'rish</button>`)}
      ${guideStep(2, 'Obunani faollashtiring', "To'lovni amalga oshiring va chekni yuboring — tasdiqlangач do'koningiz ulanadi.")}
      ${guideStep(3, "Do'kon botini ulang", "Yangi do'kon uchun 24 soat ichida, mavjud do'kon uchun darhol.")}
      ${guideStep(4, 'Katalog yarating', "Do'kon botingiz ichida (Do'kon sozlamalari → Kataloglar) bo'limlarni tuzing.")}
      ${guideStep(5, "Tovar qo'shing", "Har bir tovarga rasm, narx va qoldiqni kiriting.")}
      ${guideStep(6, "To'lov usulini sozlang", "Naqd, karta yoki QR — do'kon botingizning To'lov sozlamalaridan.")}
      ${guideStep(7, "Yetkazib berishni sozlang", "Bepul, aniq narxli, taksi yoki pochta — hududlar bo'yicha.")}
      ${guideStep(8, 'Buyurtmalarni qabul qiling', "Mijozlar buyurtma bersa, do'kon botingizda ko'rinadi va boshqariladi.")}
    `;
  }
  function renderGuideSubscriptionBody() {
    return `
      <p class="muted" style="margin-bottom:14px">Tariflar, to'lov va obuna qanday ishlashi haqida.</p>
      <div class="card"><b>Tariflar nima uchun farq qiladi?</b><p class="muted" style="margin-top:6px">Har bir tarif do'koningizga qo'shishingiz mumkin bo'lgan mahsulotlar sonini belgilaydi. Ko'proq mahsulot kerak bo'lsa — yuqoriroq tarifga o'tasiz.</p></div>
      <div class="card"><b>🎁 Birinchi obunada +7 kun bonus</b><p class="muted" style="margin-top:6px">Do'koningizni birinchi marta ulaganda, standart 30 kun ustiga yana 7 kun bepul qo'shiladi — jami 37 kun.</p></div>
      <div class="card"><b>To'lov qanday amalga oshiriladi?</b><p class="muted" style="margin-top:6px">Hozircha karta orqali to'lov qilib, chek yuborasiz. UStorE Admin tekshirib tasdiqlaydi.</p></div>
      <div class="card"><b>Obuna muddati tugasa nima bo'ladi?</b><p class="muted" style="margin-top:6px">Do'kon avval muzlatiladi (ma'lumotlar saqlanadi), obunani yangilasangiz darhol qayta faollashadi.</p></div>
      <div class="card"><b>Tarifni oshirish mumkinmi?</b><p class="muted" style="margin-top:6px">Ha — istalgan vaqt yuqoriroq tarifni tanlab, obunangizni yangilashingiz mumkin.</p></div>
      <button class="primary" style="margin-top:10px" onclick="switchTab('subscription')">Obunamni ko'rish</button>
    `;
  }
  function renderGuideShopSetupBody() {
    const myShop = myShops[0] || null;
    return `
      <p class="muted" style="margin-bottom:14px">Do'koningizni savdoga tayyorlash uchun qadamlar — bular do'kon botingizning o'zida bajariladi.</p>
      ${guideStep(1, "Do'kon ma'lumotlari", "Logotip, nom, manzil, telefon — Do'kon sozlamalari → Do'kon haqida.")}
      ${guideStep(2, 'Katalog', "Bo'limlarni (kategoriyalarni) tuzing.")}
      ${guideStep(3, 'Tovar', "Rasm, nom, tavsif bilan tovar qo'shing.")}
      ${guideStep(4, 'Narx/qoldiq', "Har bir tovarga narx va ombordagi sonini kiriting.")}
      ${guideStep(5, "To'lov usuli", "Naqd/karta/QR — qaysi hududda qaysi usul ishlashini belgilang.")}
      ${guideStep(6, "Yetkazib berish", "Bepul/aniq narx/taksi/pochta usullarini sozlang.")}
      ${guideStep(7, 'Test buyurtma', "O'zingiz mijoz sifatida sinab ko'ring.")}
      ${myShop?.botUsername ? `<a class="plat-link-btn" style="margin-top:10px" href="https://t.me/${escapeHtml(myShop.botUsername)}" target="_blank" rel="noopener">Do'kon botimni ochish →</a>`
        : `<button class="primary" style="margin-top:10px" onclick="openPage('TARIFFS')">Tarif tanlab boshlash</button>`}
    `;
  }

  // ======================================================================
  // 4.4-band: Support bilan yozish (foydalanuvchi tomoni)
  // ======================================================================
  function supportStatusLabel(s) {
    if (s === 'OPEN') return "🟡 Javob kutilmoqda";
    if (s === 'ANSWERED') return "🟢 Javob berildi";
    return "⚪ Yopilgan";
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
      <div class="card">
        <h2>Yangi xabar</h2>
        <textarea id="plat-support-new-msg" rows="3" placeholder="Savolingizni yozing..." style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid #d7e3f8; font-size:13px; font-family:inherit; resize:vertical"></textarea>
        <button class="primary" style="margin-top:8px" onclick="submitNewSupportMessage()">Yuborish</button>
      </div>
      ${mySupportTicketsLoading ? `<p class="muted">Yuklanmoqda...</p>` : mySupportTickets.length ? `
        <h2 style="font-size:13px; margin:14px 0 8px">Murojaatlarim</h2>
        <div class="plat-shop-pick-list">
          ${mySupportTickets.map((t) => `
            <div class="plat-shop-pick-row" onclick="openSupportThread(${t.id})">
              <div><div class="name">#${t.id}${t.subject ? ' — ' + escapeHtml(t.subject) : ''}</div><div class="meta">${formatDate(t.createdAt)}</div></div>
              <span class="status-pill status-${t.status === 'ANSWERED' ? 'ACTIVE' : t.status === 'CLOSED' ? 'DISABLED' : 'PROVISIONING'}">${supportStatusLabel(t.status)}</span>
            </div>
          `).join('')}
        </div>
      ` : `<p class="empty">Hozircha murojaat yo'q.</p>`}
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
      ${activeSupportLoading ? `<p class="muted">Yuklanmoqda...</p>` : activeSupportMessages.map((m) => `
        <div class="card" style="${m.sender === 'ADMIN' ? 'border-color:#93c5fd' : ''}">
          <p class="muted" style="margin:0 0 4px">${m.sender === 'ADMIN' ? 'UStorE Support' : 'Siz'} · ${formatDate(m.createdAt)}</p>
          <p style="margin:0; white-space:pre-wrap">${escapeHtml(m.body)}</p>
          ${m.attachmentUrl ? `<img src="${escapeHtml(m.attachmentUrl)}" style="max-width:100%; margin-top:8px; border-radius:10px">` : ''}
        </div>
      `).join('')}
      <div class="card">
        <textarea id="plat-support-reply-msg" rows="2" placeholder="Javob yozing..." style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid #d7e3f8; font-size:13px; font-family:inherit; resize:vertical"></textarea>
        <button class="primary" style="margin-top:8px" ${sendingSupportMessage ? 'disabled' : ''} onclick="sendSupportReply()">${sendingSupportMessage ? 'Yuborilmoqda...' : 'Javob yuborish'}</button>
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
    if (bugReportSent) {
      return `
        <div class="card plat-center">
          <div style="font-size:40px">✅</div>
          <h2 style="margin-top:8px">Xabaringiz yuborildi</h2>
          <p class="muted">UStorE jamoasi tez orada ko'rib chiqadi. Agar javob kerak bo'lsa, Telegram orqali bog'lanamiz.</p>
          <button class="secondary" onclick="bugReportSent=false; switchTab('help');">Yordamga qaytish</button>
        </div>
      `;
    }
    return `
      <div class="card">
        <label>Sarlavha</label>
        <input type="text" id="plat-bugreport-title" placeholder="Muammoni qisqa ta'riflang">
        <label>Qaysi bo'limda?</label>
        <select id="plat-bugreport-section">
          <option value="">Tanlanmagan</option>
          <option value="Obuna">Obuna</option>
          <option value="To'lov">To'lov</option>
          <option value="Do'kon">Do'kon</option>
          <option value="Boshqa">Boshqa</option>
        </select>
        <label>Tavsif</label>
        <textarea id="plat-bugreport-desc" rows="4" placeholder="Nima bo'lganini batafsil yozing..." style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid #d7e3f8; font-size:13px; font-family:inherit; resize:vertical"></textarea>
        <label>Skrinshot (ixtiyoriy)</label>
        <input type="file" id="plat-bugreport-input" accept="image/*" class="hidden" onchange="onBugReportAttachmentPicked(event)">
        <input type="file" id="plat-bugreport-input-files" class="hidden" onchange="onBugReportAttachmentPicked(event)">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
          <button class="secondary" style="flex:1; margin-top:0" onclick="document.getElementById('plat-bugreport-input').click()">🖼 Galereyadan tanlash</button>
          <button class="secondary" style="flex:1; margin-top:0" onclick="document.getElementById('plat-bugreport-input-files').click()">📁 Fayllardan tanlash</button>
        </div>
        ${bugReportAttachmentPreviewUrl ? `<img src="${bugReportAttachmentPreviewUrl}" class="plat-receipt-preview">` : ''}
        <button class="primary ${submittingBugReport ? 'plat-btn-dimmed' : ''}" style="margin-top:14px" onclick="submitBugReport()">${submittingBugReport ? '<span class="spinner"></span> Yuborilmoqda...' : 'Yuborish'}</button>
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
    const user = tg?.initDataUnsafe?.user || {};
    return `
      <div class="card plat-profile-card">
        ${user.photo_url ? `<img src="${escapeHtml(user.photo_url)}" class="plat-profile-photo">` : '<div class="plat-profile-photo plat-profile-photo-fallback">👤</div>'}
        <div>
          <b>${escapeHtml([user.first_name, user.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi')}</b>
          <p class="muted">${user.username ? '@' + escapeHtml(user.username) : `ID: ${escapeHtml(String(user.id || ''))}`}</p>
        </div>
      </div>
      <div class="card plat-profile-menu">
        ${isAdminMode ? `<div class="plat-profile-row plat-clickable" onclick="openAdminSupportPage()"><span>Support</span><span>›</span></div>` : ''}
        <div class="plat-profile-row"><span>UStorE haqida</span><span>›</span></div>
        <div class="plat-profile-row plat-clickable" onclick="openPrivacyPage()"><span>Maxfiylik siyosati</span><span>›</span></div>
        <div class="plat-profile-row plat-clickable" onclick="openTermsPage()"><span>Foydalanish shartlari</span><span>›</span></div>
      </div>
      ${isSuperAdmin ? `<button class="primary" onclick="toggleAdminRole()">${isAdminMode ? "👤 Foydalanuvchi rejimiga o'tish" : '🛡 Admin rejimiga o\'tish'}</button>` : ''}
    `;
  }

  // ======================================================================
  // ADMIN: Dashboard
  // ======================================================================
  async function loadDashboardSummary() {
    try { dashboardSummary = await callPlatformApi('platform_admin_dashboard_summary', {}); render(); }
    catch (e) { console.error(e); }
  }
  function renderAdminDashboardTab() {
    const s = dashboardSummary;
    if (!s) return '<p class="muted">Yuklanmoqda...</p>';
    return `
      <h1 class="plat-page-title">Dashboard</h1>
      <div class="plat-summary-grid">
        <div class="plat-summary-card-sm"><span>🏪</span><b>${s.activeShopsCount}</b><small>Faol do'konlar</small></div>
        <div class="plat-summary-card-sm"><span>📨</span><b>${s.newRequestsCount}</b><small>Yangi obuna so'rovlari</small></div>
        <div class="plat-summary-card-sm"><span>⏳</span><b>${s.expiringSoonCount}</b><small>Obunasi tugayotganlar</small></div>
        <div class="plat-summary-card-sm"><span>👤</span><b>${s.totalUsersCount}</b><small>Jami foydalanuvchilar</small></div>
      </div>
      ${s.newRequestsCount ? `<button class="primary" onclick="switchTab('requests')">📨 ${s.newRequestsCount} ta yangi so'rovni ko'rish</button>` : ''}
      ${(s.attentionItems || []).length ? `
        <div class="card">
          <h2>⚠️ Diqqat talab qiladi</h2>
          ${s.attentionItems.map((it) => `
            <div class="plat-mini-row plat-clickable" onclick="switchTab('${it.type === 'NEW_REQUEST' ? 'requests' : 'shops'}')">
              <span>${escapeHtml(it.label)}</span>
              <span class="muted">${escapeHtml(it.detail || '')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="card">
        <h2>So'nggi do'konlar</h2>
        ${(s.recentShops || []).map((sh) => `
          <div class="plat-mini-row"><span>${escapeHtml(sh.public_code)}</span><span class="status-pill status-${sh.status}">${statusLabel(sh.status)}</span></div>
        `).join('') || '<p class="muted">Hozircha do\'kon yo\'q.</p>'}
      </div>
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
  function renderAdminShopsTab() {
    return `
      <div class="plat-tab-head">
        <h1 class="plat-page-title">Do'konlar</h1>
        <button class="primary plat-small-btn" onclick="openPage('CONNECT_SHOP')">+ Yangi do'kon</button>
      </div>
      <div class="card">
        ${adminShops.length ? adminShops.map(renderAdminShopRow).join('') : '<p class="empty">Hozircha do\'kon ulanmagan.</p>'}
      </div>
    `;
  }
  function renderAdminShopRow(s) {
    const left = daysUntil(s.subscriptionExpiresAt);
    return `
      <div class="shop-row plat-clickable" onclick="openShopDetails('${s.id}')">
        <div>
          <div class="name">${escapeHtml(s.botName || s.botUsername || s.publicCode)}</div>
          <div class="meta">${s.botUsername ? '@' + escapeHtml(s.botUsername) : "bot yo'q"} · owner ${escapeHtml(s.ownerTelegramId || '-')}</div>
          <div class="meta">${escapeHtml(s.tariffName || 'Tarifsiz')}${left !== null ? ` · ${left <= 0 ? 'muddati o\'tgan' : left + ' kun qoldi'}` : ''}</div>
        </div>
        <span class="status-pill status-${s.status}">${statusLabel(s.status)}</span>
      </div>`;
  }
  function openShopDetails(shopId) {
    selectedShopDetails = adminShops.find((s) => s.id === shopId) || null;
    openPage('SHOP_DETAILS');
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
        <div class="plat-mini-row">
          <span>BILLZ</span>
          <button class="billz-toggle-btn status-pill ${s.billzAccessGranted ? 'status-ACTIVE' : ''}" onclick="toggleBillzAccess('${s.id}', ${!s.billzAccessGranted})">
            ${s.billzAccessGranted ? '✅ Ulangan' : '— Ruxsat berilmagan'}
          </button>
        </div>
        <div class="plat-mini-row">
          <span>CLICK</span>
          <button class="billz-toggle-btn status-pill ${s.clickAccessGranted ? 'status-ACTIVE' : ''}" onclick="toggleClickAccess('${s.id}', ${!s.clickAccessGranted})">
            ${s.clickAccessGranted ? '✅ Ruxsat berilgan' : '— Ruxsat berilmagan'}
          </button>
        </div>
        <div class="plat-mini-row">
          <span>PAYME</span>
          <button class="billz-toggle-btn status-pill ${s.paymeAccessGranted ? 'status-ACTIVE' : ''}" onclick="togglePaymeAccess('${s.id}', ${!s.paymeAccessGranted})">
            ${s.paymeAccessGranted ? '✅ Ruxsat berilgan' : '— Ruxsat berilmagan'}
          </button>
        </div>
        <div class="plat-mini-row">
          <span>UZUM</span>
          <button class="billz-toggle-btn status-pill ${s.uzumAccessGranted ? 'status-ACTIVE' : ''}" onclick="toggleUzumAccess('${s.id}', ${!s.uzumAccessGranted})">
            ${s.uzumAccessGranted ? '✅ Ruxsat berilgan' : '— Ruxsat berilmagan'}
          </button>
        </div>
      </div>
      ${renderLifecycleControlsCard(s)}
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
          <input type="text" id="plat-freeze-reason">
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
        <input type="text" id="plat-terminate-reason" value="${escapeHtml(terminateReasonDraft)}" oninput="terminateReasonDraft=this.value">
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
  // ADMIN: So'rovlar
  // ======================================================================
  async function loadRequests() {
    requestsLoading = true;
    try {
      const data = await callPlatformApi('platform_list_subscription_requests', { status: requestsFilter === 'ALL' ? undefined : requestsFilter });
      requests = data.requests || [];
    } catch (e) { console.error(e); }
    finally { requestsLoading = false; if (currentTab === 'requests') render(); }
  }
  function setRequestsFilter(f) { requestsFilter = f; loadRequests(); }
  function renderAdminRequestsTab() {
    return `
      <h1 class="plat-page-title">So'rovlar</h1>
      <div class="plat-filter-row">
        ${['NEW', 'APPROVED', 'REJECTED'].map((f) => `
          <button class="plat-filter-btn ${requestsFilter === f ? 'active' : ''}" onclick="setRequestsFilter('${f}')">${f === 'NEW' ? 'Yangi' : f === 'APPROVED' ? 'Tasdiqlangan' : 'Rad etilgan'}</button>
        `).join('')}
      </div>
      ${requestsLoading ? '<p class="muted">Yuklanmoqda...</p>' : (requests.length ? requests.map(renderRequestCard).join('') : '<p class="empty">Bu holatda so\'rov yo\'q.</p>')}
    `;
  }
  function renderRequestCard(r) {
    return `
      <div class="card">
        <div class="plat-shop-card-head">
          <b>${escapeHtml(r.requesterFirstName || r.requesterTelegramId)}</b>
          <span class="status-pill">${r.kind === 'NEW_SHOP' ? 'Yangi do\'kon' : 'Tarif oshirish'}</span>
        </div>
        <p class="muted">Tarif: ${escapeHtml(r.tariffName)} — ${money(r.tariffPrice)}</p>
        ${r.awaitingBotConnect ? '<div class="notice warn">Bot ulanishi kutilmoqda</div>' : ''}
        ${r.status === 'REJECTED' && r.rejectReason ? `<div class="notice error">Sabab: ${escapeHtml(r.rejectReason)}</div>` : ''}
        <div class="plat-request-actions">
          ${r.hasReceipt ? `<button class="secondary" onclick="viewReceipt('${r.id}')">Chekni ko'rish</button>` : ''}
          ${r.status === 'NEW' ? `
            <button class="primary" onclick="approveRequest('${r.id}')">✅ Tasdiqlash</button>
            <button class="secondary" onclick="openRejectPrompt('${r.id}')">❌ Rad etish</button>
          ` : ''}
        </div>
        ${rejectingRequestId === r.id ? `
          <div class="plat-reject-box">
            <input type="text" id="reject-reason-${r.id}" placeholder="Rad etish sababi">
            <button class="secondary" onclick="submitReject('${r.id}')">Yuborish</button>
          </div>` : ''}
      </div>`;
  }
  async function viewReceipt(requestId) {
    try {
      const data = await callPlatformApi('platform_get_subscription_receipt_url', { requestId });
      if (tg?.openLink) tg.openLink(data.url); else window.open(data.url, '_blank');
    } catch (e) { alert(e.message || String(e)); }
  }
  async function approveRequest(requestId) {
    if (!confirm("So'rovni tasdiqlaysizmi?")) return;
    try { await callPlatformApi('platform_approve_subscription_request', { requestId }); await loadRequests(); loadDashboardSummary(); }
    catch (e) { alert(e.message || String(e)); }
  }
  function openRejectPrompt(requestId) { rejectingRequestId = requestId; render(); }
  async function submitReject(requestId) {
    const input = document.getElementById(`reject-reason-${requestId}`);
    const reason = (input?.value || '').trim();
    if (!reason) return alert('Sababni kiriting.');
    try { await callPlatformApi('platform_reject_subscription_request', { requestId, reason }); rejectingRequestId = null; await loadRequests(); }
    catch (e) { alert(e.message || String(e)); }
  }

  // ======================================================================
  // ADMIN: Tariflar CRUD (+ to'lov karta ma'lumoti shu yerda)
  // ======================================================================
  async function loadAdminTariffs() {
    try {
      const [tData, pData] = await Promise.all([
        callPlatformApi('platform_admin_list_tariffs', {}),
        callPlatformApi('platform_get_payment_info', {}),
      ]);
      adminTariffs = tData.tariffs || [];
      if (!paymentInfoDraft) paymentInfoDraft = { cardNumber: pData.cardNumber || '', cardHolder: pData.cardHolder || '' };
      if (currentTab === 'tariffs') render();
    } catch (e) { console.error(e); }
  }
  function renderAdminTariffsTab() {
    return `
      <div class="plat-tab-head">
        <h1 class="plat-page-title">Tariflar</h1>
        <button class="primary plat-small-btn" onclick="openNewTariffDraft()">+ Yangi</button>
      </div>
      ${tariffDraft ? renderTariffDraftForm() : ''}
      ${adminTariffs.map(renderAdminTariffRow).join('') || '<p class="empty">Hozircha tarif yo\'q.</p>'}
      <div class="card">
        <h2>To'lov karta ma'lumoti</h2>
        <label for="pi-card-number">Karta raqami</label>
        <input type="text" id="pi-card-number" value="${escapeHtml(paymentInfoDraft?.cardNumber || '')}" placeholder="8600 0000 0000 0000">
        <label for="pi-card-holder">Karta egasi</label>
        <input type="text" id="pi-card-holder" value="${escapeHtml(paymentInfoDraft?.cardHolder || '')}" placeholder="F. I. Sh.">
        <button class="secondary" onclick="savePaymentInfo()">Saqlash</button>
      </div>
    `;
  }
  function renderAdminTariffRow(t) {
    return `
      <div class="card plat-tariff-row">
        <div>
          <b>${escapeHtml(t.name)}</b> ${t.isPopular ? '<span class="plat-tariff-badge-sm">Ommabop</span>' : ''} ${!t.isActive ? '<span class="muted">(o\'chirilgan)</span>' : ''}
          <p class="muted">${money(t.price)}/oy · ${limitLabel(t.productLimit)}</p>
        </div>
        <button class="secondary plat-small-btn" onclick="openEditTariffDraft('${t.id}')">Tahrirlash</button>
      </div>`;
  }
  function openNewTariffDraft() { tariffDraft = { id: null, name: '', price: '', productLimit: '', isActive: true, isPopular: false }; render(); }
  function openEditTariffDraft(id) {
    const t = adminTariffs.find((x) => x.id === id);
    if (!t) return;
    tariffDraft = { id: t.id, name: t.name, price: t.price, productLimit: t.productLimit === null ? '' : t.productLimit, isActive: t.isActive, isPopular: t.isPopular };
    render();
  }
  function renderTariffDraftForm() {
    const d = tariffDraft;
    return `
      <div class="card">
        <h2>${d.id ? 'Tarifni tahrirlash' : 'Yangi tarif'}</h2>
        <label for="td-name">Nomi</label>
        <input type="text" id="td-name" value="${escapeHtml(d.name)}">
        <label for="td-price">Narxi (so'm/oy)</label>
        <input type="text" id="td-price" inputmode="numeric" value="${escapeHtml(String(d.price))}">
        <label for="td-limit">Mahsulot limiti (bo'sh = cheksiz)</label>
        <input type="text" id="td-limit" inputmode="numeric" value="${escapeHtml(String(d.productLimit))}">
        <label class="plat-checkbox-row"><input type="checkbox" id="td-active" ${d.isActive ? 'checked' : ''}> Faol</label>
        <label class="plat-checkbox-row"><input type="checkbox" id="td-popular" ${d.isPopular ? 'checked' : ''}> "Ommabop" belgisi</label>
        <button class="primary" onclick="saveTariffDraft()">Saqlash</button>
        <button class="secondary" onclick="cancelTariffDraft()">Bekor qilish</button>
      </div>
    `;
  }
  function cancelTariffDraft() { tariffDraft = null; render(); }
  async function saveTariffDraft() {
    const name = document.getElementById('td-name').value.trim();
    const price = Number(document.getElementById('td-price').value);
    const limitRaw = document.getElementById('td-limit').value.trim();
    const productLimit = limitRaw ? Number(limitRaw) : null;
    const isActive = document.getElementById('td-active').checked;
    const isPopular = document.getElementById('td-popular').checked;
    try {
      await callPlatformApi('platform_upsert_tariff', { id: tariffDraft.id || undefined, name, price, productLimit, isActive, isPopular });
      tariffDraft = null;
      await loadAdminTariffs();
    } catch (e) { alert(e.message || String(e)); }
  }
  async function savePaymentInfo() {
    const cardNumber = document.getElementById('pi-card-number').value;
    const cardHolder = document.getElementById('pi-card-holder').value;
    try {
      await callPlatformApi('platform_set_payment_info', { cardNumber, cardHolder });
      paymentInfoDraft = { cardNumber, cardHolder };
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
  window.chooseNewShop = chooseNewShop;
  window.chooseUpgrade = chooseUpgrade;
  window.pickUpgradeShop = pickUpgradeShop;
  window.copyPlatformCardNumber = copyPlatformCardNumber;
  window.onReceiptPicked = onReceiptPicked;
  window.submitSubscriptionRequest = submitSubscriptionRequest;
  window.startUpgradeFor = startUpgradeFor;
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
  window.viewReceipt = viewReceipt;
  window.approveRequest = approveRequest;
  window.openRejectPrompt = openRejectPrompt;
  window.submitReject = submitReject;
  window.openNewTariffDraft = openNewTariffDraft;
  window.openEditTariffDraft = openEditTariffDraft;
  window.saveTariffDraft = saveTariffDraft;
  window.cancelTariffDraft = cancelTariffDraft;
  window.savePaymentInfo = savePaymentInfo;
})();
