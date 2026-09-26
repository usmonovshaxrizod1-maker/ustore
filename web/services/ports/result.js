export const STABLE_ERROR_CODES = Object.freeze([
  'AUTH_REQUIRED',
  'INVALID_CREDENTIALS',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'SHOP_UNAVAILABLE',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'CAPABILITY_UNAVAILABLE',
  'DOMAIN_NOT_VERIFIED',
  'CONTRACT_MISMATCH',
]);

const STABLE_ERROR_SET = new Set(STABLE_ERROR_CODES);

export function ok(data) {
  return { ok: true, data };
}

export function fail(code, message, options = {}) {
  const safeCode = STABLE_ERROR_SET.has(code) ? code : 'CONTRACT_MISMATCH';
  const error = {
    code: safeCode,
    message: String(message || 'Amalni bajarib bo‘lmadi.'),
    retryable: options.retryable === true,
  };
  if (options.fieldErrors && typeof options.fieldErrors === 'object') error.fieldErrors = { ...options.fieldErrors };
  if (options.requestId) error.requestId = String(options.requestId);
  return { ok: false, error };
}

export function isResult(value) {
  if (!value || typeof value !== 'object' || typeof value.ok !== 'boolean') return false;
  if (value.ok) return Object.prototype.hasOwnProperty.call(value, 'data');
  return !!value.error && typeof value.error === 'object'
    && STABLE_ERROR_SET.has(value.error.code)
    && typeof value.error.message === 'string'
    && typeof value.error.retryable === 'boolean';
}
