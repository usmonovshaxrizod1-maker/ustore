> REVIEW 2026-09-23: migration level is now **105**. Migration 104 removes old
> session/handoff RPC signatures: pause auth issuance, deploy 104 and matching
> Edge code together, verify, then resume. Old Edge rollback alone is incompatible;
> use a reviewed matching DB/Edge recovery pair. 105 preserves its RPC signature.
> Generate evidence in order: build → release:10a → release:10b → release:10c.
> Evidence must bind candidate buildManifestSha256, migrationSetSha256 and
> sourceSha256; 10c additionally requires matching 10b evidence for the same target.
> Every later source/build change invalidates these fingerprints. Never reuse stale evidence.

# ASTRA 10c — final production release gate

10c does not deploy anything by itself. It binds the final release to an immutable build fingerprint, migration level, production smoke evidence and rollback proof.

## Required production evidence
A production release may be marked verified only when all of these are evidenced against the same target/build:
1. deployment completed and production access/secrets/domain activation were verified;
2. deployed `BUILD_MANIFEST.json` SHA-256 exactly matches the local release candidate;
3. deployed migration level is at least the candidate max migration (currently 105);
4. guest catalog works;
5. checkout + payment flow is verified without duplicate payment start;
6. central login works;
7. OWNER/admin flow works;
8. limited STAFF permission denial/allowed flow works;
9. custom domain serves the correct shop over HTTPS/TLS;
10. Telegram Mini App works on a physical Telegram-capable device/session;
11. previous immutable artifact is recorded and rollback owner is confirmed.

## Build/release identity
`npm run release:10c` writes `docs/web/release-evidence/ASTRA_10C_RELEASE_CANDIDATE.json`.
The local build ID is derived from the SHA-256 of `dist/BUILD_MANIFEST.json` plus the max migration number. It is a release-candidate ID, not proof of production deployment.

This extracted workspace is not a Git worktree. Therefore a real release commit SHA is intentionally not invented. If the operator deploys from Git, the actual commit SHA belongs in the external evidence file.

## Production smoke
- `npm run smoke:production:10c -- --dry-run` lists required non-secret URLs.
- The automated network smoke checks central platform HTML/security headers, public tariff projection, a shop page, custom-domain HTTPS and Mini App HTML reachability.
- Authenticated checkout/login/OWNER/STAFF and physical Telegram evidence must be captured separately; they cannot be truthfully simulated from this local workspace.

## Rollback
Rollback is not a blind schema down-migration. Record the previous immutable frontend/backend artifact and the responsible rollback owner. Additive DB migrations stay unless a reviewed compensating migration exists. If checkout/payment/auth/domain smoke fails at Critical/High severity, stop rollout and restore the previous app artifact before further domain activation.
