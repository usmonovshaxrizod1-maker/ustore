// USTORE Platform Mini App — connects new shops to the platform.
// 6-band: deliberately separate global state/localStorage namespace from
// the shop Mini App (ustore-shop-app.js) — nothing here uses scopedKey()
// or touches `ustore:<botId>:...` keys, and this page never even reads a
// ?bot_id= URL param (it doesn't need one — this app authenticates as the
// PLATFORM bot, not any shop's bot).
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

  const state = {
    loading: true,
    accessDenied: false,
    shops: [],
    view: 'list', // 'list' | 'connect'
    verifyResult: null, // { telegramBotId, username, name, alreadyConnected, retryable }
    verifying: false,
    connecting: false,
    error: null,
    connectSuccess: null,
  };

  // 7-band: the bot token lives ONLY in this closure variable — never in
  // `state` (which would be easy to accidentally log/serialize), never in
  // localStorage/sessionStorage. Cleared immediately once no longer needed.
  let pendingBotToken = '';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function statusLabel(s) {
    if (s === 'ACTIVE') return 'Faol';
    if (s === 'PROVISIONING') return 'Sozlanmoqda';
    return 'O\'chirilgan';
  }

  function render() {
    const app = document.getElementById('app');
    if (state.accessDenied) {
      app.innerHTML = `
        <div class="wrap">
          <header class="top"><h1>UStorE</h1></header>
          <div class="card"><p class="notice error">⛔ Bu panel faqat platforma administratori uchun.</p></div>
        </div>`;
      return;
    }
    if (state.loading) {
      app.innerHTML = `<div class="wrap"><header class="top"><h1>UStorE</h1></header><p class="muted">Yuklanmoqda...</p></div>`;
      return;
    }

    if (state.view === 'connect') {
      app.innerHTML = renderConnectView();
      wireConnectView();
      return;
    }

    app.innerHTML = `
      <div class="wrap">
        <header class="top">
          <h1>UStorE</h1>
          <span class="badge">${state.shops.length} do'kon</span>
        </header>
        <div class="card">
          <h2>Ulangan do'konlar</h2>
          ${state.shops.length ? state.shops.map(renderShopRow).join('') : '<p class="empty">Hozircha do\'kon ulanmagan.</p>'}
        </div>
        <button class="primary" id="btn-new-shop">+ Yangi do'kon ulash</button>
      </div>`;
    document.getElementById('btn-new-shop').onclick = () => { state.view = 'connect'; state.verifyResult = null; state.error = null; state.connectSuccess = null; render(); };
    Array.prototype.forEach.call(document.querySelectorAll('.billz-toggle-btn'), (btn) => {
      btn.onclick = () => toggleBillzAccess(btn.dataset.shopId, btn.dataset.enabled !== 'true');
    });
  }

  // Billz (billz.ai) integratsiyasi — boshqarilgan/beta chiqarilish: faqat
  // bosh admin (shu Mini App) qaysi do'konlarga ruxsat berganini belgilaydi.
  async function toggleBillzAccess(shopId, enable) {
    try {
      await callPlatformApi('platform_set_billz_access', { shopId, enabled: enable });
      await reloadShops();
      render();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function renderShopRow(s) {
    return `
      <div class="shop-row">
        <div>
          <div class="name">${escapeHtml(s.botName || s.botUsername || s.publicCode)}</div>
          <div class="meta">${s.botUsername ? '@' + escapeHtml(s.botUsername) : 'bot yo\'q'} · owner ${escapeHtml(s.ownerTelegramId || '-')}</div>
        </div>
        <div class="pill-group">
          <span class="status-pill status-${s.status}">${statusLabel(s.status)}</span>
          <button class="billz-toggle-btn status-pill ${s.billzAccessGranted ? 'status-ACTIVE' : ''}" data-shop-id="${escapeHtml(s.id)}" data-enabled="${s.billzAccessGranted ? 'true' : 'false'}">
            Billz ${s.billzAccessGranted ? '✓' : '—'}
          </button>
        </div>
      </div>`;
  }

  function renderConnectView() {
    const v = state.verifyResult;
    return `
      <div class="wrap">
        <header class="top"><h1>Yangi do'kon ulash</h1></header>

        <div class="card">
          <h2>1. Bot token</h2>
          <label for="f-token">Telegram bot token</label>
          <input type="password" id="f-token" autocomplete="off" placeholder="123456789:AA..." value="">
          <button class="primary" id="btn-verify" ${state.verifying ? 'disabled' : ''}>
            ${state.verifying ? '<span class="spinner"></span> Tekshirilmoqda...' : 'Tekshirish'}
          </button>
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
          <button class="primary" id="btn-connect" ${state.connecting ? 'disabled' : ''}>
            ${state.connecting ? '<span class="spinner"></span> Ulanmoqda...' : 'Ulash'}
          </button>
        </div>` : ''}

        ${state.error ? `<div class="notice error">${escapeHtml(state.error)}</div>` : ''}
        ${state.connectSuccess ? `<div class="notice success">✓ Do'kon ulandi (holat: ${escapeHtml(state.connectSuccess.status)}).</div>` : ''}

        <button class="secondary" id="btn-back">← Ro'yxatga qaytish</button>
      </div>`;
  }

  function wireConnectView() {
    const tokenInput = document.getElementById('f-token');
    document.getElementById('btn-verify').onclick = async () => {
      const token = (tokenInput.value || '').trim();
      if (!token) return;
      state.error = null;
      state.verifying = true;
      render();
      try {
        const result = await callPlatformApi('platform_verify_bot', { botToken: token });
        pendingBotToken = token; // held only until connect (or cancel) below
        state.verifyResult = result;
      } catch (e) {
        state.error = e.message || String(e);
        pendingBotToken = '';
      } finally {
        state.verifying = false;
        render();
      }
    };

    const ownerInput = document.getElementById('f-owner');
    const connectBtn = document.getElementById('btn-connect');
    if (connectBtn) {
      connectBtn.onclick = async () => {
        const ownerId = (ownerInput.value || '').trim();
        if (!/^\d{5,15}$/.test(ownerId)) { state.error = 'OWNER Telegram ID noto\'g\'ri.'; render(); return; }
        if (!pendingBotToken) { state.error = 'Token yo\'qoldi, qaytadan tekshiring.'; render(); return; }
        state.error = null;
        state.connecting = true;
        render();
        try {
          const result = await callPlatformApi('platform_connect_bot', { botToken: pendingBotToken, ownerTelegramId: ownerId });
          state.connectSuccess = result;
          if (result.error === 'telegram_config_failed_retry_available') {
            state.error = 'Do\'kon yaratildi, lekin Telegram sozlamalari (menu/webhook) muvaffaqiyatsiz bo\'ldi. "Tekshirish" tugmasini bosib qayta urining.';
          } else {
            await reloadShops();
          }
        } catch (e) {
          state.error = e.message || String(e);
        } finally {
          pendingBotToken = ''; // 7-band: cleared immediately, success or failure
          state.connecting = false;
          render();
        }
      };
    }

    document.getElementById('btn-back').onclick = () => {
      pendingBotToken = '';
      state.view = 'list';
      state.verifyResult = null;
      state.error = null;
      render();
    };
  }

  async function reloadShops() {
    const data = await callPlatformApi('platform_list_shops', {});
    state.shops = data.shops || [];
  }

  async function boot() {
    if (!tg || !tg.initData) {
      document.getElementById('app').innerHTML = `
        <div class="wrap"><header class="top"><h1>UStorE</h1></header>
        <p class="notice error">⚠️ Bu panel faqat Telegram bot orqali ishlaydi.</p></div>`;
      return;
    }
    try {
      await reloadShops();
    } catch (e) {
      if (String(e.message || '').startsWith('forbidden:') || String(e.message || '').startsWith('auth_failed:')) {
        state.accessDenied = true;
      } else {
        state.error = e.message || String(e);
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  boot();
})();
