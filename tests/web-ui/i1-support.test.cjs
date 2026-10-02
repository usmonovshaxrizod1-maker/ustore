const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('I1 controller normalizes live support ticket/message shapes without exposing backend-only field names to UI', async () => {
  const { createSupportController } = await import(moduleUrl('web/features/support/support.js'));
  const port = {
    listThreads: async () => ({ ok: true, data: { items: [{ id: 42, ticketType: 'RETURN', createdAt: '2026-09-22T10:00:00Z' }] } }),
    getMessages: async () => ({ ok: true, data: { items: [{ id: 7, ticketId: 42, sender: 'USER', body: 'Salom', createdAt: '2026-09-22T10:01:00Z' }] } }),
    sendMessage: async () => ({ ok: true, data: {} }),
    uploadAttachment: async () => ({ ok: true, data: { attachment: {} } }),
  };
  const controller = createSupportController({ supportPort: port });
  assert.equal((await controller.loadThreads()).ok, true);
  assert.equal(controller.getState().threads[0].subject, 'Qaytarish / muammo');
  assert.equal((await controller.openThread('42')).ok, true);
  const message = controller.getState().messages[0];
  assert.equal(message.threadId, '42');
  assert.equal(message.sender, 'CUSTOMER');
  assert.equal(message.text, 'Salom');
});

test('I1 send creates one optimistic PENDING message and marks it SENT with stable clientMessageId', async () => {
  const { createSupportController } = await import(moduleUrl('web/features/support/support.js'));
  const calls = [];
  const port = {
    listThreads: async () => ({ ok: true, data: { items: [] } }),
    getMessages: async () => ({ ok: true, data: { items: [] } }),
    uploadAttachment: async () => ({ ok: true, data: { attachment: null } }),
    sendMessage: async (input) => { calls.push(input); return { ok: true, data: { id: 'srv-1', ticketId: 55, sender: 'USER', body: input.text, createdAt: '2026-09-22T10:03:00Z' } }; },
  };
  const controller = createSupportController({ supportPort: port, createClientMessageId: () => 'client-fixed', now: () => '2026-09-22T10:02:00Z' });
  const seen = [];
  controller.subscribe((state) => { const row = state.messages.find((item) => item.clientMessageId === 'client-fixed'); if (row) seen.push(row.status); });
  const result = await controller.send({ text: 'Yordam kerak' });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].clientMessageId, 'client-fixed');
  assert.equal(controller.getState().messages.length, 1);
  assert.equal(controller.getState().messages[0].status, 'SENT');
  assert.equal(controller.getState().selectedThreadId, '55');
  assert.ok(seen.includes('PENDING'));
  assert.ok(seen.includes('SENT'));
});

test('I1 retry reuses the same clientMessageId and already uploaded attachment instead of duplicating upload', async () => {
  const { createSupportController } = await import(moduleUrl('web/features/support/support.js'));
  let attempts = 0; let uploads = 0; const sent = [];
  const port = {
    listThreads: async () => ({ ok: true, data: { items: [] } }),
    getMessages: async () => ({ ok: true, data: { items: [] } }),
    uploadAttachment: async () => { uploads += 1; return { ok: true, data: { attachment: { path: 'private/demo.webp', name: 'demo.webp', mimeType: 'image/webp', size: 123, previewUrl: 'https://signed.example/should-not-be-forwarded' } } }; },
    sendMessage: async (input) => { sent.push(input); attempts += 1; if (attempts === 1) return { ok: false, error: { code: 'NETWORK_ERROR', message: 'retry', retryable: true } }; return { ok: true, data: { id: 'srv-2', ticketId: 1, sender: 'USER', body: input.text, attachment: input.attachment } }; },
  };
  const controller = createSupportController({ supportPort: port, createClientMessageId: () => 'retry-fixed', createObjectUrl: () => 'blob:local-preview' });
  const file = { name: 'demo.webp', type: 'image/webp', size: 123 };
  const first = await controller.send({ text: 'Rasm', file, threadId: '1' });
  assert.equal(first.ok, false);
  assert.equal(controller.getState().messages[0].status, 'FAILED');
  const second = await controller.retry('retry-fixed');
  assert.equal(second.ok, true);
  assert.equal(uploads, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].clientMessageId, 'retry-fixed');
  assert.equal(sent[1].clientMessageId, 'retry-fixed');
  assert.equal('previewUrl' in sent[0].attachment, false);
  assert.equal(controller.getState().messages.length, 1);
  assert.equal(controller.getState().messages[0].status, 'SENT');
});

test('I1 reset clears private state and revokes local attachment preview URLs', async () => {
  const { createSupportController } = await import(moduleUrl('web/features/support/support.js'));
  const revoked = [];
  const port = {
    listThreads: async () => ({ ok: true, data: { items: [] } }), getMessages: async () => ({ ok: true, data: { items: [] } }),
    uploadAttachment: async () => ({ ok: false, error: { code: 'NETWORK_ERROR', message: 'offline', retryable: true } }), sendMessage: async () => ({ ok: true, data: {} }),
  };
  const controller = createSupportController({ supportPort: port, createClientMessageId: () => 'x', createObjectUrl: () => 'blob:preview-x', revokeObjectUrl: (url) => revoked.push(url) });
  await controller.send({ file: { name: 'x.png', type: 'image/png', size: 10 } });
  assert.equal(controller.getState().messages.length, 1);
  controller.resetPrivateState();
  assert.deepEqual(revoked, ['blob:preview-x']);
  assert.deepEqual(controller.getState().messages, []);
});

test('I1 order-return handler prepares a support draft and uses the existing support route', async () => {
  const { createOrderReturnSupportHandler } = await import(moduleUrl('web/features/support/support.js'));
  let draft = null; let href = null;
  const handler = createOrderReturnSupportHandler({ supportController: { setDraft: (text, context) => { draft = { text, context }; } }, navigate: async (value) => { href = value; } });
  const result = await handler({ id: 'ord 12' });
  assert.equal(result.ok, true);
  assert.equal(href, '/support?order=ord%2012');
  assert.equal(draft.context.type, 'ORDER_RETURN');
  assert.equal(draft.context.orderId, 'ord 12');
  assert.match(draft.text, /ord 12/);
});

test('I1 source includes pending/sent/failed/retry states and marks attachment previews private', () => {
  const src = fs.readFileSync(path.join(root, 'web/features/support/support.js'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'web/index.js'), 'utf8');
  for (const phrase of ['Yuborilmoqda…', 'Yuborilmadi', 'Yuborildi', 'Qayta yuborish', 'Private fayl', 'clientMessageId']) assert.match(src, new RegExp(phrase));
  assert.match(src, /referrerPolicy = 'no-referrer'/);
  assert.match(index, /features\/support\/index\.js/);
});
