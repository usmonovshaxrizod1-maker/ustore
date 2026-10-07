import { splitTarget } from '../../navigation/router.js';

export function shopAuthReturnTo(routeState = {}) {
  const fallback = routeState.pathname === '/signin' ? '/profile' : routeState.target || '/profile';
  const requested = new URLSearchParams(routeState.search || '').get('next');
  if (!requested) return fallback;
  try {
    const next = splitTarget(requested);
    if (/^\/(?:auth|platform|signin)(?:\/|$)/.test(next.pathname)) return fallback;
    return next.target;
  } catch (_) {
    return fallback;
  }
}
