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
 * Free & open, no auth. Stdio transport. Add to an MCP client (Claude Desktop,
 * Cursor) with:  { "command": "npx", "args": ["-y", "@whiteintel/mcp-server"] }
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

async function apiGet(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { accept: "application/json", "user-agent": "whiteintel-mcp-server" },
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
    // Internal detail to stderr only; user-facing message stays generic.
    console.error(`whiteintel-mcp-server: upstream ${res.status} for ${path}`);
    throw new Error(`The WhiteIntel API returned an error (${res.status}). Please retry shortly.`);
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
      },
      required: ["q"],
    },
    handler: (a) => apiGet(`/api/public/entity/search${qs({ q: a.q, limit: a.limit ?? 20 })}`),
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
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const server = new Server(
  { name: "whiteintel-mcp-server", version: "0.2.0" },
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
  console.error(`whiteintel-mcp-server running on stdio · ${TOOLS.length} tools · API ${API_BASE}`);
}

main().catch((err) => {
  console.error("whiteintel-mcp-server fatal:", err);
  process.exit(1);
});
