> P1 groups1–3 LOCAL review complete; NEXT P2. Current authority: P1_SUMMARY.md. Feature and live blockers remain; prior statuses below are historical.

> Current authority: root AVVAL_SHUNI_OQI.md and REVIEW_10ABC_AFTER_O2.md. Chat next P; local migrations through105, next106 (remote unverified). Historical entries below do not override current review.

# ASTRA tasks

Latest: 10b — OPERATOR_READY / DEPLOY_NOT_RUN / EXTERNAL_GATES_PENDING. Ordered release orchestration, rollback and deploy guard are complete locally; no production deployment occurred. Next Astra stream: 10c.

| Task | Status | Evidence / live gap |
|---|---|---|
| 1a | IMPLEMENTED_LOCAL | `ASTRA_BASELINE.md`; Git remote unavailable |
| 1b | IMPLEMENTED_LOCAL / BLOCKED_EXTERNAL | `DECISIONS.md`; provider not enabled/purchased |
| 1c | CONTRACT_TESTED_LOCAL | contract/build path reviewed; `MIGRATION_ALLOCATOR.md`; build dependency install unavailable |
| 2a | IMPLEMENTED_LOCAL | `ACCOUNT_MIGRATION.md`, 091 schema |
| 2b | CONTRACT_TESTED_LOCAL / LIVE_PENDING | 091 idempotent Telegram-account backfill; remote migration apply pending |
| 2c | CONTRACT_TESTED_LOCAL / LIVE_PENDING | user-owned compatibility account_id + audit/block separation; DB integrity dry-run pending |
| 3a | IMPLEMENTED_LOCAL | dedicated `web-auth` Edge Function; no fake email/custom JWT |
| 3b | CONTRACT_TESTED_LOCAL | bcrypt cost 12, generator, generic invalid credentials, DB rate limit |
| 3c | CONTRACT_TESTED_LOCAL | opaque sessions, rotation/revoke/list, login/password change, reset helper |
| 4a | CONTRACT_TESTED_LOCAL / LIVE_PENDING | central bot `/login` + `/start credentials`; webhook smoke pending |
| 4b | CONTRACT_TESTED_LOCAL / LIVE_PENDING | browser-bound one-time Telegram challenge; 093 + live auth adapter + focused security tests |
| 4c | CONTRACT_TESTED_LOCAL / LIVE_PENDING | central Telegram protected issue/reset/login-change; repeat issue never reveals old password; live bot/initData smoke pending |
| 5a | CONTRACT_TESTED_LOCAL / LIVE_PENDING | tenant/auth split + public web boot/catalog + optional server-verified web session; deploy/cross-tenant live smoke pending |
| 5b | CONTRACT_TESTED_LOCAL / LIVE_PENDING | verified account→shop principal, fresh membership/permissions, live cart/profile/orders/support adapters, migration 094; staging deploy/cross-tenant tests pending |
| 5c | CONTRACT_TESTED_LOCAL / LIVE_PENDING | server-authoritative quote; atomic web order/stock/promo via existing `place_order`; checkout/payment idempotency; server payment status; migration 095; staging concurrency/provider smoke pending |
| 6a | CONTRACT_TESTED_LOCAL / LIVE_PENDING | premium-web live admin adapter + server allowlist; Excel/BILLZ/image/receipt/report/export legacy handlers reused with fresh web session/membership and existing requirePermission gates; live deploy/storage/BILLZ/receipt/export smoke pending |
| 6b | CONTRACT_TESTED_LOCAL / LIVE_PENDING | central web session -> verified Telegram identity platform mapping; shop roles isolated from platform Super Admin; live platform adapter; staging role/subscription smoke pending |
| 6c | CONTRACT_TESTED_LOCAL / LIVE_PENDING | server-derived WEB/TELEGRAM order source; web order/support notifications deduped; blocked/unstarted shop-bot delivery is best-effort and Web orders/support remain persistent fallback; staging bot-delivery smoke pending |
| 7a | CONTRACT_TESTED_LOCAL / LIVE_PENDING | registry/state/permission foundation; migration 097; provider/routing live gates pending |
| 7b | CONTRACT_TESTED_LOCAL / LIVE_PENDING | provider provisioning/reconciliation foundation; migration 098; real provider smoke pending |
| 7c | CONTRACT_TESTED_LOCAL / LIVE_PENDING | primary/removal/routing cleanup foundation; migration 099; real host-routing smoke pending |
| 8a | CONTRACT_TESTED_LOCAL / LIVE_PENDING | shared domain UI mounted in web + Mini App; mobile copy/verify/retry; server audit; real browser/provider smoke pending |
| 8b | CONTRACT_TESTED_LOCAL / LIVE_PENDING | central auth ↔ ACTIVE custom-domain one-time code + PKCE handoff; origin-local opaque session; migration 100; real deployed custom-domain login smoke pending |

| 8c | CONTRACT_TESTED_LOCAL / LIVE_PENDING | domain-loss handoff cancellation + same-shop subdomain fallback; explicit Telegram Mini App target/reset; migration 101; real Telegram/custom-domain smoke pending |
| 9a | CONTRACT_TESTED_LOCAL / BUILD_REGENERATED_LOCAL | latest source merged; production live composition + tenant/auth handoff; deterministic source→dist build; mock/fixture/demo-provider exclusion; manifest/capability audit; real browser/deploy/provider smoke pending |

| 9b | REAL_BROWSER_QA_LOCAL / LIVE_PENDING | local Chromium role/viewport QA; deployed/provider/device smoke pending |
| 9c | CONTRACT_TESTED_LOCAL / BUILD_REGENERATED_LOCAL / LIVE_PENDING | migration 103 session-generation + cart merge; payment PROCESSING recovery; CSP/pins/redaction/perf audit; PostgreSQL apply/provider reconciliation/host headers pending |
| 10a | LOCAL_PREFLIGHT_COMPLETE / EXTERNAL_GATES_PENDING | 001–103 local ledger+hashes; env-name inventory; backup/restore contract; release checklist/staging helper; remote DB ledger/dry-run/real restore/staging smoke NOT RUN |
| 10b | OPERATOR_READY / DEPLOY_NOT_RUN / EXTERNAL_GATES_PENDING | DB→backend→frontend→smoke→domains runbook + guard + production read-only smoke; live 10a evidence/production access absent, so no deploy claim |
## ASTRA 10c — FINAL_RELEASE_GATE_READY / BLOCKED_EXTERNAL
- [x] immutable RC build ID/fingerprint
- [x] migration-level match gate
- [x] production smoke evidence matrix
- [x] rollback evidence gate
- [ ] actual production deploy evidence
- [ ] production smoke: catalog/checkout/login/OWNER/STAFF/domain TLS/Mini App
- [ ] production release commit/artifact evidence
Next product stream: CHAT N2.

