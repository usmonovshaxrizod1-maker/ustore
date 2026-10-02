# Web fixture policy

Fixtures are deterministic local/demo data for UI and contract tests only. They are not claims about production rows.

- B1: `context/`, `auth/`, `catalog/`.
- B2: `cart/`, `orders/`, `payment/`, `profile/`, `favorites/`, `support/`, `admin/`, `domain/`, `platform/`.
- Domain fixtures use only `.example` hostnames/records.
- Production builds must not select these fixtures as an auth/admin success path.
