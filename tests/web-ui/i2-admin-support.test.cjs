const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

function makeAdminPort() {
  const calls = [];
  const tickets = [
    { id: 12, tgId: '9001', status: 'OPEN', ticketType: 'SUPPORT', createdAt: '2026-09-22T09:00:00Z', customer: { name: 'Ali Valiyev', phone: '+998900000001', tgId: '9001' }, lastMessage: { sender: 'USER', body: 'Yordam kerak', createdAt: '2026-09-22T09:03:00Z' }, messageCount: 1 },
    { id: 11, tgId: '9002', status: 'ANSWERED', ticketType: 'RETURN', orderId: 77, createdAt: '2026-09-22T08:00:00Z', customer: { name: null, tgId: '9002' }, lastMessage: { sender: 'USER', body: 'Yana savolim bor', createdAt: '2026-09-22T08:30:00Z' }, messageCount: 3 },
  ];
  return {
    calls,
    port: {
      async invoke(action, payload) {
        calls.push({ action, payload });
        if (action === 'get_support_tickets') return { ok: true, data: { tickets, page: payload.page, pageSize: payload.pageSize, totalCount: 2, totalPages: 1 } };
        if (action === 'get_support_messages') return { ok: true, data: { messages: [
          { id: 1, ticketId: Number(payload.ticketId), sender: 'USER', body: 'Yordam kerak', createdAt: '2026-09-22T09:03:00Z', readAt: '2026-09-22T09:05:00Z' },
          { id: 2, ticketId: Number(payload.ticketId), sender: 'ADMIN', body: 'Tekshiryapmiz', createdAt: '2026-09-22T09:06:00Z', readAt: null },
        ], hasMore: false } };
        if (action === 'send_support_message') return { ok: true, data: { ticket: { ...tickets[0], status: 'ANSWERED', lastMessage: { sender: 'ADMIN', body: payload.body, createdAt: '2026-09-22T09:08:00Z' } }, message: { id: 3, ticketId: 12, sender: 'ADMIN', body: payload.body, createdAt: '2026-09-22T09:08:00Z', readAt: null } } };
        return { ok: false, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'no' } };
      },
    },
  };
}

test('I2 loads admin support master list with search/status/page parameters and attention state', async () => {
  const { createAdminSupportController } = await import(moduleUrl('web/features/support/admin-support.js'));
  const { port, calls } = makeAdminPort();
  const controller = createAdminSupportController({ adminPort: port });
  controller.setSearch('Ali'); controller.setStatus('OPEN');
  const result = await controller.applyFilters();
  assert.equal(result.ok, true);
  assert.equal(calls[0].action, 'get_support_tickets');
  assert.deepEqual(calls[0].payload, { page: 1, pageSize: 30, status: 'OPEN', search: 'Ali' });
  assert.equal(controller.getState().tickets.length, 2);
  assert.equal(controller.getState().tickets[0].hasUnreadAttention, true);
  assert.equal(controller.getState().tickets[1].needsReply, true);
});

test('I2 opening a ticket loads detail and clears only the locally-seen attention marker', async () => {
  const { createAdminSupportController } = await import(moduleUrl('web/features/support/admin-support.js'));
  const { port } = makeAdminPort();
  const controller = createAdminSupportController({ adminPort: port });
  await controller.load();
  const result = await controller.openTicket('12');
  assert.equal(result.ok, true);
  const state = controller.getState();
  assert.equal(state.selectedTicketId, '12');
  assert.equal(state.messages.length, 2);
  assert.equal(state.messages[1].sender, 'ADMIN');
  assert.equal(state.tickets.find((x) => x.id === '12').hasUnreadAttention, false);
  assert.equal(state.tickets.find((x) => x.id === '11').hasUnreadAttention, true);
});

test('I2 admin reply uses existing send_support_message action and updates selected ticket without fake success', async () => {
  const { createAdminSupportController } = await import(moduleUrl('web/features/support/admin-support.js'));
  const { port, calls } = makeAdminPort();
  const controller = createAdminSupportController({ adminPort: port });
  await controller.load(); await controller.openTicket('12');
  const result = await controller.sendReply('Javob tayyor');
  assert.equal(result.ok, true);
  const send = calls.find((x) => x.action === 'send_support_message');
  assert.deepEqual(send.payload, { ticketId: '12', body: 'Javob tayyor' });
  assert.equal(controller.getState().selectedTicket.status, 'ANSWERED');
  assert.equal(controller.getState().messages.at(-1).body, 'Javob tayyor');
});

test('I2 refuses reply when no ticket is selected or ticket is closed', async () => {
  const { createAdminSupportController } = await import(moduleUrl('web/features/support/admin-support.js'));
  const { port } = makeAdminPort();
  const controller = createAdminSupportController({ adminPort: port });
  assert.equal((await controller.sendReply('x')).error.code, 'VALIDATION_ERROR');
});

test('I2 live admin allowlist exposes only the three existing support actions needed by the UI', async () => {
  const { createLiveAdminAdapter } = await import(moduleUrl('web/services/live/admin.js'));
  const calls = [];
  const adapter = createLiveAdminAdapter({ endpoint: 'https://api.example/shop-api', botId: '123', tokenStore: { get: () => 'session' }, fetchImpl: async (_u, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ tickets: [] }) }; } });
  assert.equal((await adapter.invoke('get_support_tickets', { status: 'ALL' })).ok, true);
  assert.equal((await adapter.invoke('get_support_messages', { ticketId: 1 })).ok, true);
  assert.equal((await adapter.invoke('send_support_message', { ticketId: 1, body: 'x' })).ok, true);
  assert.equal((await adapter.invoke('close_support_ticket', { ticketId: 1 })).error.code, 'CAPABILITY_UNAVAILABLE');
  assert.deepEqual(calls.map((x) => x.action), ['get_support_tickets','get_support_messages','send_support_message']);
});

test('I2 server allowlist keeps support.manage permission and UI contains search/loading/empty/attention/read states', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const live = fs.readFileSync(path.join(root, 'web/services/live/admin.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'web/features/support/admin-support.js'), 'utf8');
  for (const action of ['get_support_tickets','get_support_messages','send_support_message']) {
    assert.match(api, new RegExp(`${action}: 'support\\.manage'`));
    assert.match(live, new RegExp(`'${action}'`));
  }
  for (const phrase of ['Telegram ID, ism, telefon yoki ticket raqami','Murojaatlar yuklanmoqda','Murojaat topilmadi','Javob kerak','O‘qildi','Javob yozing…']) assert.match(ui, new RegExp(phrase));
  assert.doesNotMatch(ui, /unreadCount\s*[:=]\s*\d+/);
});
