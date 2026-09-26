import * as ports from './ports/index.js';

const PORT_FACTORIES = Object.freeze({
  context: ports.createContextPort,
  auth: ports.createAuthPort,
  catalog: ports.createCatalogPort,
  cart: ports.createCartPort,
  orders: ports.createOrdersPort,
  payments: ports.createPaymentsPort,
  profile: ports.createProfilePort,
  support: ports.createSupportPort,
  admin: ports.createAdminPort,
  domains: ports.createDomainsPort,
  platform: ports.createPlatformPort,
});

export function createLiveServiceProvider({ runtime = 'production', liveAdapters } = {}) {
  if (!liveAdapters || typeof liveAdapters !== 'object') throw new Error('Live adapterlar hali ulanmagan.');
  const services = {};
  for (const [name, factory] of Object.entries(PORT_FACTORIES)) {
    if (!liveAdapters[name]) throw new Error(`${name} adapter mavjud emas.`);
    services[name] = factory(liveAdapters[name]);
  }
  return Object.freeze({ mode: 'live', runtime, ...services });
}
