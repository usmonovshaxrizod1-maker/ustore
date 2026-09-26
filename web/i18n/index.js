import { uz } from './uz.js';
import { ru } from './ru.js';

export const WEB_DICTIONARIES = Object.freeze({ uz, ru });
export const WEB_LOCALES = Object.freeze(['uz', 'ru']);

export function normalizeLocale(locale, fallback = 'uz') {
  const value = String(locale || '').toLowerCase().split('-')[0];
  return WEB_DICTIONARIES[value] ? value : fallback;
}

export function createTranslator(locale = 'uz', options = {}) {
  const fallbackLocale = normalizeLocale(options.fallbackLocale || 'uz', 'uz');
  let activeLocale = normalizeLocale(locale, fallbackLocale);
  return {
    get locale() { return activeLocale; },
    setLocale(next) { activeLocale = normalizeLocale(next, fallbackLocale); return activeLocale; },
    t(key, fallback = key) {
      return WEB_DICTIONARIES[activeLocale]?.[key]
        ?? WEB_DICTIONARIES[fallbackLocale]?.[key]
        ?? fallback;
    },
  };
}
