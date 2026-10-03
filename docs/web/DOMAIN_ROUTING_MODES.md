# Shop routing deployment modes

`wrangler.jsonc` is the default production configuration. It routes `ustr.uz/*`
and `*.ustr.uz/*` to `ustore-web`, which works before Cloudflare for SaaS is
enabled. Use `npx wrangler deploy` for this mode. Keep
`USTORE_CUSTOM_DOMAIN_ROUTING_READY=false` while customer-owned domains cannot
reach the Worker.

`wrangler.saas.jsonc` is reserved for the later Cloudflare for SaaS rollout. Its
`*/*` route also captures customer-owned custom hostnames, but Cloudflare rejects
it with error 10022 until Cloudflare for SaaS is enabled for the `ustr.uz` zone.
After the fallback origin, custom hostname support, DNS target, and Worker route
are configured and checked, deploy with
`npx wrangler deploy --config wrangler.saas.jsonc`. Only then enable
`USTORE_CUSTOM_DOMAIN_ROUTING_READY=true` in Supabase.

Cloudflare setup: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/
