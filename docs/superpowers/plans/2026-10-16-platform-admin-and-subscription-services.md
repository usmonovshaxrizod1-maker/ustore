# Platform Admin and Subscription Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the UStorE platform admin navigation and presentation, then add server-authoritative catalogue-setup and managed-domain services to new-shop checkout on Web and the platform bot.

**Architecture:** Keep the existing platform shell, API, subscription request, and provisioning flows. Add a normalized add-on table and one shared server-side validation/pricing module; Web and bot send user choices while `platform-api` computes financial truth and the submission RPC writes the request plus add-ons atomically. Admin fulfilment is additive and never changes subscription lifecycle state.

**Tech Stack:** Vanilla JavaScript/CSS, Deno TypeScript Edge Functions, Supabase/Postgres migrations and RPCs, Telegram Bot API, Node test runner, PGlite, Cloudflare Workers static assets.

**Spec:** `docs/superpowers/specs/2026-10-16-platform-admin-and-subscription-services-design.md`

## Global Constraints

- Existing subscription, payment, provisioning, domain-routing, authentication, shop-management, and support behavior must remain compatible.
- `tariff_price_snapshot` remains tariff-only; `total_price_snapshot` is tariff plus add-ons.
- Catalogue setup costs exactly 30 percent of the selected billing-period tariff price.
- Managed domain costs exactly 50,000 UZS per year for 1–10 years.
- Add-ons are accepted only for `NEW_SHOP` requests.
- Product images remain the owner’s responsibility in Shop App.
- Client-provided prices are ignored; the server calculates every amount.
- New exposed tables use RLS and receive no direct `anon` or `authenticated` policy.
- Changes are additive; old requests remain readable and payable amounts fall back to `tariff_price_snapshot`.

## Review Focus

- A replayed Web submission with the same key and identical add-ons returns one request and one row per add-on; changed add-ons produce `submission_payload_conflict`.
- Decimal 30-percent pricing rounds to whole UZS deterministically and the same total appears in API, Web, bot, notifications, and analytics.
- A malformed domain, 0 or 11 years, empty product name, negative quantity, or negative variant price is rejected without losing entered Web state.
- An old request with no `total_price_snapshot` and no add-on rows still renders, approves, and provisions exactly as before.
- Two admins racing to update one fulfilment item cannot skip statuses or create duplicate history events.

---

### Task 1: Correct admin KPI destinations and responsive hierarchy

**Files:**
- Modify: `platform/platform-app.js` around `renderAdminDashboardTab`, admin filters, and expired-shop rendering
- Modify: `platform/platform.css` admin dashboard, empty-state, and responsive grid rules
- Modify: `platform/index.html` platform asset version query strings
- Create: `tests/ustore-platform-admin-polish.test.cjs`

**Interfaces:**
- Consumes: existing `switchTab`, `setAdminShopsStatusFilter`, `adminShops`, and `ownerTelegramId` fields.
- Produces: `openActiveShopsFromDashboard(): void`, `openAdminOwnersFromDashboard(): void`, `renderAdminOwnersBody(): string`, and stable three/two/one-column layout classes.

- [ ] **Step 1: Write failing admin navigation tests**

Add tests asserting that “Faol do‘konlar” calls `openActiveShopsFromDashboard`, that helper sets `ACTIVE` before switching tabs, “Foydalanuvchilar” opens the owner page rather than settings, owner rows aggregate shops by owner ID, and expired shops use a structured empty state.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/ustore-platform-admin-polish.test.cjs`  
Expected: FAIL because the helpers and owner page do not exist and the users KPI still calls `switchTab('settings')`.

- [ ] **Step 3: Implement the minimal routing and owner aggregation**

Add the two navigation helpers, an `ADMIN_OWNERS` page route, a deterministic owner aggregator over `adminShops`, and an owner list that links back to filtered shop results. Keep server calls unchanged.

- [ ] **Step 4: Add failing responsive-style assertions**

Assert desktop `grid-template-columns:repeat(3,...)`, tablet two-column, mobile one-column, distinct page/card surface tokens, visible focus styling, and no desktop-only horizontal overflow.

- [ ] **Step 5: Implement the CSS and asset version bump**

Use existing design tokens and media-query conventions; update only admin surfaces, grids, and empty/loading states requested by the spec.

- [ ] **Step 6: Verify Task 1 GREEN**

Run: `node --test tests/ustore-platform-admin-polish.test.cjs tests/ustore-platform2-stage2.test.cjs tests/ustore-platform2-completion-pass.test.cjs`  
Expected: all PASS.

- [ ] **Step 7: Commit Task 1**

Run: `git add platform/platform-app.js platform/platform.css platform/index.html tests/ustore-platform-admin-polish.test.cjs`  
Run: `git commit -m "Fix platform admin navigation and layout"`

### Task 2: Add the subscription add-on schema and atomic submission contract

**Files:**
- Create via `npx supabase migration new platform_service_addons`: generated `supabase/migrations/*_platform_service_addons.sql`
- Modify: `supabase/migrations/107_web_subscription_submission.sql` only if the repository’s migration policy requires the canonical RPC source to stay synchronized; otherwise replace the RPC in the new migration only
- Create: `tests/web-integration/platform-service-addons-sql.test.cjs`

**Interfaces:**
- Consumes: `public.subscription_requests`, `public.subscription_request_history`, and `public.ustore_submit_web_subscription(text,text,jsonb,jsonb,uuid)`.
- Produces: `subscription_requests.total_price_snapshot`, `public.subscription_request_addons`, and the same RPC signature extended through `p_values.addons` and `p_values.total_price_snapshot`.

- [ ] **Step 1: Create a failing PGlite migration test**

The test creates the minimum pre-migration schema, applies the generated migration, submits catalogue and domain add-ons, then asserts one request, two unique add-on rows, correct total, replay idempotency, RLS enabled, and revoked public execution.

- [ ] **Step 2: Run the SQL test and verify RED**

Run: `node --test tests/web-integration/platform-service-addons-sql.test.cjs`  
Expected: FAIL because the migration and add-on table do not exist.

- [ ] **Step 3: Generate and implement the additive migration**

Use Supabase CLI `migration new`; add `total_price_snapshot`, backfill existing rows, create the constrained/indexed/RLS-enabled add-on table, and replace the submission RPC so request and add-ons are written in one transaction with `ON CONFLICT (request_id,code)` protection.

- [ ] **Step 4: Add concurrency and legacy fallback cases**

Assert duplicate add-on codes cannot exist, old rows retain tariff total, cancellation cascades add-ons, and replay with changed `web_submission_input` conflicts.

- [ ] **Step 5: Verify Task 2 GREEN**

Run: `node --test tests/web-integration/platform-service-addons-sql.test.cjs tests/web-integration/predeploy-subscription-sql.test.cjs`  
Expected: all PASS.

- [ ] **Step 6: Commit Task 2**

Add the exact CLI-generated migration path and test, then commit: `git commit -m "Add atomic subscription service add-ons"`.

### Task 3: Centralize server-side add-on validation and pricing

**Files:**
- Create: `supabase/functions/_shared/subscription-addons.ts`
- Create: `tests/ustore-platform-service-addons.test.cjs`
- Modify: `scripts/check-edge-syntax.cjs` only if the new shared module is not already discovered automatically

**Interfaces:**
- Produces: `normalizeSubscriptionAddons(input, context): NormalizedSubscriptionAddons`, where context contains `kind`, `tariffPriceSnapshot`, and the result contains `items`, `addonsTotal`, and `totalPrice`.
- Produces normalized item shapes for `CATALOG_SETUP` and `MANAGED_DOMAIN` with whole-UZS numeric totals.

- [ ] **Step 1: Write failing pricing and validation tests**

Cover 30-percent rounding, annual tariff price input, 50,000 × years, 1/10 valid years, 0/11 invalid years, add-ons rejected for upgrades, normalized lowercase domains, invalid domains, empty products, and negative base/variant values.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/ustore-platform-service-addons.test.cjs`  
Expected: FAIL because the shared module does not exist.

- [ ] **Step 3: Implement the pure normalization module**

Keep the module free of database and Telegram dependencies. Use integer UZS arithmetic, bounded text/array lengths, explicit error codes, and normalized JSON safe for database storage.

- [ ] **Step 4: Verify Task 3 GREEN and Edge syntax**

Run: `node --test tests/ustore-platform-service-addons.test.cjs`  
Run: `npm run check:edge`  
Expected: both PASS.

- [ ] **Step 5: Commit Task 3**

Run: `git add supabase/functions/_shared/subscription-addons.ts tests/ustore-platform-service-addons.test.cjs scripts/check-edge-syntax.cjs`  
Run: `git commit -m "Validate subscription service add-ons"`

### Task 4: Integrate totals, responses, notifications, analytics, and fulfilment in Platform API

**Files:**
- Modify: `supabase/functions/platform-api/index.ts`
- Modify: `tests/ustore-platform-service-addons.test.cjs`
- Modify: `tests/ustore-subscriptions.test.cjs`

**Interfaces:**
- Consumes: `normalizeSubscriptionAddons` and the migration contract from Tasks 2–3.
- Produces additive response fields `totalPrice` and `addons`; produces action `platform_admin_update_addon_status` with `{ addonId, expectedStatus, nextStatus, reason? }`.

- [ ] **Step 1: Add failing API contract tests**

Assert submission ignores client price fields, computes normalized add-ons, includes them in idempotency input/RPC values, returns additive response fields, and rejects add-ons for upgrades.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/ustore-platform-service-addons.test.cjs tests/ustore-subscriptions.test.cjs`  
Expected: FAIL on missing API integration.

- [ ] **Step 3: Implement submission, mapping, and financial display integration**

Import the helper; extend request selection/mapping; use `coalesce(total_price_snapshot,tariff_price_snapshot)` semantics in application notifications, receipt captions, request details, and revenue analytics while leaving lifecycle `paidAmount` tariff-only.

- [ ] **Step 4: Add failing fulfilment transition tests**

Assert only Super Admin can update, `PENDING → IN_PROGRESS → COMPLETED` and cancellation are valid, stale `expectedStatus` conflicts, reason is required for cancellation, and one history event is written per successful transition.

- [ ] **Step 5: Implement conditional fulfilment updates**

Update by `id` plus `expectedStatus`, stamp actor/timestamps, and append add-on-specific history metadata. Return 409 for a stale transition.

- [ ] **Step 6: Verify Task 4 GREEN**

Run: `node --test tests/ustore-platform-service-addons.test.cjs tests/ustore-subscriptions.test.cjs`  
Run: `npm run check:edge`  
Expected: all PASS.

- [ ] **Step 7: Commit Task 4**

Run: `git add supabase/functions/platform-api/index.ts tests/ustore-platform-service-addons.test.cjs tests/ustore-subscriptions.test.cjs`  
Run: `git commit -m "Integrate subscription service fulfilment"`

### Task 5: Add premium Web checkout controls and summary

**Files:**
- Modify: `platform/platform-app.js` new-shop checkout state, rendering, validation, submission payload, request cards, and admin request details
- Modify: `platform/platform.css` service cards, product/variant editor, two-column desktop composition, mobile stacking, error/focus states
- Modify: `platform/index.html` asset versions
- Create: `tests/ustore-platform-checkout-services.test.cjs`

**Interfaces:**
- Consumes: additive API fields and error codes from Task 4.
- Produces: `setCatalogSetupSelected`, product/variant edit helpers, `setManagedDomainSelected`, `setManagedDomainYears`, `setManagedDomainName`, `buildCheckoutAddonsPayload`, and fulfilment controls for Super Admin request details.

- [ ] **Step 1: Write failing checkout state and rendering tests**

Assert add-ons render only for new shops; catalogue price is 30 percent; domain price is 50,000 × years; total summary lists every line; upgrade UI remains unchanged; unselected add-ons produce no payload.

- [ ] **Step 2: Run the Web test and verify RED**

Run: `node --test tests/ustore-platform-checkout-services.test.cjs`  
Expected: FAIL because service state and controls do not exist.

- [ ] **Step 3: Implement minimal state, form helpers, and premium layout**

Use stable generated client IDs for unsaved products/variants, preserve entered state across re-renders, keep server amounts authoritative, and expose specific validation messages without clearing inputs.

- [ ] **Step 4: Add failing request/admin rendering tests**

Assert old requests use tariff fallback, new requests show tariff/add-on/total lines, product images warning is present, domain brief is visible, and only allowed fulfilment buttons appear for the current status.

- [ ] **Step 5: Implement request and fulfilment UI**

Call `platform_admin_update_addon_status`, reload request details after success, and preserve existing approve/reject/provision actions.

- [ ] **Step 6: Verify responsive and compatibility tests**

Run: `node --test tests/ustore-platform-checkout-services.test.cjs tests/ustore-task6-platform-and-category-polish.test.cjs tests/ustore-platform2-stage3.test.cjs`  
Expected: all PASS.

- [ ] **Step 7: Commit Task 5**

Run: `git add platform/platform-app.js platform/platform.css platform/index.html tests/ustore-platform-checkout-services.test.cjs`  
Run: `git commit -m "Add premium subscription service checkout"`

### Task 6: Add platform-bot checkout parity

**Files:**
- Modify the Task 2 generated migration to include `platform_bot_checkout_sessions`, or create a second CLI-generated migration `platform_bot_checkout_sessions` if Task 2 has already been committed
- Modify: `supabase/functions/platform-api/index.ts` Telegram webhook command, message, and callback handling
- Create: `tests/ustore-platform-bot-checkout.test.cjs`

**Interfaces:**
- Consumes: public tariff catalogue and the same `normalizeSubscriptionAddons`/submission path as Web.
- Produces: durable per-user bot checkout session with step/data/expiry and callback prefixes under `shop:`.

- [ ] **Step 1: Write failing bot conversation tests**

Cover `/start` purchase action, tariff and period selection, optional service toggles, product and variant collection, explicit product-finish action, domain/year collection, summary, cancellation, expired session recovery, and final API-equivalent payload.

- [ ] **Step 2: Run bot test and verify RED**

Run: `node --test tests/ustore-platform-bot-checkout.test.cjs`  
Expected: FAIL because bot checkout callbacks/session state do not exist.

- [ ] **Step 3: Implement bot session persistence and state transitions**

Use one row per Telegram user, a bounded JSON payload, 24-hour expiry, callback answers for stale buttons, and the existing webhook authentication. Reuse server pricing; do not store secrets or receipt binaries in session JSON.

- [ ] **Step 4: Implement summary and submission parity**

Route final bot submission through the same validation/pricing and database contract as Web, then present payment instructions and existing receipt-upload behavior.

- [ ] **Step 5: Verify bot and webhook regressions**

Run: `node --test tests/ustore-platform-bot-checkout.test.cjs tests/ustore-platform-service-addons.test.cjs tests/ustore-subscriptions.test.cjs`  
Expected: all PASS.

- [ ] **Step 6: Commit Task 6**

Add the generated migration if separate, API, and tests; commit: `git commit -m "Add platform bot shop checkout"`.

### Task 7: Complete verification, migration checks, and release

**Files:**
- Modify only files required by failures found during verification
- Verify: all files from Tasks 1–6

**Interfaces:**
- Consumes: completed implementation and tests.
- Produces: a verified Git commit deployed to the linked Supabase project and Cloudflare Worker.

- [ ] **Step 1: Run focused regression suites**

Run all Task 1–6 commands once more after the final integration.  
Expected: all PASS with no unreported warnings.

- [ ] **Step 2: Run repository-wide checks**

Run: `npm test`  
Run: `npm run test:web`  
Run: `npm run check:edge`  
Run: `npm run lint`  
Expected: all PASS.

- [ ] **Step 3: Validate Supabase migration state and advisors**

Discover exact supported commands with `npx supabase --help`, `npx supabase migration --help`, and `npx supabase db --help`; then verify local/remote migration status and run database/security advisors through CLI or Supabase MCP. Resolve findings related to this change.

- [ ] **Step 4: Build production assets**

Run: `npm run build`  
Expected: production build and performance audit complete successfully.

- [ ] **Step 5: Review the final diff and commit remaining integration fixes**

Run: `git diff --check`, inspect `git status --short`, and commit only tracked task files. Do not add `.agents`, `.claude`, `.codex`, or `graphify-out`.

- [ ] **Step 6: Push and deploy Supabase**

Push the verified branch to the configured GitHub remote. Apply the new migration with the verified Supabase CLI workflow, then deploy `platform-api --no-verify-jwt`. Confirm the function deployment and query the new columns/table through Supabase MCP or a safe read query.

- [ ] **Step 7: Deploy Cloudflare and smoke test**

Run `npx wrangler deploy --config wrangler.saas.jsonc`, record the version ID, then perform read-only smoke checks for the platform admin, Web checkout, and existing storefront entry points.

- [ ] **Step 8: Report evidence**

Report changed files, root causes fixed, migration name/status, test/build results, Git commit/push, Supabase function deployment, Cloudflare version, and any remaining limitation such as registrar purchase remaining manual.
