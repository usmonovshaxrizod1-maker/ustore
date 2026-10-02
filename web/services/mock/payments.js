import { fail, ok } from '../ports/result.js';
import { loadJsonFixture } from './fixture-loader.js';

export function createMockPaymentsAdapter({ status = 'pending' } = {}) {
  const starts = new Map();
  return {
    async start(input) {
      if (!input?.orderId || !input.method || !input.idempotencyKey) return fail('VALIDATION_ERROR', 'To‘lov ma’lumotlari to‘liq emas.');
      if (!starts.has(input.idempotencyKey)) starts.set(input.idempotencyKey, await loadJsonFixture('payment/pending.json'));
      return ok(structuredClone(starts.get(input.idempotencyKey)));
    },
    async getStatus(input) {
      if (!input?.orderId) return fail('VALIDATION_ERROR', 'Order ID kerak.');
      const allowed = new Set(['pending','paid','failed','unknown']);
      const file = allowed.has(status) ? status : 'unknown';
      return ok(await loadJsonFixture(`payment/${file}.json`));
    },
  };
}
