# @whiteintel/mcp-server

[![npm](https://img.shields.io/npm/v/@whiteintel/mcp-server.svg)](https://www.npmjs.com/package/@whiteintel/mcp-server)
[![CI](https://github.com/Hei33enberg/whiteintel-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Hei33enberg/whiteintel-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f7d4f.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-server-2f7d4f.svg)](https://modelcontextprotocol.io)

**Trace ownership. Expose the network.** A [Model Context Protocol](https://modelcontextprotocol.io)
server that gives any AI agent (Claude Desktop, Cursor, …) **corporate & offshore
ownership intelligence** from [WhiteIntel](https://whiteintel.dev): look up companies,
search entities (companies **and** people) **by name or meaning**, screen sanctions,
and trace ownership chains to the ultimate beneficial owner.

**Freemium** — works anonymously on the free tier, or set `WHITEINTEL_API_KEY` to
authenticate as your plan and lift the limits (see [Configuration](#configuration)).
Forwards to WhiteIntel's public REST API
(`https://whiteintel.dev/api/public/*`) — [OpenAPI spec](https://whiteintel.dev/api/public/openapi.json).

## Install

No install needed — run via `npx`:

```bash
npx -y @whiteintel/mcp-server
```

### Claude Desktop / Cursor

Add to your MCP client config:

```json
{
  "mcpServers": {
    "whiteintel": {
      "command": "npx",
      "args": ["-y", "@whiteintel/mcp-server"],
      "env": { "WHITEINTEL_API_KEY": "wi_…" }
    }
  }
}
```

The `env` block is optional — omit it to use the anonymous free tier.

## Tools

| Tool | What it does |
| --- | --- |
| `lookup_company` | UK company by Companies House number → record + ownership graph (officers, PSCs, parent/subsidiary edges). |
| `search_companies` | Free-text company-name search → registration number. |
| `search_entities` | Search the corpus (companies + people), live + demo investigations → entity ids. |
| `get_entity` | Full record for one entity + its direct relationships. |
| `get_dossier` | Structured, fully-cited dossier: cross-source identity, ownership/UBO chain, risk signals, provenance. Optional `token` (from `claim_dossier`) unlocks the paid depth. |
| `trace_ownership_path` | Walk ownership upward from a root entity to the ultimate beneficial owner. |
| `lookup_by_identifier` | Resolve an entity by a strong id — LEI, OFAC/EU/UN/UK sanctions id, UEN, NIP, SEC CIK, KRS, GB-COH. |
| `get_sanctions` | An entity's sanctions exposure (OFAC/EU/UN/UK) for it and its resolved cluster siblings, with sources. |
| `check_offshore_exposure` | Walk the ownership chain and flag sanctioned + secrecy-jurisdiction hops (offshore-layering lead). |
| `get_company_details` | UK register detail: registered address, status, type, incorporation date, SIC codes + the filing/compliance layer (accounts, overdue flags, charges, former names). |
| `get_financials` | Filed UK financials year-over-year (turnover, profit, net assets, cash, employees) from Companies House iXBRL accounts. |
| `get_pulse` | The live corpus activity feed — recent ownership/control changes, newest first, each sourced; optional `since` cursor to stream only what's new. |
| `resolve` | Batch-resolve a list of names or `scheme:value` ids → canonical entity ids + confidence, in one call (enrich a whole supplier / portfolio list). |
| `semantic_search` | **Meaning-based** entity search (BGE-M3 vector ANN over the resolved dossier cards) — find companies & people whose profile is semantically closest to a natural-language query, even with no keyword match. Complements the lexical `search_entities`. |
| `find_similar` | "More like this" — the corpus entities nearest a given `entity_id` in meaning, for peer discovery and clustering around a known entity. |
| `get_pricing` | The honest price list (one-off dossiers, packs, subscriptions, metered API) + the exact machine flow for buying access. Static, no network call. |
| `buy_dossier` | Start a one-off dossier purchase via guest Stripe Checkout (Standard €39 / Premium €99, optional 5/25 packs) → returns a `checkout_url`. |
| `claim_dossier` | Redeem a paid Checkout session (`session_id`) for a 90-day entity-scoped access `token`. Idempotent. |

All lookup tools are **read-only**; the only side-effectful tools are `buy_dossier` (opens a Stripe Checkout — money moves only when a human completes it) and `claim_dossier` (redeems an already-paid session). Ids flow between tools: `search_entities` / `semantic_search` / `search_companies` / `resolve` / `lookup_by_identifier` return ids → feed them to `get_dossier` / `trace_ownership_path` / `find_similar` / `get_sanctions`.

## Agents can pay

An agent can buy the paid depth of a dossier end-to-end, no WhiteIntel account needed:

1. **`buy_dossier`** `{ tier: "standard" | "premium", entity_id }` → returns a Stripe `checkout_url`. Standard (€39) unlocks the full multi-hop UBO chain + year-over-year financial history; Premium (€99) additionally unlocks itemised assets (vessels, aircraft, securities, real estate). Packs of 5/25 grant reusable report credits.
2. A **human (or payment-capable agent) completes payment** at the `checkout_url` — Stripe collects an email and redirects back to whiteintel.dev with `?session_id=cs_…`.
3. **`claim_dossier`** `{ session_id }` → `{ token, entity_id, tier }`. Idempotent; returns `402 not_paid` until payment completes.
4. **`get_dossier`** `{ id, token }` → the unlocked, fully-cited dossier JSON. Tokens are entity-scoped and valid for 90 days.

Check **`get_pricing`** first — it returns the full price list plus this flow in machine-readable form.

## Data & honesty

- **Live corpus:** sanctions (OFAC SDN, EU, UN, UK), GLEIF (LEI), ICIJ Offshore
  Leaks, SEC EDGAR, OpenOwnership (UK PSC), plus live UK Companies House lookup —
  cross-source-resolved (a sanctioned party linked to its offshore/registry records).
- **Demo:** three worked investigations — Meridian (BVI UBO chain), Tideway
  (sanctions exposure), Ardent (VAT-carousel) — flagged `source: "demo"`.
- **Semantic search** (`semantic_search` / `find_similar`) runs over resolved dossier
  cards; coverage grows as the embedding backfill completes, so meaning-based hits can
  be sparse until then — lexical `search_entities` always covers the full corpus.
- An absent edge means "not yet observed", not "does not exist".
- Investigative **decision-support**, not a legal determination of beneficial ownership.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `WHITEINTEL_API_KEY` | _(none)_ | Optional `wi_` key (whiteintel.dev → Settings → API keys). Forwarded as a Bearer token to authenticate as your plan and lift free-tier limits. |
| `WHITEINTEL_API_BASE` | `https://whiteintel.dev` | API origin (SSRF-guarded to whiteintel.dev hosts). |
| `WHITEINTEL_TIMEOUT_MS` | `30000` | Per-request timeout. |

## License

MIT © whiteintel.dev
