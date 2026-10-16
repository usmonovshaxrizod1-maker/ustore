# UStorE platform admin and subscription services design

**Date:** 2026-10-16  
**Status:** proposed for implementation  
**Source:** “Документ Microsoft Word (3).docx” and its six screenshots

## Purpose

This change makes the UStorE platform administration area easier to operate and adds two optional paid services to the new-shop subscription checkout:

1. UStorE staff can enter the shop information and product catalogue for the owner.
2. UStorE can purchase and connect a custom domain for the owner.

The checkout must show the complete payable amount before submission. The server remains the sole authority for tariff and add-on prices. Existing subscription, payment, provisioning, domain, and shop-management behavior remains compatible.

## Scope

### Admin navigation and layout

- The Dashboard “Faol do‘konlar” KPI opens the Do‘konlar tab with the `ACTIVE` status filter already selected.
- The Dashboard “Foydalanuvchilar” KPI opens a dedicated owner list derived from the authoritative shop list. It must never open Sozlamalar.
- The owner list groups shops by `ownerTelegramId` and shows shop count, active shop count, and linked shop names without introducing a second user database.
- The expired-shops page gets a proper heading, summary, useful empty state, and cards that visually separate from the page background.
- Dashboard operational cards use three columns on desktop, two on tablet, and one on mobile. They preserve keyboard focus and button semantics.
- Admin Dashboard, Do‘konlar, Support, and related empty/loading states use consistent surfaces, spacing, contrast, typography, and responsive behavior.
- Existing admin actions, filters, shop tables, support tickets, tariff settings, and permissions are preserved.

### Optional service A: catalogue setup

- This add-on is available only while purchasing a `NEW_SHOP` subscription.
- Its one-time price is exactly 30 percent of the selected tariff price for the selected billing period.
- Selecting it opens a clear explanation that UStorE staff will enter the supplied shop and product data once.
- The owner can provide structured product entries. Each product supports:
  - name;
  - description;
  - base price;
  - base quantity;
  - optional colours and sizes;
  - optional variants, each with its own colour, size, quantity, and price.
- Product images are not collected by platform staff. The UI explicitly tells the owner to upload images later in Shop App so an image cannot be attached to the wrong product.
- The existing new-shop name and bot identity fields remain the source for basic shop identity. The add-on stores only the additional catalogue brief.
- The checkout may contain zero or more product drafts, but selecting this add-on requires at least one product with a non-empty name and a valid non-negative price and quantity before submission.

### Optional service B: managed domain

- This add-on is available only while purchasing a `NEW_SHOP` subscription.
- It costs 50,000 UZS per year.
- The owner selects between 1 and 10 years; the total is calculated as `50,000 × years`.
- The checkout explains that UStorE will purchase and connect the domain after payment approval.
- The owner supplies the requested domain name. It is normalized and validated server-side, but availability is not promised until staff completes the purchase.
- This service does not replace the existing self-service domain connection feature. It creates a staff fulfilment task.

## Pricing and financial truth

- `tariff_price_snapshot` continues to mean the paid subscription tariff price only. Existing lifecycle and subscription-day calculations continue to use it.
- A new `total_price_snapshot` stores the total charged amount: tariff plus all selected add-ons.
- Add-on prices are computed in `platform-api` from the current tariff row and fixed service rules. Client-provided prices are ignored.
- Payment instructions, receipt captions, request cards, request details, and platform revenue analytics use `total_price_snapshot` when present and fall back to `tariff_price_snapshot` for old rows.
- Subscription history records the tariff payment separately from add-on fulfilment, so add-on revenue cannot accidentally extend subscription days.

## Data model

Add `total_price_snapshot numeric` to `subscription_requests` and backfill it from `tariff_price_snapshot`.

Create `subscription_request_addons`:

- `id uuid primary key`;
- `request_id uuid` referencing `subscription_requests(id)` with cascade deletion;
- `code text` constrained to `CATALOG_SETUP` or `MANAGED_DOMAIN`;
- `quantity integer` greater than zero;
- `unit_price numeric` non-negative;
- `total_price numeric` non-negative;
- `details jsonb` containing the normalized catalogue brief or requested domain;
- `status text` constrained to `PENDING`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`;
- fulfilment audit fields: `handled_by`, `started_at`, `completed_at`, `created_at`, and `updated_at`;
- unique constraint on `(request_id, code)`;
- indexes on `(status, created_at)` and `request_id`.

The table has RLS enabled and no direct `anon` or `authenticated` policies. All access goes through the existing authenticated Edge Function and service-role database client. Existing security-definer submission RPC remains revoked from public roles and executable only by `service_role`.

## Submission and idempotency

- The Web submission key continues to identify one logical checkout attempt.
- Add-on choices and normalized details are included in `web_submission_input`; replay with different add-ons produces the existing payload-conflict response.
- `ustore_submit_web_subscription` writes the request total and both add-on rows in the same database transaction.
- A repeated submission with the same key returns the existing request and does not duplicate add-on rows.
- The API rejects add-ons on `UPGRADE`, invalid domain years, malformed domain names, invalid products, and totals that do not match server calculation.
- Cancelling an unpaid request removes its add-on rows through the foreign-key cascade.

## Admin fulfilment

- Subscription request cards and details display tariff price, add-on lines, and the complete total.
- Request details contain a “Qo‘shimcha xizmatlar” section with the supplied catalogue/domain information.
- After payment approval, a Super Admin can move each add-on from `PENDING` to `IN_PROGRESS` and then `COMPLETED`; cancellation requires a reason.
- Every status change writes a `subscription_request_history` event containing add-on code, previous status, new status, actor, and reason where applicable.
- Add-on fulfilment never activates a subscription or changes shop lifecycle state.

## Web checkout design

- The new-shop checkout is divided into clear surfaces: shop identity, tariff period, optional services, payment method, and total.
- Page and card backgrounds use distinct design tokens; nested cards do not merge visually with their parent.
- Optional services appear as selectable premium cards with concise pricing and a disclosure area for their fields.
- The sticky/summary area shows tariff, each selected add-on, and the final payable amount.
- Telegram ID recovery keeps automatic detection first and gives one clear bot deep-link when detection is unavailable. Manual entry remains as fallback.
- The layout uses one column on mobile and a readable two-column checkout/summary composition on wide desktop screens. No horizontal overflow is introduced.

## Platform bot flow

- The bot presents the same two optional services after tariff and billing-period selection for a new shop.
- It collects catalogue products one at a time with an explicit “Mahsulot qo‘shishni tugatish” action and collects variants only when requested.
- It collects domain name and years for the managed-domain service.
- The bot submits the same API payload as Web and never calculates authoritative prices locally; it displays values returned or derived from the server tariff catalogue and the fixed service rules validated by the server.
- Existing upgrade/renewal bot flows are unchanged.

## Error handling

- Validation errors identify the specific add-on field and keep the user’s entered values.
- A failed request submission can be retried with the same submission key.
- If receipt upload or payment confirmation fails, the already-created request and add-ons remain recoverable through the existing request screen.
- Admin status updates use conditional current-status checks to prevent duplicate or out-of-order fulfilment.

## Compatibility and migration

- Old requests receive `total_price_snapshot = tariff_price_snapshot` and have no add-on rows.
- Existing API response fields remain unchanged; `totalPrice` and `addons` are additive.
- Existing frontend callers that do not send add-ons continue to work.
- The migration is additive and reversible by leaving old rows readable even if the new UI is rolled back.

## Verification

Automated tests must cover:

- Dashboard KPI routing and active filter selection.
- Dedicated owner list aggregation and navigation.
- Responsive three/two/one-column admin layout selectors.
- Server-side 30 percent catalogue-service pricing.
- Managed-domain `50,000 × years` pricing and year limits.
- Rejection of client price tampering and add-ons on upgrades.
- Atomic/idempotent request plus add-on insertion.
- Old-request fallback when `total_price_snapshot` is absent.
- Admin add-on status transitions and history records.
- Web checkout summary and validation.
- Bot flow payload parity.
- Existing subscription, payment, provisioning, and platform tests.

Before deployment, run the focused tests, the full project test command, production build, migration verification, and Supabase database/security advisors. Deploy only after all required checks pass.

## Explicit non-goals

- Staff do not upload or assign product images.
- The managed-domain add-on does not automatically purchase a domain through a registrar API in this release.
- No existing shop, order, authentication, or custom-domain routing behavior is replaced.
- No unrelated admin panel rewrite or framework migration is included.
