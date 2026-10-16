import { mock } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Helpers for testing Zendesk tools through the MCP protocol against a stubbed Zendesk. Not
 * imported by any production code. Everything is synthetic — the repo is public — and no test
 * built on this reaches a network.
 */

export const ENV = { ZD_SUBDOMAIN: "example-test", ZD_API_EMAIL: "service-user@example.test", ZD_API_TOKEN: "secret-token-value" };
export const HOST = "example-test.zendesk.com";

let callerCount = 0;
/** A new caller each time: the client keeps a request budget per person, shared across tests. */
export function newCaller() {
  callerCount += 1;
  return {
    clerkId: `user_kit_${callerCount}`,
    isAdmin: true,
    mongoUser: { email: `kit${callerCount}@example.test`, type: "admin", timezone: "UTC", permissions: {} },
    clientId: "test-client",
    requestId: "test",
  };
}
export const lastCallerId = () => `user_kit_${callerCount}`;

/** An in-memory client connected to a server with `register(server, caller)` applied. */
export async function connect(register) {
  const server = new McpServer({ name: "t", version: "1" });
  register(server, newCaller());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** Call one tool on a fresh server; return the result and the text of its first block. */
export async function call(register, name, args) {
  const client = await connect(register);
  try {
    const result = await client.callTool({ name, arguments: args });
    return { result, text: result.content?.[0]?.text ?? "" };
  } finally {
    await client.close();
  }
}

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A page the way Zendesk's cursor-paged endpoints answer. */
export const cursorPage = (key, rows, { hasMore = false, cursor = "Y3Vyc29yLTE=" } = {}) => ({
  [key]: rows,
  meta: { has_more: hasMore, after_cursor: hasMore ? cursor : null },
  links: { next: hasMore ? "https://example-test.zendesk.com/api/v2/x?page%5Bafter%5D=x" : null },
});

/** Run `fn` with fake Zendesk credentials in the environment and `fetch` answered by `route(url, init)`. */
export async function withZendesk(route, fn, env = ENV) {
  const keys = Object.keys(ENV);
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, env);
  const calls = [];
  const stub = mock.method(globalThis, "fetch", async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, init });
    return route(parsed, init);
  });
  try {
    return await fn(calls);
  } finally {
    stub.mock.restore();
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

/** The fenced payload, parsed: its id, its sections of JSON lines, and the text on either side. */
export function parseFence(text) {
  const match = text.match(/<zendesk-untrusted id="([0-9a-f]{16})" source="([^"]*)">\n([\s\S]*?)\n<\/zendesk-untrusted id="\1">/);
  assert.ok(match, `a fenced payload in:\n${text}`);
  const sections = {};
  let current = null;
  for (const line of match[3].split("\n")) {
    if (/^[a-z_]+:$/.test(line)) {
      current = line.slice(0, -1);
      sections[current] = [];
    } else if (line !== "(none)") {
      sections[current].push(JSON.parse(line));
    }
  }
  return {
    id: match[1],
    source: match[2],
    sections,
    before: text.slice(0, match.index),
    after: text.slice(match.index + match[0].length),
  };
}

export default { ENV, HOST, newCaller, lastCallerId, connect, call, json, cursorPage, withZendesk, parseFence };
