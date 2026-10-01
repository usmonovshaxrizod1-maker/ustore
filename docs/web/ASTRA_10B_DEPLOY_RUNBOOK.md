> REVIEW 2026-09-23: migration level is now **105**. Migration 104 removes old
> session/handoff RPC signatures: pause auth issuance, deploy 104 and matching
> Edge code together, verify, then resume. Old Edge rollback alone is incompatible;
> use a reviewed matching DB/Edge recovery pair. 105 preserves its RPC signature.
> Generate evidence in order: build → release:10a → release:10b → release:10c.
> Evidence must bind candidate buildManifestSha256, migrationSetSha256 and
> sourceSha256; 10c additionally requires matching 10b evidence for the same target.
> Every later source/build change invalidates these fingerprints. Never reuse stale evidence.

# ASTRA 10b — production deployment runbook

Date: 2026-09-23
Status in this workspace: **OPERATOR_READY / DEPLOY_NOT_RUN / EXTERNAL_GATES_PENDING**

This runbook does not claim a deployment. The current container has no production Supabase project credentials, hosting control plane, DNS ownership, Cloudflare production capability or approved production secret set.

## Hard prerequisite from 10a
Do not start production mutation until all 10a live gates have evidence:
1. remote migration ledger compared with local migrations;
2. staging/clone PostgreSQL dry-run completed;
3. actual backup + clean restore evidence captured;
4. deployed staging smoke passed;
5. production secrets/config and owned central hostname verified;
6. rollback owner assigned.

Use `docs/web/release-evidence/ASTRA_10B_EXTERNAL_EVIDENCE.example.json` as the evidence shape. Store references only; never place credentials in the repository.

## Exact release order

### Phase 1 — additive database first
- Freeze production release window and capture the current app/function/build identifiers.
- Take the required fresh backup before live migration work.
- Compare remote migration history to the local SHA-256 ledger before applying anything.
- Apply only reviewed, remotely-missing migrations in ascending order.
- Migration **103 must be applied before deploying 9c source** because the source calls its atomic session/cart/payment RPCs.
- Verify migration postconditions and basic auth/cart/payment DB contracts before continuing.

Rollback rule: these migrations are designed as forward/additive compatibility work. Do **not** improvise destructive down migrations. If the app layer must be rolled back, keep compatible additive schema and restore the previous backend/frontend revisions unless a separately reviewed compensating migration exists.

### Phase 2 — compatible backend/Edge functions
- Deploy the reviewed server functions only after the DB phase is green.
- 102 introduced domain-operation locking/helper semantics. During the cross-version window, **freeze custom-domain mutations** so old and new domain mutation code do not race across incompatible assumptions.
- Keep `USTORE_WILDCARD_READY` and `USTORE_CUSTOM_DOMAIN_MINI_APP_ENABLED` false unless the corresponding live routing/Telegram evidence already exists.
- Verify web-auth/session issuance, platform public catalog, private shop auth and a non-destructive order/payment-status read before moving on.

Rollback rule: redeploy the previous known-good function revision while retaining compatible additive DB schema. Keep domain mutations frozen until a single compatible backend revision is confirmed.

### Phase 3 — generated frontend artifact
- Record `dist/BUILD_MANIFEST.json` checksum/build identifier.
- Deploy **generated `dist`** only; never hand-edit production `dist` or build source independently on the host.
- Ensure the selected host serves the security-header policy, including CSP `frame-ancestors`; a meta tag alone is not equivalent.

Rollback rule: restore the previous immutable frontend artifact/build ID.

### Phase 4 — read-only production smoke
Before enabling new domain traffic, run `npm run smoke:production:readonly` against the actual production URLs. It checks central platform HTML, HTTP security headers and the narrow public tariff projection. Then manually verify authenticated OWNER/MANAGER/limited-STAFF and buyer flows using approved test accounts.

Any Critical/High auth, tenant-isolation, payment, stock or routing failure is a **NO-GO**. Restore the previous frontend/backend revisions before domain activation.

### Phase 5 — domain activation last
- Only after phases 1–4 pass, verify provider/DNS/TLS/routing state.
- Enable production domain/routing flags only from evidence, never from code assumptions.
- Keep custom-domain Mini App targeting off until Telegram-specific requirements and fallback behavior are independently verified.
- If a custom hostname operation has uncertain provider outcome, use the documented quarantine/reconciliation procedure; do not delete or take over unknown in-flight provider objects.

Rollback rule: disable new routing/feature flags, fall back to canonical UStorE subdomain, reconcile provider state, and retain audit evidence.

## Guard commands
Local orchestration audit (never deploys):
`npm run release:10b`

Show deploy prerequisites only:
`npm run deploy:10b:guard -- --dry-run`

Guard a real operator release only after evidence exists:
`USTORE_10B_EVIDENCE_FILE=<evidence.json> USTORE_10B_EXECUTION_APPROVED=YES_DEPLOY_10B npm run deploy:10b:guard`

Passing the guard is **not** proof of deployment. The actual provider/Supabase/hosting commands and their output must be captured in the release ticket/evidence.

## Current external blockers
- 10a remote migration ledger comparison: not available in this workspace;
- PostgreSQL staging/clone dry-run: not run here;
- real backup/restore: not run here;
- deployed staging smoke: not run here;
- production Supabase/hosting/DNS/Cloudflare credentials and access: unavailable here;
- confirmed owned central production hostname: not configured in source;
- production secret-manager values: unavailable here.

Therefore 10b status here is **OPERATOR_READY / DEPLOY_NOT_RUN**, not production deployed.
