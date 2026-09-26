import { createLiveServiceProvider } from '../services/core-provider.js';
import {
  createLiveAuthAdapter,
  createSessionStorageTokenStore,
  createSessionStorageChallengeStore,
  createLiveShopPublicAdapters,
  createLiveShopPrivateAdapters,
  createLiveAdminAdapter,
  createLivePlatformAdapter,
  createLiveDomainsAdapter,
  createLiveTenantResolver,
} from '../services/live/index.js';

function safeBaseUrl(value) {
  const url = new URL(String(value || ''));
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('SUPABASE_URL HTTPS bo‘lishi kerak.');
  return url.origin;
}

export function productionEndpoints(config = globalThis.APP_CONFIG || {}) {
  const base = safeBaseUrl(config.SUPABASE_URL);
  return Object.freeze({
    shop: `${base}/functions/v1/shop-api`,
    auth: `${base}/functions/v1/web-auth`,
    platform: `${base}/functions/v1/platform-api`,
  });
}

export function createProductionAuthRuntime({
  config = globalThis.APP_CONFIG || {},
  fetchImpl = globalThis.fetch,
  sessionStorage = globalThis.sessionStorage,
  tokenStore = null,
} = {}) {
  const endpoints = productionEndpoints(config);
  const sessions = tokenStore || createSessionStorageTokenStore(sessionStorage);
  const challengeStore = createSessionStorageChallengeStore(sessionStorage);
  const auth = createLiveAuthAdapter({ endpoint: endpoints.auth, fetchImpl, tokenStore: sessions, challengeStore });
  return Object.freeze({ endpoints, tokenStore: sessions, auth });
}

export function createProductionPlatformRuntime({
  config = globalThis.APP_CONFIG || {},
  fetchImpl = globalThis.fetch,
  sessionStorage = globalThis.sessionStorage,
  tokenStore = null,
} = {}) {
  const authRuntime = createProductionAuthRuntime({ config, fetchImpl, sessionStorage, tokenStore });
  const platform = createLivePlatformAdapter({ endpoint: authRuntime.endpoints.platform, fetchImpl, tokenStore: authRuntime.tokenStore });
  return Object.freeze({ ...authRuntime, platform });
}

export async function createProductionShopRuntime({
  config = globalThis.APP_CONFIG || {},
  fetchImpl = globalThis.fetch,
  locationRef = globalThis.location,
  sessionStorage = globalThis.sessionStorage,
  tokenStore = null,
  botId = null,
  storageClient = null,
} = {}) {
  const authRuntime = createProductionAuthRuntime({ config, fetchImpl, sessionStorage, tokenStore });
  const tenantResolver = createLiveTenantResolver({ endpoint: authRuntime.endpoints.shop, fetchImpl,
    botIdHosts: Array.isArray(config.USTORE_WEB_BOT_ID_HOSTNAMES) ? config.USTORE_WEB_BOT_ID_HOSTNAMES : [] });
  const tenantResult = await tenantResolver.resolve({ locationRef, botId });
  if (!tenantResult.ok) return tenantResult;
  const tenant = tenantResult.data;
  const locator = tenant.botId;

  const publicAdapters = createLiveShopPublicAdapters({ endpoint: authRuntime.endpoints.shop, botId: locator, fetchImpl, tokenStore: authRuntime.tokenStore });
  const privateAdapters = createLiveShopPrivateAdapters({ endpoint: authRuntime.endpoints.shop, botId: locator, fetchImpl, tokenStore: authRuntime.tokenStore, storageClient });
  const liveAdapters = {
    context: publicAdapters.context,
    auth: authRuntime.auth,
    catalog: publicAdapters.catalog,
    cart: privateAdapters.cart,
    orders: privateAdapters.orders,
    payments: privateAdapters.payments,
    profile: privateAdapters.profile,
    support: privateAdapters.support,
    admin: createLiveAdminAdapter({ endpoint: authRuntime.endpoints.shop, botId: locator, fetchImpl, tokenStore: authRuntime.tokenStore }),
    domains: createLiveDomainsAdapter({ endpoint: authRuntime.endpoints.shop, botId: locator, fetchImpl, tokenStore: authRuntime.tokenStore }),
    platform: createLivePlatformAdapter({ endpoint: authRuntime.endpoints.platform, fetchImpl, tokenStore: authRuntime.tokenStore }),
  };
  const services = createLiveServiceProvider({ runtime: 'production', liveAdapters });
  return { ok: true, data: Object.freeze({ ...authRuntime, tenantResolver, tenant, services }) };
}
