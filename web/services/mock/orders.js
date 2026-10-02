import { fail, ok } from '../ports/result.js';
import { loadJsonFixture } from './fixture-loader.js';

export function createMockOrdersAdapter({ empty = false, unknownCreate = false } = {}) {
  const createdByKey = new Map();
  return {
    async create(input) {
      if (!input?.idempotencyKey || !input.checkout) return fail('VALIDATION_ERROR', 'Checkout va idempotencyKey kerak.');
      if (unknownCreate) return loadJsonFixture('orders/unknown-result.json');
      if (!createdByKey.has(input.idempotencyKey)) createdByKey.set(input.idempotencyKey, await loadJsonFixture('orders/create-pending.json'));
      return ok(structuredClone(createdByKey.get(input.idempotencyKey)));
    },
    async listMine() { return ok(await loadJsonFixture(empty ? 'orders/empty.json' : 'orders/mine.json')); },
    async getMine(input) {
      if (!input?.orderId) return fail('VALIDATION_ERROR', 'Order ID kerak.');
      const page = await loadJsonFixture('orders/mine.json');
      const order = page.items.find((row) => row.id === input.orderId);
      return order ? ok(order) : fail('NOT_FOUND', 'Buyurtma topilmadi.');
    },
    async cancelMine(input) {
      if (!input?.orderId) return fail('VALIDATION_ERROR', 'Order ID kerak.');
      return ok({ id: input.orderId, status: 'CANCELLED', reason: input.reason || null });
    },
    async confirmReceived(input) {
      if (!input?.orderId) return fail('VALIDATION_ERROR', 'Order ID kerak.');
      return ok({ id: input.orderId, status: 'RECEIVED' });
    },
  };
}
