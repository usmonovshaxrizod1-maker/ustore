import { fail, ok } from '../ports/result.js';
import { loadJsonFixture } from './fixture-loader.js';

export function createMockProfileAdapter({ actor = 'customer' } = {}) {
  let favorite = true;
  return {
    async get() { return ok(await loadJsonFixture(actor === 'owner' ? 'profile/owner.json' : 'profile/customer.json')); },
    async update(input) {
      if (!input?.patch || typeof input.patch !== 'object' || Array.isArray(input.patch)) return fail('VALIDATION_ERROR', 'Profil patch noto‘g‘ri.');
      const profile = await loadJsonFixture(actor === 'owner' ? 'profile/owner.json' : 'profile/customer.json');
      profile.shopProfile = { ...profile.shopProfile, ...input.patch };
      return ok(profile);
    },
    async listFavorites() { return ok(await loadJsonFixture('favorites/page.json')); },
    async setFavorite(input) {
      if (!input?.productId || typeof input.favorite !== 'boolean') return fail('VALIDATION_ERROR', 'Favorite ma’lumoti noto‘g‘ri.');
      favorite = input.favorite;
      return ok({ favorite });
    },
  };
}
