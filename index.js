#!/usr/bin/env node
/**
 * WhiteIntel MCP server — corporate & offshore ownership intelligence.
 *
 * Exposes WhiteIntel's public REST API (https://whiteintel.dev/api/public/*) as
 * Model Context Protocol tools: resolve UK companies into ownership graphs,
 * search the corpus of companies and people, and trace ownership chains to the
 * ultimate beneficial owner.
 *
 * Data: live UK Companies House (company + officer + PSC lookup) plus three
 * fully-worked demo investigations. The offshore corpus (ICIJ Offshore Leaks
 * et al.) is on the roadmap and is clearly flagged when absent.
 *
 * Freemium. Without a key, calls hit the anonymous free tier. Set WHITEINTEL_API_KEY
 * (a wi_… key from whiteintel.dev → Settings → API keys) to authenticate as your
 * plan and lift free-tier limits — it's forwarded as a Bearer token. Stdio transport.
 * Add to an MCP client (Claude Desktop, Cursor) with:
 *   { "command": "npx", "args": ["-y", "@whiteintel/mcp-server"],
 *     "env": { "WHITEINTEL_API_KEY": "wi_…" } }   // env optional (free tier without it)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { resolveBase, qs } from "./lib.js";

const REQUEST_TIMEOUT_MS = Number(process.env.WHITEINTEL_TIMEOUT_MS) || 30_000;
const API_BASE = resolveBase(process.env.WHITEINTEL_API_BASE);
// Optional wi_ API key — when present, forwarded as a Bearer token so the caller is
// authenticated as their plan and metered per-key (instead of the anonymous tier).
const API_KEY = (process.env.WHITEINTEL_API_KEY || "").trim();

async function apiGet(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const headers = { accept: "application/json", "user-agent": "whiteintel-mcp-server" };
  if (API_KEY) headers.authorization = `Bearer ${API_KEY}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(
      e?.name === "AbortError"
        ? `request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `network error: ${e?.message ?? e}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error(`whiteintel-mcp-server: upstream ${res.status} for ${path}`);
    const detail = body && typeof body === "object" ? (body.error || body.detail || body.message) : null;
    // Only 5xx / 429 are worth retrying — surface the actionable reason for the rest
    // (400 bad request, 404 not found, 429 quota) so the agent doesn't blindly retry.
    if (res.status >= 500 || res.status === 429) {
      const ra = res.headers.get("retry-after");
      throw new Error(
        `The WhiteIntel API is temporarily unavailable (${res.status}${detail ? `: ${detail}` : ""}).` +
          (ra ? ` Retry after ${ra}s.` : " Please retry shortly."),
      );
    }
    throw new Error(`The WhiteIntel API rejected the request (${res.status}${detail ? `: ${detail}` : ""}).`);
  }
  return body;
}

const TOOLS = [
  {
    name: "lookup_company",
    description:
      "Look up a UK company by its Companies House registration number and return the company record plus a ready-built ownership graph (officers, persons of significant control, parent/subsidiary edges). Pass the number verbatim — do not strip leading zeros (e.g. 09446231, SC123456).",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", maxLength: 20, description: "UK Companies House registration number." },
      },
      required: ["number"],
    },
    handler: (a) => apiGet(`/api/public/company/${encodeURIComponent(String(a.number).trim())}`),
  },
  {
    name: "search_companies",
    description:
      "Free-text company-name search against UK Companies House. Use this to resolve a company NAME into the registration number that lookup_company needs.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", maxLength: 200, description: "Company name or fragment." },
        limit: { type: "number", minimum: 1, maximum: 50, description: "Max results (default 8)." },
      },
      required: ["q"],
    },
    handler: (a) => apiGet(`/api/public/company/search${qs({ q: a.q, limit: a.limit ?? 8 })}`),
  },
  {
    name: "search_entities",
    description:
      "Search every node in the WhiteIntel corpus — companies AND people — by name, across live data and the seeded demo investigations (Meridian, Tideway, Ardent). Returns entity ids you then pass to get_entity or trace_ownership_path. Each hit is flagged with its source.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", maxLength: 200, description: "Entity name or fragment." },
        limit: { type: "number", minimum: 1, maximum: 50, description: "Max results (default 20)." },
        type: { type: "string", enum: ["company", "person", "asset"], description: "Optional: filter by entity kind." },
        juris: { type: "string", maxLength: 8, description: "Optional: filter by jurisdiction code (e.g. gb, ky, us)." },
        risk: { type: "string", enum: ["HIGH", "MED", "LOW"], description: "Optional: filter by risk level." },
      },
      required: ["q"],
    },
    handler: (a) => apiGet(`/api/public/entity/search${qs({ q: a.q, limit: a.limit ?? 20, type: a.type, juris: a.juris, risk: a.risk })}`),
  },
  {
    name: "get_entity",
    description:
      "Full record for one entity by id: type (company/person), identifiers, jurisdiction, risk level, summary and its direct relationships with provenance. Get the id from search_entities or lookup_company.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 80, description: "Entity id." },
      },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/entity/${encodeURIComponent(String(a.id).trim())}`),
  },
  {
    name: "get_dossier",
    description:
      "Build a structured, fully-cited intelligence dossier for one entity by id: identity with cross-source linked records (the same real-world entity resolved across ICIJ leaks, GLEIF, registries), ownership/control (direct owners, holdings, and the UBO chain), risk signals, and provenance on every layer. Every claim traces to a source URL. Use this for 'tell me everything about X'. Get the id from search_entities.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 80, description: "Entity id (from search_entities)." },
      },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/dossier/${encodeURIComponent(String(a.id).trim())}`),
  },
  {
    name: "trace_ownership_path",
    description:
      "Walk the ownership graph upward from a root entity, up to max_depth hops, and return the ordered chain(s) connecting it to the ultimate beneficial owner. Use this to answer 'who ultimately controls X?'. Get the root id from search_entities.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", maxLength: 80, description: "Root entity id to trace from." },
        max_depth: { type: "number", minimum: 1, maximum: 10, description: "Max hops to walk (default 6)." },
      },
      required: ["root"],
    },
    handler: (a) => apiGet(`/api/public/ownership-path${qs({ root: a.root, max_depth: a.max_depth ?? 6 })}`),
  },
  {
    name: "lookup_by_identifier",
    description:
      "Resolve an entity by a strong external identifier instead of a name — a LEI, OFAC SDN uid, EU/UN/UK sanctions id, Singapore UEN, Polish NIP, SEC CIK, Polish KRS, or UK Companies House number. Returns the single resolved entity (id, type, jurisdiction, identifier, risk) so you can pivot into get_entity / get_dossier / get_sanctions. Use this when you already hold a registry id and want the corpus node behind it.",
    inputSchema: {
      type: "object",
      properties: {
        scheme: {
          type: "string",
          enum: ["lei", "ofac", "eu", "un", "uk", "uen", "nip", "sec", "krs", "gb-coh"],
          description: "Identifier scheme: lei | ofac | eu | un | uk | uen | nip | sec | krs | gb-coh.",
        },
        value: { type: "string", maxLength: 100, description: "The identifier value (e.g. an LEI, an OFAC SDN uid, a Companies House number)." },
      },
      required: ["scheme", "value"],
    },
    handler: (a) => apiGet(`/api/public/by-identifier${qs({ scheme: a.scheme, value: a.value })}`),
  },
  {
    name: "get_sanctions",
    description:
      "Return an entity's sanctions exposure: every 'sanctioned' risk signal (OFAC SDN, EU, UN, UK lists) for the entity AND its resolved cluster siblings — each with the list, regime, source list and a source URL. Tells you whether an entity, or anything cross-source-resolved to the same real-world party, is on a public sanctions list. Get the id from search_entities or lookup_by_identifier.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 80, description: "Entity id." },
      },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/sanctions/${encodeURIComponent(String(a.id).trim())}`),
  },
  {
    name: "check_offshore_exposure",
    description:
      "Walk the ownership chain upward from an entity and flag, hop by hop, whether each node is sanctioned and/or sits in a secrecy jurisdiction (classic tax-haven / offshore-secrecy country). Returns the chain, a boolean `exposed`, and the flagged hops — the offshore-layering lead behind 'does this entity sit on a sanctioned or secrecy-jurisdiction ownership chain?'. Get the id from search_entities or lookup_by_identifier.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 80, description: "Entity id to assess." },
        max_depth: { type: "number", minimum: 1, maximum: 6, description: "Max ownership hops to walk (default 6)." },
      },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/offshore-exposure/${encodeURIComponent(String(a.id).trim())}${qs({ max_depth: a.max_depth ?? 6 })}`),
  },
  {
    name: "get_company_details",
    description:
      "Companies House register detail for a UK company by entity id: registered address, status, company type, incorporation date, SIC industry codes, and the filing/compliance layer — accounts type, last-filed and next-due dates (flagged when OVERDUE), confirmation-statement status, outstanding mortgage charges, and former ('also known as') names. Use this for 'where is X registered / what does it file / is it overdue / what was it called before'. Get the id from search_entities or lookup_by_identifier.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", maxLength: 80, description: "Entity id (a UK company)." } },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/company-details/${encodeURIComponent(String(a.id).trim())}`),
  },
  {
    name: "get_financials",
    description:
      "Filed financial figures for a UK company by entity id, year-over-year, from Companies House iXBRL accounts: turnover, profit/(loss), net assets, cash, shareholder funds, fixed/current assets, and employee count per reporting period. Use this for 'what are X's revenue / profit / net assets / how many employees'. Coverage is uneven — balance-sheet items and employees are broad, but turnover/profit are sparse because micro-entities file no profit-and-loss account. Get the id from search_entities.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", maxLength: 80, description: "Entity id (a UK company)." } },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/financials/${encodeURIComponent(String(a.id).trim())}`),
  },
  {
    name: "get_pulse",
    description:
      "The WhiteIntel Pulse activity feed: recent ownership / control changes across the corpus, newest first, each with a source registry. Use this to answer 'what changed recently / any recent ownership movements' or to monitor the corpus. Optional kind filter (ownership | officer | filing | sanction | asset | status).",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["ownership", "officer", "filing", "sanction", "asset", "status"], description: "Optional: filter by event kind." },
        limit: { type: "number", minimum: 1, maximum: 100, description: "Max events (default 40)." },
      },
    },
    handler: (a) => apiGet(`/api/public/pulse${qs({ kind: a.kind, limit: a.limit ?? 40 })}`),
  },
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const server = new Server(
  { name: "whiteintel-mcp-server", version: "0.4.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOL_BY_NAME[req.params.name];
  if (!tool) {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
  }
  try {
    const result = await tool.handler(req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }] };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs (stdout is the MCP transport).
  console.error(`whiteintel-mcp-server running on stdio · ${TOOLS.length} tools · API ${API_BASE} · ${API_KEY ? "keyed" : "anonymous (free tier)"}`);
}

main().catch((err) => {
  console.error("whiteintel-mcp-server fatal:", err);
  process.exit(1);
});
