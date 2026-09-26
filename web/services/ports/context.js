import { fail } from './result.js';

export const SHOP_ROLES = Object.freeze(['CUSTOMER', 'OWNER', 'STAFF']);
export const SHOP_LIFECYCLES = Object.freeze(['ACTIVE', 'FROZEN', 'PROVISIONING', 'TERMINATED', 'DISABLED']);

export function validateContext(context) {
  if (!context || typeof context !== 'object') return fail('CONTRACT_MISMATCH', 'Context mavjud emas.');
  if (context.mode !== 'web' && context.mode !== 'telegram') return fail('CONTRACT_MISMATCH', 'Context mode noto‘g‘ri.');
  if (!context.shop || typeof context.shop !== 'object') return fail('CONTRACT_MISMATCH', 'Shop context mavjud emas.');
  if (!context.shop.id || !context.shop.slug || !context.shop.name) return fail('CONTRACT_MISMATCH', 'Shop identifikatori to‘liq emas.');
  if (!SHOP_LIFECYCLES.includes(context.shop.lifecycle)) return fail('CONTRACT_MISMATCH', 'Shop lifecycle noto‘g‘ri.');
  if (context.shop.currency !== 'UZS') return fail('CONTRACT_MISMATCH', 'Qo‘llanmaydigan valyuta.');
  if (context.actor !== null) {
    const actor = context.actor;
    if (!actor || !actor.accountId || !actor.displayName || !SHOP_ROLES.includes(actor.shopRole)) {
      return fail('CONTRACT_MISMATCH', 'Actor context noto‘g‘ri.');
    }
    if (!Array.isArray(actor.roleCodes) || !Array.isArray(actor.permissions)) {
      return fail('CONTRACT_MISMATCH', 'Actor rollari yoki permissionlari noto‘g‘ri.');
    }
  }
  if (!context.capabilities || typeof context.capabilities !== 'object' || Array.isArray(context.capabilities)) {
    return fail('CONTRACT_MISMATCH', 'Capabilities noto‘g‘ri.');
  }
  return null;
}

export function createContextPort(adapter) {
  if (!adapter || typeof adapter.resolve !== 'function') throw new TypeError('context adapter resolve() metodini berishi kerak');
  return Object.freeze({
    async resolve(input = {}) {
      return adapter.resolve(input);
    },
  });
}
