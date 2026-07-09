# Changelog

## 0.3.2 — 2026-07-09

- `search_entities` now accepts optional `type` (company/person/asset), `juris`
  and `risk` filters, matching the REST endpoint and the published docs.
- Better error handling: 4xx responses surface the API's actual reason instead
  of a generic "retry shortly", and only 5xx/429 advise a retry (echoing
  `Retry-After`). Agents no longer blindly retry a 400/404.

## 0.3.x — 2026-06/07

Grew to 9 tools (added `get_dossier`, `get_sanctions`, `get_offshore_exposure`,
`lookup_company` variants) and an optional `WHITEINTEL_API_KEY` (Bearer `wi_`)
that attributes usage to your account/plan; the anonymous free tier still works
with a monthly allowance.

## 0.1.0 — 2026-06-19

Initial release. Stdio MCP server exposing WhiteIntel's public API as 5 tools:
`lookup_company`, `search_companies`, `search_entities`, `get_entity`,
`trace_ownership_path`. Forwards to `https://whiteintel.dev/api/public/*`
(SSRF-guarded base, 30s timeout). Free & open, no auth.
