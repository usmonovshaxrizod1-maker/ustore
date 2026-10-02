# ASTRA-3 — web authentication security notes

## Implemented local
- Dedicated `web-auth` Edge Function; no fake email and no manually minted JWT.
- Normalized username lookup, bcrypt cost 12, 12..72-byte password validation.
- Cryptographically random generated password helper for Telegram-protected issue/reset flow.
- Generic invalid-credentials response and DB-backed rate limiting.
- Opaque 32-byte session token; only SHA-256 token hash stored in DB.
- 30-day session expiry; sessions rotate inside the last 7 days.
- Sign out, list sessions, revoke one, revoke all, login change and password change.
- Password change / Telegram reset revokes old sessions.
- Security audit rows contain event type/account only; no password/session token.

## Transport decision
This package uses an opaque bearer session contract because custom-domain cookies/handoff are Astra-8 work. Access tokens are never put in URLs or logs. The browser storage/BFF decision remains an integration gate; a future same-origin BFF may convert the opaque token to HttpOnly/Secure/SameSite cookie handling.

## Not live-verified
- bcrypt latency on deployed Supabase Edge runtime.
- remote migration execution and concurrency.
- production rate-limit behavior under distributed load.
- XSS/CSP and final bearer storage strategy.

## Astra-4b Telegram browser challenge
- Chosen flow: CENTRAL UStorE bot deep-link challenge, not shop-bot authority.
- Browser receives random state + browser verifier; DB stores only SHA-256 hashes.
- State may appear in the Telegram deep link; browser verifier never does.
- TTL: 5 minutes. Challenge is browser-origin + verifier bound.
- Central bot approval cannot rebind an already-approved challenge to another Telegram account.
- Browser status exposes an approval preview and `requiresExplicitConfirmation`; session exchange requires the approved `accountId` plus `confirmed=true`.
- SQL RPC exchanges under row lock and inserts the opaque `TELEGRAM_EXCHANGE` session in the same transaction that marks the challenge consumed; replay cannot create a second session.
- Return target is relative-path only. Request `Origin` must exactly match configured `WEB_AUTH_ALLOWED_ORIGINS`; wildcard CORS is not used by `web-auth`.
- Live adapter keeps the browser verifier in an injectable ephemeral challenge store (sessionStorage-compatible); opaque session token storage is still an integration decision and defaults to memory.
- LIVE_PENDING: migration 093 apply, real central bot username/webhook smoke, production allowlist configuration, deployed replay/race tests.

