import { fail, isResult } from './result.js';

export function createPort(adapter, methods, name) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError(`${name} adapter kerak`);
  const port = {};
  for (const method of methods) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`${name} adapter ${method}() metodini berishi kerak`);
    port[method] = async (...args) => {
      try {
        const result = await adapter[method](...args);
        return isResult(result) ? result : fail('CONTRACT_MISMATCH', 'Server javobi kutilgan shaklda emas.');
      } catch (_) {
        return fail('NETWORK_ERROR', 'So‘rov yakunini tekshirib bo‘lmadi. Qayta urinib ko‘ring.', { retryable: true });
      }
    };
  }
  return Object.freeze(port);
}
