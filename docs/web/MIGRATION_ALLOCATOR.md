> Current authority: root AVVAL_SHUNI_OQI.md and REVIEW_10ABC_AFTER_O2.md. Chat next P; local migrations through105, next106 (remote unverified). Historical entries below do not override current review.

# Migration allocator

Supplied ZIP max migration: 090.
Live applied migration ledger: UNVERIFIED.

This package allocates locally:
- 091_web_accounts_identity.sql — account/Telegram identity + compatibility account_id mapping.
- 092_web_auth_sessions.sql — credentials, sessions, rate-limit and Telegram credential-flow state.
- 093_web_telegram_auth_challenges.sql — browser-bound one-time Telegram sign-in challenge + atomic exchange.
- 094_web_private_customer_indexes.sql — account lookup indexes + support `client_message_id` idempotency constraint for private web actions.
- 095_web_commerce_idempotency.sql — authoritative web quote/order compatibility fields, atomic web order wrapper, payment-start idempotency, order source and missing personal-discount account mapping.

Before live apply: compare remote migration history. If any of 091/092/093/094/095 are already occupied in remote, rename these NEW, unapplied migrations to the next free numbers; never edit an already-applied migration.

Astra-4c uses the existing 092 credential-entry/session schema and allocates no new migration. Astra-5b allocates 094. Astra-5c allocates 095. Next local migration number is 096, subject to remote-ledger verification.
# REVIEW-R1 allocation notice

`096_web_support_atomic_send.sql` is PROPOSED_LOCAL, remote availability UNVERIFIED.
Required by the revised support send handler; staging apply precedes deployment.
Review the remote ledger and renumber consistently if occupied. No DB was changed.

## Astra 7/8 local allocations

Also present in the current local worktree, all remote-ledger UNVERIFIED:
- 097_shop_domain_registry.sql — domain registry/state/permission foundation.
- 098_domain_provider_provisioning.sql — provider provisioning/reconciliation fields/RPCs.
- 099_domain_routing_cleanup.sql — primary routing and takeover-safe cleanup.
- 100_custom_domain_auth_handoff.sql — one-time authorization code + PKCE custom-domain session handoff.

Before live apply, compare the real remote migration ledger. Renumber only NEW/unapplied local migrations if any number is occupied; never rewrite an applied migration.
- 101_domain_auth_fallback_and_miniapp.sql — cancel custom-domain auth handoffs on route loss, make 7c removal compatible with 100 handoff rows, and persist the explicit Telegram Mini App domain target.

Migration 101 is PROPOSED_LOCAL and remote-ledger UNVERIFIED. Apply only after 097–100 and renumber all still-unapplied local domain migrations consistently if the remote ledger conflicts.

## Astra 10a release-ledger checkpoint — 2026-09-23

Current local migration directory is **001–103**, exactly 103 numbered SQL files, with no numeric gaps or duplicates in the local source. This is a **local inventory only**; the remote Supabase migration ledger is still UNVERIFIED.

Additional local/unverified allocations after 101:
- `102_domain_review_safety.sql` — domain operation claim/release and primary/state safety review hardening.
- `103_release_security_hardening.sql` — session-generation atomic revoke/reset, idempotent web cart merge and payment-recovery support.

`docs/web/release-evidence/ASTRA_10A_MIGRATION_LEDGER.json` contains SHA-256 fingerprints for every local migration. Before applying anything remotely, compare the real remote ledger. If an unapplied local number conflicts with a remote migration, renumber only the **still-unapplied local** migration set consistently; never edit or renumber an already-applied migration.

Next local migration number is **104**, subject to remote-ledger verification.

