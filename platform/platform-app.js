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
  function money(v) { return `${Number(v || 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`; }
  function statusLabel(s) {
    if (s === 'ACTIVE') return 'Faol';
    if (s === 'PROVISIONING') return 'Sozlanmoqda';
    return "O'chirilgan";
  }
  function limitLabel(limit) { return (limit === null || limit === undefined) ? 'Cheksiz' : `${limit} tagacha`; }
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
  let currentTab = 'home'; // user: home|shops|subscription|help|profile ; admin: dashboard|shops|requests|tariffs|profile
  let activePage = null;

  // Obuna sotib olish oqimi (mijoz tarafi)
  let flowKind = null;        // 'NEW_SHOP' | 'UPGRADE'
  let flowTariffId = null;
  let flowShopId = null;      // UPGRADE uchun
  let paymentInfo = null;     // { cardNumber, cardHolder }
  let receiptFile = null;
  let receiptPreviewUrl = null;
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

  // Admin: to'lov ma'lumoti tahrirlash (Tariflar bo'limi ichida kichik bo'lim)
  let paymentInfoDraft = null;

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
          <button class="plat-page-header-btn" onclick="${backAction}" aria-label="Orqaga">←</button>
          <div class="plat-page-header-title">${escapeHtml(title)}</div>
          <button class="plat-page-header-btn" onclick="goHomePage()" aria-label="Bosh sahifa">⌂</button>
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
    const label = isAdminMode ? "👤 Foydalanuvchi rejimiga o'tish" : '🛡 Admin rejimiga o\'tish';
    popover.innerHTML = `<button class="plat-role-popover-btn" onclick="document.getElementById('plat-role-popover').classList.add('hidden'); toggleAdminRole();">${label}</button>`;
    popover.classList.remove('hidden');
  }
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('plat-role-popover');
    if (!popover || popover.classList.contains('hidden')) return;
    if (e.target.closest('#plat-role-popover') || e.target.closest('#plat-person-btn')) return;
    popover.classList.add('hidden');
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

    const showLanding = !isAdminMode && myShops.length === 0 && currentTab === 'home';
    const body = showLanding ? renderLandingHero() : renderTabBody();
    app.innerHTML = `${renderChrome(body)}`;
  }

  function renderChrome(bodyHtml) {
    return `
      <div class="plat-header">
        <div class="plat-header-title">${isAdminMode ? 'UStorE Admin' : 'UStorE'}</div>
        <button id="plat-person-btn" class="plat-header-btn" onclick="togglePersonMenu(event)" aria-label="Profil">👤</button>
      </div>
      <div id="plat-role-popover" class="hidden plat-role-popover"></div>
      <div class="plat-content">${bodyHtml}</div>
      ${activePage ? '' : renderBottomNav()}
    `;
  }

  function renderBottomNav() {
    const userTabs = [
      ['home', '🏠', 'Bosh sahifa'], ['shops', '🏪', "Do'konlarim"], ['subscription', '💎', 'Obuna'],
      ['help', '💬', 'Yordam'], ['profile', '👤', 'Profil'],
    ];
    const adminTabs = [
      ['dashboard', '📊', 'Dashboard'], ['shops', '🏪', "Do'konlar"], ['requests', '📨', "So'rovlar"],
      ['tariffs', '💎', 'Tariflar'], ['profile', '👤', 'Profil'],
    ];
    const tabs = isAdminMode ? adminTabs : userTabs;
    return `
      <nav class="plat-bottom-nav">
        ${tabs.map(([id, icon, label]) => `
          <button class="plat-nav-btn ${currentTab === id ? 'active' : ''}" onclick="switchTab('${id}')">
            <span class="plat-nav-icon">${icon}</span>
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
    if (currentTab === 'home') return renderUserHomeTab();
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
    return '';
  }

  // ======================================================================
  // LANDING (yangi tashrif buyuruvchi, hali do'koni yo'q)
  // ======================================================================
  function renderLandingHero() {
    const features = [
      ['🛍', 'Onlayn do\'kon', 'Telegram ichida tayyor e-do\'kon'],
      ['📦', 'Ombor nazorati', 'Qoldiq, kam qolgan va tugagan mahsulotlar'],
      ['🚚', 'Yetkazib berish', 'Pochta, taksi, uyga yetkazish'],
      ['💳', "To'lov", 'Naqd, karta va QR'],
    ];
    return `
      <div class="plat-hero">
        <h1 class="plat-hero-title">UStorE</h1>
        <p class="plat-hero-sub">Telegram ichida o'z onlayn do'koningizni yarating</p>
        <p class="plat-hero-desc">Mahsulot, ombor, buyurtma, to'lov va yetkazib berishni bitta tizimdan boshqaring.</p>
        <button class="primary" onclick="openPage('TARIFFS')">Do'kon ochish</button>
        <button class="secondary" onclick="document.getElementById('plat-features').scrollIntoView({behavior:'smooth'})">Imkoniyatlarni ko'rish</button>
      </div>
      <div id="plat-features" class="plat-feature-grid">
        ${features.map(([icon, title, desc]) => `
          <div class="plat-feature-card">
            <div class="plat-feature-icon">${icon}</div>
            <div class="plat-feature-title">${title}</div>
            <div class="plat-feature-desc">${desc}</div>
          </div>
        `).join('')}
      </div>
      <div class="card">
        <h2>Sizga mos tarifni tanlang</h2>
        ${renderTariffCards(false)}
      </div>
    `;
  }

  function renderTariffCards(compact) {
    if (!tariffs.length) return '<p class="empty">Hozircha tarif mavjud emas.</p>';
    return `<div class="plat-tariff-grid">${tariffs.map((t) => `
      <button class="plat-tariff-card ${flowTariffId === t.id ? 'selected' : ''}" onclick="selectTariffAndContinue('${t.id}')">
        ${t.isPopular ? '<span class="plat-tariff-badge">Ommabop</span>' : ''}
        <div class="plat-tariff-name">${escapeHtml(t.name)}</div>
        <div class="plat-tariff-limit">${limitLabel(t.productLimit)}</div>
        <div class="plat-tariff-price">${money(t.price)}<span>/oy</span></div>
      </button>
    `).join('')}</div>`;
  }

  function renderTariffListBody() {
    return `<p class="muted">Sizga mos tarifni tanlang:</p>${renderTariffCards(true)}`;
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
    openPage('PAYMENT');
  }
  function chooseUpgrade() {
    flowKind = 'UPGRADE';
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
        <button class="secondary" onclick="document.getElementById('plat-receipt-input').click()">📷 Chek yuklash</button>
        ${receiptPreviewUrl ? `<img src="${receiptPreviewUrl}" class="plat-receipt-preview">` : ''}
        ${connectError ? `<div class="notice error">${escapeHtml(connectError)}</div>` : ''}
        <button class="primary" ${(!receiptFile || submittingRequest) ? 'disabled' : ''} onclick="submitSubscriptionRequest()">
          ${submittingRequest ? '<span class="spinner"></span> Yuborilmoqda...' : "So'rov yuborish"}
        </button>
      </div>
    `;
  }
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
    if (!receiptFile || submittingRequest) return;
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
        <div class="status-pill" style="background:#78350f;color:#fcd34d">🟡 Tekshirilmoqda</div>
        <button class="primary" style="margin-top:16px" onclick="goHomePage()">Bosh sahifaga qaytish</button>
      </div>`;
  }

  // ======================================================================
  // ODDIY FOYDALANUVCHI: Bosh sahifa (do'koni bor bo'lsa), Do'konlarim, Obuna, Yordam, Profil
  // ======================================================================
  function renderUserHomeTab() {
    if (!myShops.length) return renderLandingHero();
    return `
      <h1 class="plat-page-title">Xush kelibsiz 👋</h1>
      <div class="plat-summary-grid">
        <div class="plat-summary-card-sm"><span>🏪</span><b>${myShops.length}</b><small>Do'konlarim</small></div>
        <div class="plat-summary-card-sm"><span>💎</span><b>${myShops[0]?.tariffName || '—'}</b><small>Tarif</small></div>
      </div>
      <button class="primary" onclick="switchTab('shops')">Do'konlarim →</button>
      <button class="secondary" onclick="openPage('TARIFFS')">+ Yangi do'kon ochish</button>
    `;
  }

  function renderMyShopsTab() {
    if (!myShops.length) return '<p class="empty">Sizda hozircha do\'kon yo\'q.</p><button class="primary" onclick="openPage(\'TARIFFS\')">Do\'kon ochish</button>';
    return `<div class="plat-shop-card-list">${myShops.map((s) => {
      const left = daysUntil(s.subscriptionExpiresAt);
      const warn = left !== null && left <= 7;
      return `
        <div class="card">
          <div class="plat-shop-card-head">
            <b>${escapeHtml(s.botUsername ? '@' + s.botUsername : s.publicCode)}</b>
            <span class="status-pill status-${s.status}">${statusLabel(s.status)}</span>
          </div>
          <p class="muted">Tarif: ${escapeHtml(s.tariffName || 'Tarifsiz')} · ${limitLabel(s.productLimit)} (${s.usedProductCount} ishlatilgan)</p>
          ${s.subscriptionExpiresAt ? `<p class="muted">Obuna tugaydi: ${formatDate(s.subscriptionExpiresAt)}</p>` : ''}
          ${warn ? `<div class="notice warn">⚠️ Obunangiz ${left <= 0 ? 'tugagan' : `${left} kundan keyin tugaydi`}.</div>` : ''}
          <div class="plat-shop-card-actions">
            ${s.botUsername ? `<a class="plat-link-btn" href="https://t.me/${escapeHtml(s.botUsername)}" target="_blank" rel="noopener">Do'konni ochish</a>` : ''}
            <button class="secondary" onclick="switchTab('subscription')">Obunani boshqarish</button>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  function renderSubscriptionTab() {
    if (!myShops.length) {
      return `<p class="muted">Sizda hali do'kon yo'q — obuna sotib olish uchun avval tarif tanlang.</p><button class="primary" onclick="openPage('TARIFFS')">Tarif tanlash</button>`;
    }
    return `<div class="plat-shop-card-list">${myShops.map((s) => {
      const pct = s.productLimit ? Math.min(100, Math.round((s.usedProductCount / s.productLimit) * 100)) : 0;
      return `
        <div class="card">
          <b>${escapeHtml(s.botUsername ? '@' + s.botUsername : s.publicCode)}</b>
          <p class="plat-plan-name">${escapeHtml(s.tariffName || 'Tarifsiz')}</p>
          ${s.productLimit ? `
            <div class="plat-progress"><div class="plat-progress-fill" style="width:${pct}%"></div></div>
            <p class="muted">${s.usedProductCount} / ${s.productLimit} mahsulot</p>
          ` : `<p class="muted">${s.usedProductCount} mahsulot · Cheksiz</p>`}
          ${s.subscriptionExpiresAt ? `<p class="muted">Tugash sanasi: ${formatDate(s.subscriptionExpiresAt)}</p>` : ''}
          <button class="primary" onclick="startUpgradeFor('${s.id}')">Tarifni o'zgartirish</button>
        </div>`;
    }).join('')}</div>`;
  }
  function startUpgradeFor(shopId) {
    flowKind = 'UPGRADE';
    flowShopId = shopId;
    flowTariffId = null;
    openPage('TARIFFS');
  }

  function renderHelpTab() {
    const cards = [
      ["📖", "UStorE'dan foydalanish", null],
      ['💳', "To'lov va obuna", null],
      ['🏪', "Do'kon sozlash", null],
      ['💬', 'Support bilan yozish', null],
      ['⚠️', 'Muammo haqida xabar berish', null],
    ];
    return `<div class="plat-help-list">${cards.map(([icon, title]) => `
      <div class="card plat-help-row"><span>${icon}</span><b>${title}</b></div>
    `).join('')}</div>`;
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
        <div class="plat-profile-row"><span>UStorE haqida</span><span>›</span></div>
        <div class="plat-profile-row"><span>Maxfiylik va shartlar</span><span>›</span></div>
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
        <div class="plat-summary-card-sm"><span>📨</span><b>${s.newRequestsCount}</b><small>Yangi so'rovlar</small></div>
        <div class="plat-summary-card-sm"><span>⏳</span><b>${s.expiringSoonCount}</b><small>Obunasi tugayotgan</small></div>
        <div class="plat-summary-card-sm"><span>👤</span><b>${s.totalUsersCount}</b><small>Jami foydalanuvchi</small></div>
      </div>
      ${s.newRequestsCount ? `<button class="primary" onclick="switchTab('requests')">📨 ${s.newRequestsCount} ta yangi so'rovni ko'rish</button>` : ''}
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
      <div class="card">
        <h2>Integratsiyalar</h2>
        <div class="plat-mini-row">
          <span>BILLZ</span>
          <button class="billz-toggle-btn status-pill ${s.billzAccessGranted ? 'status-ACTIVE' : ''}" onclick="toggleBillzAccess('${s.id}', ${!s.billzAccessGranted})">
            ${s.billzAccessGranted ? '✅ Ulangan' : '— Ruxsat berilmagan'}
          </button>
        </div>
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
    } catch (e) { alert(e.message || String(e)); }
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
  window.toggleAdminRole = toggleAdminRole;
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
  window.toggleBillzAccess = toggleBillzAccess;
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
