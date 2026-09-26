# Web service boundary

UI imports ports/provider, never Supabase tables directly.

- `ports/`: contract wrappers shared by mock/live adapters.
- `mock/`: local/demo adapters only.
- `live/`: reserved for Astra live adapters.
- `provider.js`: explicit selector. `runtime=production` + `mode=mock` is rejected; live mode never silently falls back to mock.

Live adapters remain pending Astra and must satisfy the same contract tests before integration.
