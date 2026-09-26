import { createPort } from './simple.js';
const CATALOG_METHODS = ['listCategories', 'listProducts', 'getProduct', 'listBundles', 'getBundle', 'search'];

export const createCatalogPort = adapter => createPort(adapter, CATALOG_METHODS, 'catalog');

export function toPage(items, nextCursor = null, total = undefined) {
  const page = { items: Array.isArray(items) ? items : [], nextCursor: nextCursor ?? null };
  if (Number.isInteger(total) && total >= 0) page.total = total;
  return page;
}
