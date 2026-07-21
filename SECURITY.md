# Security policy

## Reporting a vulnerability

Email **intel@whiteintel.dev** with details. Please do not open a public issue for
security reports. We aim to acknowledge within 72 hours.

## Scope & design notes

- This package is a thin stdio client for WhiteIntel's **public REST API**
  (`https://whiteintel.dev/api/public/*`). It stores nothing locally and executes
  nothing from API responses.
- **Egress is SSRF-guarded**: requests only ever go to whiteintel.dev hosts
  (`WHITEINTEL_API_BASE` is validated).
- The only credential it can carry is your optional `wi_` API key, forwarded as a
  Bearer token over HTTPS. Treat it like a password; rotate it at
  whiteintel.dev → Settings → API keys.
- The embedded Supabase key used by `buy_dossier`/`claim_dossier` is the **public
  anonymous (publishable) key** — the same one every browser client ships. It grants
  no privileged access.
- Lookup tools are read-only. The only side-effectful tools are `buy_dossier`
  (opens a Stripe Checkout — money moves only when a human completes payment) and
  `claim_dossier` (redeems an already-paid session).

## Supported versions

Only the latest published version receives fixes.
