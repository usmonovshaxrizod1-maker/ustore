import { WEB_ROUTES } from './routes.js';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileRoute(route) {
  const names = [];
  const parts = String(route.path || '/')
    .split('/')
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith(':')) {
        names.push(part.slice(1));
        return '([^/]+)';
      }
      return escapeRegExp(part);
    });
  const source = parts.length ? `^/${parts.join('/')}/?$` : '^/?$';
  return { ...route, matcher: new RegExp(source), paramNames: names };
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function normalizeInternalTarget(target) {
  const raw = String(target ?? '').trim();
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) {
    throw new Error('Router accepts only same-origin relative paths.');
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    throw new Error('Absolute URL navigation is not allowed.');
  }
  return raw;
}

export function splitTarget(target) {
  const normalized = normalizeInternalTarget(target);
  const hashIndex = normalized.indexOf('#');
  const beforeHash = hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;
  const hash = hashIndex >= 0 ? normalized.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const pathname = (queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash) || '/';
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : '';
  return { target: normalized, pathname, search, hash };
}

export function createRouteMatcher(routes = WEB_ROUTES) {
  const compiled = routes.map(compileRoute);
  return (target) => {
    const location = splitTarget(target);
    for (const route of compiled) {
      const match = route.matcher.exec(location.pathname);
      if (!match) continue;
      const params = {};
      route.paramNames.forEach((name, index) => { params[name] = safeDecode(match[index + 1]); });
      return {
        found: true,
        route: { id: route.id, path: route.path, navId: route.navId, auth: Boolean(route.auth), admin: Boolean(route.admin), platform: Boolean(route.platform), platformAuth: Boolean(route.platformAuth), platformSuperAdmin: Boolean(route.platformSuperAdmin) },
        params,
        ...location,
      };
    }
    return { found: false, route: null, params: {}, ...location };
  };
}

function currentTarget(windowRef) {
  const location = windowRef?.location;
  if (!location) return '/';
  return `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
}

export function createRouter(options = {}) {
  const windowRef = options.windowRef || globalThis.window;
  if (!windowRef?.history || !windowRef?.location || !windowRef?.addEventListener) {
    throw new Error('Router requires a browser-like window with history and location.');
  }
  const matchRoute = createRouteMatcher(options.routes || WEB_ROUTES);
  const listeners = new Set();
  let started = false;
  let state = matchRoute(currentTarget(windowRef));

  const emit = (reason) => {
    for (const listener of listeners) listener(state, reason);
    options.onChange?.(state, reason);
    return state;
  };

  const read = (reason = 'read') => {
    state = matchRoute(currentTarget(windowRef));
    return emit(reason);
  };

  const onPopState = () => read('popstate');

  return {
    start() {
      if (!started) {
        windowRef.addEventListener('popstate', onPopState);
        started = true;
      }
      return read('start');
    },
    destroy() {
      if (started) windowRef.removeEventListener?.('popstate', onPopState);
      started = false;
      listeners.clear();
    },
    getCurrent() { return state; },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('Router listener must be a function.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    navigate(target, historyState = {}) {
      const normalized = normalizeInternalTarget(target);
      windowRef.history.pushState(historyState, '', normalized);
      state = matchRoute(normalized);
      return emit('navigate');
    },
    replace(target, historyState = {}) {
      const normalized = normalizeInternalTarget(target);
      windowRef.history.replaceState(historyState, '', normalized);
      state = matchRoute(normalized);
      return emit('replace');
    },
    refresh() { return read('refresh'); },
  };
}
