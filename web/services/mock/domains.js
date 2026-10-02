import { fail, ok } from '../ports/result.js';
import { loadJsonFixture } from './fixture-loader.js';

const SAFE_DEMO_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
export function createMockDomainsAdapter() {
  let custom = null;
  return {
    async list() {
      const base = [await loadJsonFixture('domain/default-subdomain.json')];
      if (custom) base.push(structuredClone(custom));
      return ok(base);
    },
    async add(input) {
      const hostname = String(input?.hostname || '').trim().toLowerCase();
      if (!SAFE_DEMO_HOST.test(hostname) || !hostname.endsWith('.example')) return fail('VALIDATION_ERROR', 'Demo domen faqat .example bilan bo‘lishi kerak.');
      custom = await loadJsonFixture('domain/pending-dns.json');
      custom.hostname = hostname;
      return ok(structuredClone(custom));
    },
    async verify(input) {
      if (!custom || input?.domainId !== custom.id) return fail('NOT_FOUND', 'Domen topilmadi.');
      custom = await loadJsonFixture('domain/pending-tls.json');
      custom.id = input.domainId;
      return ok(structuredClone(custom));
    },
    async setPrimary(input) {
      if (!input?.domainId) return fail('VALIDATION_ERROR', 'Domain ID kerak.');
      if (!custom || input.domainId !== custom.id || custom.status !== 'ACTIVE') return fail('DOMAIN_NOT_VERIFIED', 'Faqat ACTIVE domen primary bo‘la oladi.');
      custom.isPrimary = true;
      return ok(structuredClone(custom));
    },
    async remove(input) {
      if (!input?.domainId) return fail('VALIDATION_ERROR', 'Domain ID kerak.');
      if (custom?.id === input.domainId) custom = null;
      return ok({ removing: true });
    },
  };
}
