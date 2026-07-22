# Changelog

## 0.7.0 — 2026-07-22

- **Semantic (meaning-based) retrieval.** Two new tools over the corpus-RAG dossier
  cards: `semantic_search` (BGE-M3 vector ANN — find companies/people whose profile is
  closest to a natural-language query, even with no keyword match; complements the lexical
  `search_entities`) and `find_similar` ("more like this" around a known `entity_id`).
  Both return `entity_id, caption, kind, jurisdiction, risk` + a similarity score. Coverage
  grows as the embedding backfill runs — results may be sparse until then.

## 0.6.0 — 2026-07-21

- **Agents can pay.** Three new tools drive a one-off dossier purchase end-to-end:
  `get_pricing` (the honest static price list + the machine buy-flow),
  `buy_dossier` (guest Stripe Checkout — Standard €39 / Premium €99, packs of
  5/25 — returns a `checkout_url` a human or payment-capable agent completes)
  and `claim_dossier` (redeems the paid `session_id` for a 90-day entity-scoped
  access token; idempotent, `402 not_paid` until payment lands).
- `get_dossier` accepts an optional `token`: a claimed Standard token unlocks
  the full multi-hop UBO chain + year-over-year financial history for that
  entity; a Premium token additionally unlocks itemised assets (vessels,
  aircraft, securities, real estate). 13 → 16 tools.

## 0.5.1 — 2026-07-16

- `get_pulse` gains an optional `since` (ISO-8601) sync cursor: poll it with the
  `next_since` from your last response to stream only newly-ingested events — the
  changes-feed you monitor the corpus against.

## 0.5.0 — 2026-07-16

- New `resolve` tool: batch-resolve a list of company names or `scheme:value`
  identifiers to canonical entity ids + confidence in one call — enrich a whole
  supplier / counterparty / portfolio list without one lookup per row.
- `lookup_by_identifier` now accepts the `siren` scheme (French SIREN).
- Rolls up the previously-unpublished 0.4.0 tools — `get_company_details`
  (registered address / status / SIC / filing & compliance), `get_financials`
  (turnover / profit / net assets / cash / employees, year-over-year) and
  `get_pulse` (the live corpus activity feed). 9 → 13 tools.

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
