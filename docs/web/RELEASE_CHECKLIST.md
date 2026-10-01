# UStorE release checklist — Astra 10a

A checkbox is not evidence. Record the command, target environment, timestamp and result for each live item.

## 1. Baseline and migration ledger
- [x] Current source baseline identified.
- [x] Local migrations have unique sequential numbers with no gaps.
- [x] Local SHA-256 ledger generated.
- [ ] **Remote migration ledger compared to local 091–103.** Do not apply until this is done.
- [ ] PostgreSQL/Supabase migration dry-run completed on staging/clone.
- [ ] Migration 103 atomic session/cart/payment hardening exercised on PostgreSQL.

## 2. Backup / restore
- [x] Backup/restore contract statically verifies secret-table exclusion, versioned manifest, path/size guards and restore audit.
- [ ] Fresh staging shop backup ZIP created.
- [ ] Backup restored into a clean/staging target without overwriting an existing shop.
- [ ] Restored shop is `PROVISIONING`; bot/BILLZ/Click/Payme/Uzum credentials are absent and must be reconnected.
- [ ] Restored row/file counts sampled against source and restore audit row verified.

## 3. Build and automated regression
- [ ] Install dependencies from lockfile in clean CI/staging environment.
- [ ] `npm test` / legacy suite passes.
- [ ] premium web suite passes with required Node strip-types setting.
- [ ] `npm run check:edge` passes.
- [ ] `npm run build` regenerates `dist` from source and build/security/performance audit passes.

## 4. Staging smoke
- [ ] Central platform HTML opens on staging.
- [ ] HTTP security headers (especially CSP `frame-ancestors`) are actually served by host.
- [ ] Public tariff projection works and leaks no platform/shop private authority.
- [ ] Buyer guest catalog/cart/login/checkout path.
- [ ] OWNER / MANAGER / limited STAFF permissions.
- [ ] Telegram Mini App legacy flow.
- [ ] Custom domain DNS → TLS → ACTIVE and auth handoff/fallback.
- [ ] Click/Payme/Uzum/BILLZ provider-specific smoke where credentials/access exist.

## 5. Environment / secrets
- [x] Runtime variable names documented; values excluded from source/ZIP.
- [ ] Secret manager contains required production values.
- [ ] `WEB_AUTH_ALLOWED_ORIGINS`, central hostname/auth URL and custom-domain provider flags match the actual owned deployment.
- [ ] No test/staging credentials are reused in production.

## 6. Go/no-go
- [ ] No unresolved Critical/High auth, tenant isolation, payment, stock, migration or domain-routing blocker.
- [ ] Rollback owner and exact rollback steps are recorded.
- [ ] Backup created immediately before destructive/live migration work where applicable.
- [ ] Release commit/build ID and applied migration ledger are recorded.

Current 10a local status: **local preflight can pass, but live migration dry-run, real backup/restore and staging smoke remain external gates until DB/staging access exists.**

## 7. Astra 10b deploy execution
- [x] Ordered deployment runbook exists: DB → backend → frontend → read-only smoke → domains.
- [x] Migration 103 is explicitly gated before 9c application source.
- [x] Custom-domain mutation freeze is documented for the 102/backend cross-version window.
- [x] Phase rollback strategy is documented without unsafe blind down-migration.
- [x] Deploy guard requires external evidence and explicit approval.
- [x] Production read-only smoke helper exists.
- [ ] All eight 10b external evidence gates are verified.
- [ ] Actual production DB/backend/frontend deployment executed and command evidence captured.
- [ ] Production read-only smoke passed against the deployed target.
- [ ] Domain/TLS activation performed only after smoke.

Current 10b status: **OPERATOR_READY / DEPLOY_NOT_RUN / EXTERNAL_GATES_PENDING**.

