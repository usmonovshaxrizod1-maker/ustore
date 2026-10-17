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
  if (choices.length && !['NEW_SHOP', 'ADDON_SERVICE', 'EXISTING_SHOP'].includes(context.kind)) throw new Error('addons_new_shop_only');
  const seen = new Set<string>();
  const items: SubscriptionAddon[] = choices.map((choice) => {
    if (!choice || typeof choice !== 'object') throw new Error('invalid_subscription_addons');
    const code = choice.code;
    if (seen.has(code)) throw new Error('duplicate_subscription_addon');
    seen.add(code);
    const details = choice.details || {};
    if (code === 'CATALOG_SETUP') {
      const unitPrice = Math.round(tariffPrice * 30 / 100);
      return {code,quantity:1,unitPrice,totalPrice:unitPrice,details:{requested:true}};
    }
    if (code === 'MANAGED_DOMAIN') {
      const rawDomains = Array.isArray(details.domains) && details.domains.length ? details.domains : [details.domain];
      const validDomains = rawDomains
        .map((d) => text(d, 253).toLowerCase())
        .filter(Boolean)
        .slice(0, 7);
      if (!validDomains.length) throw new Error('domain_name_invalid');
      for (const d of validDomains) {
        if (!/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.uz$/.test(d)) {
          throw new Error('domain_name_invalid');
        }
      }
      const years = Number(details.years);
      if (!Number.isInteger(years) || years < 1 || years > 10) throw new Error('domain_years_invalid');
      return {code,quantity:years,unitPrice:50000,totalPrice:50000*years,details:{domain:validDomains[0],domains:validDomains,years}};
    }
    throw new Error('unknown_subscription_addon');
  });
  items.sort((a,b) => a.code.localeCompare(b.code));
  const addonsTotal = items.reduce((sum,item) => sum + item.totalPrice, 0);
  return {items,addonsTotal,totalPrice:tariffPrice+addonsTotal};
}
