import { fail, ok } from '../ports/result.js';
import { validateContext } from '../ports/context.js';
import { loadJsonFixture } from './fixture-loader.js';

const SCENARIOS = Object.freeze({
  guest: 'context/guest-active.json',
  customer: 'context/customer-active.json',
  owner: 'context/owner-active.json',
  manager: 'context/manager-active.json',
  staffLimited: 'context/staff-limited-active.json',
  frozen: 'context/shop-frozen.json',
});

export function createMockContextAdapter({ scenario = 'guest' } = {}) {
  return {
    async resolve() {
      const fixturePath = SCENARIOS[scenario];
      if (!fixturePath) return fail('CONTRACT_MISMATCH', `Noma'lum context fixture: ${scenario}`);
      const context = await loadJsonFixture(fixturePath);
      const invalid = validateContext(context);
      return invalid || ok(context);
    },
  };
}
