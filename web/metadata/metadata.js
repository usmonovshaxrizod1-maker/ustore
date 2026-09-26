const DEFAULT_SITE_NAME = 'UStorE';
const DEFAULT_DESCRIPTION = 'UStorE — onlayn do‘koningiz uchun yagona savdo platformasi.';
const INDEX_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const NOINDEX_ROBOTS = 'noindex,nofollow,noarchive';

function cleanText(value, max = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}

function asHttpUrl(value, base) {
  try {
    const url = base ? new URL(String(value || ''), String(base)) : new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch (_) {
    return null;
  }
}

export function buildCanonicalUrl(baseUrl, pathname = '/') {
  const base = asHttpUrl(baseUrl);
  if (!base) return null;
  const cleanPath = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${pathname}`;
  const canonical = new URL(cleanPath, `${base.protocol}//${base.host}/`);
  canonical.search = '';
  canonical.hash = '';
  return canonical.href;
}

export function absolutePublicUrl(value, canonicalUrl = '') {
  if (!value) return null;
  const url = asHttpUrl(value, canonicalUrl || undefined);
  if (!url) return null;
  url.hash = '';
  return url.href;
}

export function createPageMetadata({
  title = DEFAULT_SITE_NAME,
  description = DEFAULT_DESCRIPTION,
  canonicalUrl = null,
  imageUrl = null,
  indexable = false,
  type = 'website',
  locale = 'uz',
  siteName = DEFAULT_SITE_NAME,
} = {}) {
  const canonical = asHttpUrl(canonicalUrl)?.href || null;
  const image = absolutePublicUrl(imageUrl, canonical || undefined);
  const normalizedLocale = String(locale || 'uz').toLowerCase().startsWith('ru') ? 'ru_RU' : 'uz_UZ';
  return Object.freeze({
    title: cleanText(title, 120) || DEFAULT_SITE_NAME,
    description: cleanText(description, 180) || DEFAULT_DESCRIPTION,
    canonicalUrl: canonical,
    imageUrl: image,
    robots: indexable && canonical ? INDEX_ROBOTS : NOINDEX_ROBOTS,
    indexable: Boolean(indexable && canonical),
    type: String(type || 'website'),
    locale: normalizedLocale,
    siteName: cleanText(siteName, 80) || DEFAULT_SITE_NAME,
  });
}

function upsertMeta(doc, attribute, key, content) {
  const selector = `meta[${attribute}="${key}"]`;
  let node = doc.head?.querySelector?.(selector) || doc.querySelector?.(selector) || null;
  if (!content) {
    node?.remove?.();
    return null;
  }
  if (!node) {
    node = doc.createElement('meta');
    node.setAttribute(attribute, key);
    doc.head?.append?.(node);
  }
  node.setAttribute('content', String(content));
  return node;
}

function upsertCanonical(doc, href) {
  let node = doc.head?.querySelector?.('link[rel="canonical"]') || doc.querySelector?.('link[rel="canonical"]') || null;
  if (!href) {
    node?.remove?.();
    return null;
  }
  if (!node) {
    node = doc.createElement('link');
    node.setAttribute('rel', 'canonical');
    doc.head?.append?.(node);
  }
  node.setAttribute('href', href);
  return node;
}

export function applyDocumentMetadata(spec, documentRef = globalThis.document) {
  const doc = documentRef;
  if (!doc?.createElement) throw new Error('Metadata uchun DOM document kerak.');
  const meta = createPageMetadata(spec);
  doc.title = meta.title;
  upsertMeta(doc, 'name', 'description', meta.description);
  upsertMeta(doc, 'name', 'robots', meta.robots);
  upsertCanonical(doc, meta.canonicalUrl);

  upsertMeta(doc, 'property', 'og:site_name', meta.siteName);
  upsertMeta(doc, 'property', 'og:title', meta.title);
  upsertMeta(doc, 'property', 'og:description', meta.description);
  upsertMeta(doc, 'property', 'og:type', meta.type);
  upsertMeta(doc, 'property', 'og:locale', meta.locale);
  upsertMeta(doc, 'property', 'og:url', meta.canonicalUrl);
  upsertMeta(doc, 'property', 'og:image', meta.imageUrl);

  upsertMeta(doc, 'name', 'twitter:card', meta.imageUrl ? 'summary_large_image' : 'summary');
  upsertMeta(doc, 'name', 'twitter:title', meta.title);
  upsertMeta(doc, 'name', 'twitter:description', meta.description);
  upsertMeta(doc, 'name', 'twitter:image', meta.imageUrl);
  return meta;
}

export function createDocumentMetadataManager({ documentRef = globalThis.document } = {}) {
  let current = null;
  return Object.freeze({
    apply(spec) { current = applyDocumentMetadata(spec, documentRef); return current; },
    getCurrent() { return current; },
    privatePage({ title = DEFAULT_SITE_NAME, description = DEFAULT_DESCRIPTION, canonicalUrl = null, locale = 'uz' } = {}) {
      return this.apply({ title, description, canonicalUrl, locale, indexable: false });
    },
    publicPage(spec = {}) { return this.apply({ ...spec, indexable: true }); },
  });
}

export function shareDescriptor({ title = DEFAULT_SITE_NAME, text = '', url } = {}) {
  const safe = asHttpUrl(url);
  if (!safe) return null;
  safe.hash = '';
  return Object.freeze({ title: cleanText(title, 120), text: cleanText(text, 220), url: safe.href });
}

export async function sharePage(descriptor, navigatorRef = globalThis.navigator) {
  const data = shareDescriptor(descriptor || {});
  if (!data) return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Ulashish URL’i noto‘g‘ri.' } };
  if (typeof navigatorRef?.share === 'function') {
    try {
      await navigatorRef.share(data);
      return { ok: true, data: { method: 'native', url: data.url } };
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, error: { code: 'CANCELLED', message: 'Ulashish bekor qilindi.' } };
      // Native share failing must not silently report success; clipboard is an explicit fallback below.
    }
  }
  if (typeof navigatorRef?.clipboard?.writeText === 'function') {
    try {
      await navigatorRef.clipboard.writeText(data.url);
      return { ok: true, data: { method: 'clipboard', url: data.url } };
    } catch (_) {}
  }
  return { ok: false, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'Ulashish yoki nusxalash bu brauzerda mavjud emas.' } };
}

export const ROBOTS = Object.freeze({ index: INDEX_ROBOTS, noindex: NOINDEX_ROBOTS });
