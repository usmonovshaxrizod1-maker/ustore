import * as mocks from './mock/index.js';
import { createLiveServiceProvider } from './core-provider.js';

function mockAdapters(options = {}) {
  return {
    context: mocks.createMockContextAdapter({ scenario: options.contextScenario || 'guest' }),
    auth: mocks.createMockAuthAdapter({ session: options.authSession || 'signedOut' }),
    catalog: mocks.createMockCatalogAdapter({ scenario: options.catalogScenario || 'home' }),
    cart: mocks.createMockCartAdapter({ scenario: options.cartScenario || 'basic' }),
    orders: mocks.createMockOrdersAdapter(options.orders || {}),
    payments: mocks.createMockPaymentsAdapter(options.payments || {}),
    profile: mocks.createMockProfileAdapter(options.profile || {}),
    support: mocks.createMockSupportAdapter(options.support || {}),
    admin: mocks.createMockAdminAdapter(options.admin || {}),
    domains: mocks.createMockDomainsAdapter(),
    platform: mocks.createMockPlatformAdapter(options.platform || {}),
  };
}

export function createServiceProvider({ runtime = 'production', mode = 'live', liveAdapters = null, mockOptions = {} } = {}) {
  const demoAllowed = runtime === 'local-demo' || runtime === 'test';
  if (mode === 'mock') {
    if (!demoAllowed) throw new Error('Mock adapter production runtime’da taqiqlangan.');
    return createLiveServiceProvider({ runtime, liveAdapters: mockAdapters(mockOptions) });
  }
  return createLiveServiceProvider({ runtime, liveAdapters });
}

export function createLocalDemoProvider(options = {}) {
  const provider = createServiceProvider({ runtime: 'local-demo', mode: 'mock', mockOptions: options });
  return Object.freeze({ ...provider, mode: 'mock' });
}

export { createLiveServiceProvider } from './core-provider.js';
