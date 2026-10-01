# UStorE WEB — integration decisions

## ADR-001 Hosting / custom hostnames (ASTRA-1b)
Status: PROVISIONAL_SELECTED_FOR_IMPLEMENTATION; PURCHASE/ENABLE NOT PERFORMED.

### Tanlov
Cloudflare for SaaS — custom hostname/provider adapter uchun boshlang‘ich target.

### Nega
- UStorE talabi: wildcard/subdomain routing, mijoz vanity/custom domenlari, TLS lifecycle va host-to-tenant mapping.
- Cloudflare for SaaS rasmiy hujjatida vanity/custom hostnames, TLS va fallback/custom origin oqimi mavjud.
- 2026-08 rasmiy plan hujjatida Free/Pro/Business uchun 100 hostname included, 50,000 max va additional hostname $0.10 deb ko‘rsatilgan.
- Wildcard *custom-hostname certificate* Enterprise xususiyati; bu UStorEning `*.ustore.uz` o‘z wildcard DNS/zone talabi bilan bir narsa emas. Provider implementatsiyasida bu farq saqlanadi.

### Chegara
Bu qaror kod/interfeys targeti. Billing ma'lumoti, `ustore.uz` egaligi, zone enable, fallback origin va payment method real muhitda tasdiqlanmaguncha `LIVE_PENDING`.

### Rasmiy manbalar (2026-09-22 da tekshirilgan)
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/

## ADR-002 Web auth (ASTRA-3a)
Status: IMPLEMENTED_LOCAL_FOR_REVIEW.

### Tanlov
UStorE server-side username/password auth + opaque revocable session token. Supabase Auth email/phone identityga usernameni fake-email orqali tiqish TANLANMADI; custom JWT mint qilish TANLANMADI.

### Password storage
- `bcryptjs` server-side, work factor 12.
- Plaintext/reversible password DBga yozilmaydi.
- Bcrypt 72-byte input limit explicit validation bilan qo‘llanadi.
- OWASP 2026 guidance: Argon2id afzal; bcrypt faqat Argon2/scrypt available bo‘lmaganda, cost >=10. Edge compatibility sabab bu paket bcryptjs bilan boshlaydi; Astra/live review Argon2-compatible vetted runtime topilsa migration/re-hash policy bilan kuchaytirishi mumkin.

### Session
- 32 random bytes opaque token; DBda faqat SHA-256 token hash.
- Session expiry, revoke, revoke-all, credential change -> old session revoke qo‘llab-quvvatlanadi.
- Bu paket bearer transportni server API contract sifatida beradi. Token URL/logga tushmaydi. Custom-domain cookie/handoff Astra-8 scope.

### Rasmiy manbalar
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://supabase.com/docs/guides/functions
- https://supabase.com/docs/guides/functions/dependencies
