# UStorE cumulative update — 2026-10-04

Baseline: `USTORE_CURRENT_CLEAN_SOURCE_2026-10-03.zip`

## Implemented

1. Storefront lower information area redesigned with compact store/about, information/legal links and footer. Dedicated pages for delivery/payment, returns, terms, privacy and seller details. Existing fulfillment/legal data is reused; missing seller legal details are persisted.
2. Web authentication flow updated: central Telegram OIDC callback `/auth/telegram/callback`, stable guest Profile, explicit auth actions, automatic return after success, reduced intermediate auth/wait screens, premium shared login styling, and BFCache-safe Back/Cancel behavior.
3. Startup/loading UX changed from standalone welcome pages to readiness-driven shell/skeleton states.
4. Admin/User mode remains backend-authoritative from `boot.isAdmin`; admins retain the person switch control to toggle Admin/User mode.
5. Checkout split into 3 steps (information, delivery, payment) with persistent checkout drafts. Authenticated web and Telegram Mini App can resume saved checkout state. Pending online payment can be continued from Orders without creating a duplicate order.
6. Desktop banner keeps the full 5:2 ratio and has manual previous/next controls.
7. Desktop/tablet-only polish: Uzbek/Russian flag language selector, Favorites removed from top desktop header to widen search, central navigation SVG icons, consistent desktop product-card content zones, wider multi-column filter dialog. Mobile/Mini App styling for these refinements is intentionally unchanged.

## Database migrations

- `116_storefront_seller_details.sql`
- `117_checkout_drafts.sql`

Migration audit: 001–117, gaps 0, duplicates 0.

## Validation

- Main regression suite: 1097/1097 PASS
- Batch-specific regression: 9/9 PASS
- Edge TypeScript syntax: 28 files OK
- Production build: PASS, 428 files
- Web suite with `NODE_OPTIONS=--experimental-strip-types`: 500/507 PASS
  - Remaining 7 tests require `@electric-sql/pglite`, which is not installed in the review environment. They are SQL integration runners, not observed product-code failures.
- Release 10a local audit: PASS_WITH_EXTERNAL_GATES

## External deploy/config checks still required

- Apply migrations 116 and 117 to the target Supabase project.
- Deploy the updated Edge Functions/web build.
- In Telegram/BotFather OIDC configuration, allow the exact production callback:
  `https://ustr.uz/auth/telegram/callback`
- Verify required Telegram OIDC client/server secrets in the production environment.
- Run remote migration-ledger, staging smoke and real backup/restore evidence checks before final production sign-off.
