const AUTH_METHODS = [
  'getSession', 'signInPassword', 'beginTelegramSignIn', 'beginCredentialIssue',
  'signOut', 'listSessions', 'revokeSession', 'revokeAllSessions',
];

const OPTIONAL_AUTH_METHODS = [
  'getTelegramSignInStatus', 'completeTelegramSignIn', 'changeLogin', 'changePassword',
  'beginOriginHandoff', 'getOriginHandoff', 'authorizeOriginHandoff', 'exchangeOriginHandoff',
];

export function createAuthPort(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('auth adapter kerak');
  for (const method of AUTH_METHODS) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`auth adapter ${method}() metodini berishi kerak`);
  }
  const methods = Object.fromEntries(AUTH_METHODS.map((method) => [method, (...args) => adapter[method](...args)]));
  for (const method of OPTIONAL_AUTH_METHODS) if (typeof adapter[method] === 'function') methods[method] = (...args) => adapter[method](...args);
  return Object.freeze(methods);
}

export function validatePasswordSignInInput(input) {
  if (!input || typeof input !== 'object') return false;
  return typeof input.login === 'string' && input.login.trim().length >= 3
    && typeof input.password === 'string' && input.password.length >= 1;
}
