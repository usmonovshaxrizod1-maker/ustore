const cache = new Map();

export async function loadJsonFixture(relativePath) {
  const url = new URL(`../../fixtures/${relativePath}`, import.meta.url);
  const key = url.href;
  if (!cache.has(key)) {
    const raw = await import(url.href, { with: { type: 'json' } }).then((m) => m.default);
    cache.set(key, raw);
  }
  return structuredClone(cache.get(key));
}
