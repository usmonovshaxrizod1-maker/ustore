# Checkout, delivery threshold and guest orders

User-approved scope: fix checkout first, then threshold, then optional guest
checkout/tracking and confirmation UI. Preserve authentication and existing
payment providers. No real orders/payments in production verification.

1. Receipt/validation regression tests; pre-save private receipt before stock
   reservation; attach receipt and fulfillment in an atomic database wrapper.
   Preserve retry key and form draft, show exact invalid field/step and upload
   state. Verify storage metadata and ownership, fail before order creation.
2. Normalize optional strict subtotal threshold in `ustore-commerce.js` and
   shop API; expose controls in existing delivery settings and eligibility in
   checkout. Recheck discounted authoritative subtotal in the transaction.
3. Normalize disabled-by-default guest/contact settings; separate public,
   tenant-resolved guest create/tracking endpoints. No accounts or fake users.
   Nullable guest owner, secure unique ten-digit code, service-only atomic RPC,
   persistent server rate limits and private tracking projection.
4. Existing shared Shop UI + frame bridge: guest choice/form/tracking,
   settings, accessible responsive confirmation and genuine contacts.
5. Targeted Node/PGlite/security tests, browser fixture checks and production
   build. Inspect diff and migration before applying. Push main, apply reviewed
   migration, deploy affected Supabase functions and Cloudflare assets; verify
   read-only production endpoints and GitHub Pages build.

Root cause confirmed: legacy shared `create_order` calls `place_order` before
uploading the receipt and cancels on upload failure. Receipt preview only
proves local object URL exists, not server storage success. Final validation
reads hidden/repopulated live controls rather than a stable checkout draft and
uses a generic error without revealing the offending step.
