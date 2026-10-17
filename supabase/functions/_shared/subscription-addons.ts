export type SubscriptionAddon = {
  code: 'CATALOG_SETUP' | 'MANAGED_DOMAIN'; quantity: number; unitPrice: number;
  totalPrice: number; details: Record<string, unknown>;
};
export type NormalizedSubscriptionAddons = { items: SubscriptionAddon[]; addonsTotal: number; totalPrice: number };
// JSONB may reorder object keys. Compare values, preserving only array order.
export function stableSubscriptionInput(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(stableSubscriptionInput).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableSubscriptionInput((value as Record<string,unknown>)[key])).join(',')+'}';
  return JSON.stringify(value) ?? 'null';
}

function text(value: unknown, max: number): string {
  if (value != null && typeof value !== 'string') throw new Error('invalid_addon_text');
  const result = String(value || '').trim();
  if (result.length > max) throw new Error('addon_text_too_long');
  return result;
}
function amount(value: unknown, code: string, integer = false): number {
  if (value === '' || value == null || (typeof value !== 'number' && typeof value !== 'string')) throw new Error(code);
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1e10 || (integer && !Number.isSafeInteger(result))) throw new Error(code);
  return result;
}
function list(value: unknown, max: number, code: string): any[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(code);
  return value;
}
export function normalizeSubscriptionAddons(input: unknown, context: { kind: string; tariffPriceSnapshot: number }): NormalizedSubscriptionAddons {
  const tariffPrice = context.tariffPriceSnapshot;
  if (!Number.isFinite(tariffPrice) || tariffPrice < 0 || tariffPrice > 1e11) throw new Error('invalid_tariff_price');
  const choices = list(input ?? [], 2, 'invalid_subscription_addons');
  if (choices.length && context.kind !== 'NEW_SHOP') throw new Error('addons_new_shop_only');
  const seen = new Set<string>();
  const items: SubscriptionAddon[] = choices.map((choice) => {
    if (!choice || typeof choice !== 'object') throw new Error('invalid_subscription_addons');
    const code = choice.code;
    if (seen.has(code)) throw new Error('duplicate_subscription_addon');
    seen.add(code);
    const details = choice.details || {};
    if (code === 'CATALOG_SETUP') {
      const products = list(details.products, 100, 'catalog_products_required').map((product, index) => {
        if (!product || typeof product !== 'object') throw new Error(`catalog_product_${index + 1}_invalid`);
        const name = text(product.name, 200);
        if (!name) throw new Error(`catalog_product_${index + 1}_name_required`);
        return {
          name, description: text(product.description, 3000),
          price: amount(product.price, `catalog_product_${index + 1}_price_invalid`),
          quantity: amount(product.quantity, `catalog_product_${index + 1}_quantity_invalid`, true),
          colors: text(product.colors, 500), sizes: text(product.sizes, 500),
          variants: list(product.variants ?? [], 100, 'catalog_variants_invalid').map((variant) => ({
            color: text(variant?.color, 100), size: text(variant?.size, 100),
            price: amount(variant?.price, `catalog_product_${index + 1}_variant_price_invalid`),
            quantity: amount(variant?.quantity, `catalog_product_${index + 1}_variant_quantity_invalid`, true),
          })),
        };
      });
      if (!products.length) throw new Error('catalog_products_required');
      const unitPrice = Math.round(tariffPrice * 30 / 100);
      return {code,quantity:1,unitPrice,totalPrice:unitPrice,details:{products}};
    }
    if (code === 'MANAGED_DOMAIN') {
      const domain = text(details.domain, 253).toLowerCase();
      if (!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error('domain_name_invalid');
      const years = Number(details.years);
      if (!Number.isInteger(years) || years < 1 || years > 10) throw new Error('domain_years_invalid');
      return {code,quantity:years,unitPrice:50000,totalPrice:50000*years,details:{domain,years}};
    }
    throw new Error('unknown_subscription_addon');
  });
  items.sort((a,b) => a.code.localeCompare(b.code));
  const addonsTotal = items.reduce((sum,item) => sum + item.totalPrice, 0);
  return {items,addonsTotal,totalPrice:tariffPrice+addonsTotal};
}
