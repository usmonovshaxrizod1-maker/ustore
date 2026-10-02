# UStorE production/staging environment names — 10a

Only variable **names and purpose** are documented here. Real secret values must stay in the deployment secret manager / Supabase Edge Function secrets and must not be committed or placed in handoff ZIPs.

## Edge/server runtime

| Name | Secret? | Purpose |
|---|---:|---|
| `SUPABASE_URL` | No | Supabase project URL used by Edge functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Server-only service role credential. |
| `USTORE_BOT_TOKEN_MASTER_KEY` | **Yes** | Encryption key for stored bot/provider credentials. |
| `USTORE_SUPER_ADMIN_ID` | Sensitive identifier | Platform Super Admin authority source. |
| `USTORE_PLATFORM_BOT_TOKEN` | **Yes** | Central Telegram bot token. |
| `USTORE_PLATFORM_BOT_USERNAME` | No | Central bot username for browser Telegram auth. |
| `PLATFORM_MINI_APP_URL` | No | Central platform Mini App URL. |
| `SHOP_MINI_APP_BASE_URL` | No | Base URL for shop Mini App links. |
| `USTORE_BASE_HOSTNAME` | No | Confirmed owned central platform hostname. Leave unset until ownership is verified. |
| `WEB_APP_BASE_URL` | No | Central web base URL used by auth. |
| `WEB_AUTH_CENTRAL_URL` | No | Central auth/handoff origin URL. |
| `WEB_AUTH_ALLOWED_ORIGINS` | No, security-critical | Exact browser origins accepted by web auth. |
| `CLOUDFLARE_API_TOKEN` | **Yes** | Custom-hostname provider credential. |
| `CLOUDFLARE_ZONE_ID` | Sensitive config | Zone used for custom hostname provisioning. |
| `USTORE_WILDCARD_READY` | No | Explicit feature flag proving wildcard routing is configured. |
| `USTORE_CUSTOM_DOMAIN_MINI_APP_ENABLED` | No | Explicit feature flag for custom-domain Telegram Mini App targeting. |
| `USTORE_PLATFORM_CRON_SECRET` | **Yes** | Platform/trash cron authentication. |
| `USTORE_BILLZ_CRON_SECRET` | **Yes** | BILLZ sync cron authentication. |
| `USTORE_REPORT_EXPORT_CRON_SECRET` | **Yes** | Report export cleanup cron authentication. |
| `CRON_SHARED_SECRET` | **Yes** | Legacy/shared cron authentication where still used. |
| `BOSS_SHARED_SECRET` | **Yes** | Legacy privileged server integration secret. |
| `EXCEL_TEMPLATE_BUCKET` | No | Storage bucket name for Excel templates. |
| `AZURE_TRANSLATOR_ENDPOINT` | No | Optional translator endpoint. |
| `AZURE_TRANSLATOR_KEY` | **Yes** | Optional translator credential. |
| `AZURE_TRANSLATOR_REGION` | No | Optional translator region. |

## Public browser config

`config.public.js` may contain only publishable values such as `SUPABASE_URL`, the Supabase publishable/anon key, bucket names, and confirmed public hostname. Never place service-role keys, bot tokens, encryption keys, provider API tokens, cron secrets, or passwords there.

## 10a staging-smoke helper variables

These are local/CI runner inputs, not application secrets:

- `USTORE_STAGING_WEB_URL`
- `USTORE_STAGING_PLATFORM_API_URL`
- `USTORE_STAGING_EXPECTED_HOST` (optional)

## 10b release-operator helper variables

These are local/CI/operator runner inputs, not application runtime secrets and are intentionally excluded from `supabase/.env.example` runtime coverage:

- `USTORE_10B_EVIDENCE_FILE`
- `USTORE_10B_EXECUTION_APPROVED`
- `USTORE_PRODUCTION_WEB_URL`
- `USTORE_PRODUCTION_PLATFORM_API_URL`
- `USTORE_PRODUCTION_EXPECTED_HOST` (optional)

They must never contain service-role keys, provider tokens or passwords. The evidence file stores references/sign-offs only.
