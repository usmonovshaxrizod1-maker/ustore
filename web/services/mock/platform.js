import { fail, ok } from '../ports/result.js';
import { loadJsonFixture } from './fixture-loader.js';

const ROLE_FIXTURES = { customer: 'platform/customer.json', owner: 'platform/owner.json', superAdmin: 'platform/super-admin.json' };
export function createMockPlatformAdapter({ role = 'customer' } = {}) {
  return {
    async invoke(action, payload = {}, options = {}) {
      if (!action) return fail('VALIDATION_ERROR', 'Platform action kerak.');
      if (action === 'platform_public_catalog') return ok(await loadJsonFixture('platform/public-home.json'));
      const context = await loadJsonFixture(ROLE_FIXTURES[role] || ROLE_FIXTURES.customer);
      if (action.startsWith('admin_') && context.capabilities.superAdmin !== true) return loadJsonFixture('platform/forbidden.json');
      return ok({ action, payload: structuredClone(payload), requestId: options.requestId || null, context });
    },
  };
}
