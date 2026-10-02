const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('H1 order timeline only uses known timestamps and marks current status without inventing a date', async () => {
  const { buildOrderStatusTimeline } = await import(moduleUrl('web/features/orders/orders.js'));
  const rows = buildOrderStatusTimeline({ id: '1', status: 'PROCESSING', createdAt: '2026-09-21T08:00:00Z', paidAt: '2026-09-21T08:02:00Z' });
  assert.deepEqual(rows.map((r) => r.key), ['CREATED', 'PAID', 'PROCESSING']);
  assert.equal(rows.at(-1).at, null);
  assert.equal(rows.at(-1).current, true);
});

test('H1 action availability follows current customer rules and routes return to support instead of inventing an order API', async () => {
  const { orderActionAvailability } = await import(moduleUrl('web/features/orders/orders.js'));
  assert.equal(orderActionAvailability({ status: 'NEW' }).canCancel, true);
  assert.equal(orderActionAvailability({ status: 'PROCESSING' }).canConfirmReceived, true);
  assert.equal(orderActionAvailability({ status: 'DELIVERED' }).canRequestReturn, true);
  assert.equal(orderActionAvailability({ status: 'DELIVERED', returnRequest: { status: 'REQUESTED' } }).canRequestReturn, false);
});

test('H1 controller loads detail, cancels and confirms through orders port', async () => {
  const { createOrdersPort } = await import(moduleUrl('web/services/ports/orders.js'));
  const { createMockOrdersAdapter } = await import(moduleUrl('web/services/mock/orders.js'));
  const { createOrdersController } = await import(moduleUrl('web/features/orders/orders.js'));
  const controller = createOrdersController({ ordersPort: createOrdersPort(createMockOrdersAdapter()) });
  assert.equal((await controller.load()).ok, true);
  assert.equal(controller.getState().items.length, 3);
  await controller.open('ord-demo-001');
  assert.equal((await controller.cancel('Reja o‘zgardi')).ok, true);
  assert.equal(controller.getState().selected.status, 'CANCELLED');
  await controller.open('ord-demo-002');
  assert.equal((await controller.confirmReceived()).ok, true);
});

test('H1 return action remains capability-unavailable until I1 support routing is supplied', async () => {
  const { createOrdersController } = await import(moduleUrl('web/features/orders/orders.js'));
  const port = { listMine: async()=>({ok:true,data:{items:[]}}), getMine: async()=>({ok:true,data:{id:'x',status:'DELIVERED'}}), cancelMine: async()=>({ok:true,data:{}}), confirmReceived: async()=>({ok:true,data:{}}) };
  const controller = createOrdersController({ ordersPort: port });
  await controller.open('x');
  const result = await controller.requestReturn();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CAPABILITY_UNAVAILABLE');
});

test('H1 source renders list/detail/status timeline and customer actions', () => {
  const src = fs.readFileSync(path.join(root, 'web/features/orders/orders.js'), 'utf8');
  for (const text of ['Buyurtmalarim', 'Buyurtma holati tarixi', 'Bekor qilish', 'Qabul qildim', 'Qaytarish / muammo']) assert.match(src, new RegExp(text));
});
