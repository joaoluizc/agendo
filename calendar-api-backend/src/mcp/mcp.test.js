import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

/**
 * agendo's MCP server, driven over the SDK's own client and an in-memory transport, as a
 * real client would see it: which tools each person is offered, what the server
 * advertises, and what a refusal says. The caller is supplied directly (no Clerk), and the
 * two modules that do I/O at import — the Redis client and the Sling service — are mocked.
 * No test here reaches Mongo: a tool that tried would hang on Mongoose's buffering.
 */

let createMcpServer;
let registerTool;
let toolCallNamesOf;
let MCP_REQUIRED_SCOPES;

before(async () => {
  mock.module(new URL("../database/redisClient.js", import.meta.url).href, {
    defaultExport: { get: async () => null, set: async () => "OK", del: async () => 0, on() {} },
  });
  mock.module(new URL("../services/slingService.js", import.meta.url).href, {
    defaultExport: class FakeSlingService {
      async init() {}
    },
  });
  ({ createMcpServer } = await import("./server.js"));
  ({ registerTool, toolCallNamesOf } = await import("./lib/registerTool.js"));
  ({ MCP_REQUIRED_SCOPES } = await import("./lib/clerkOauth.js"));
});

// Synthetic people only — the repo is public.
const persona = (permissions, { isAdmin = false, toolCallNames } = {}) => ({
  clerkId: "user_test",
  isAdmin,
  mongoUser: {
    email: "someone@example.test",
    firstName: "Some",
    lastName: "One",
    type: isAdmin ? "admin" : "normal",
    timezone: "UTC",
    permissions,
  },
  clientId: "test-client",
  scopes: [],
  requestId: "test",
  toolCallNames,
});
const ADMIN = persona({}, { isAdmin: true });
const SCHEDULER = persona({ scheduling: "edit", bugs: "none", reports: "self", performance: "none" });
const AGENT = persona({ scheduling: "view", bugs: "none", reports: "self", performance: "none" });
const NOBODY = persona({ scheduling: "none", bugs: "none", reports: "none", performance: "none" });

async function connect(caller) {
  const server = createMcpServer(caller);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "agendo-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function toolNames(caller) {
  const client = await connect(caller);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((tool) => tool.name).sort();
}

const READ_TOOLS = [
  "find_shifts",
  "get_agent_schedule",
  "get_coverage_at",
  "get_my_schedule",
  "summarize_shifts",
  "whoami",
];
const EDIT_TOOLS = [
  "create_shift",
  "delete_shift",
  "find_coverage_gaps",
  "list_draft_shifts",
  "update_shift",
];

test("each person is offered exactly the tools their access allows", async () => {
  const all = [...READ_TOOLS, ...EDIT_TOOLS].sort();
  assert.deepEqual(await toolNames(ADMIN), all);
  assert.deepEqual(await toolNames(SCHEDULER), all);
  assert.deepEqual(await toolNames(AGENT), READ_TOOLS);
  // Without schedule access, only what is about themselves.
  assert.deepEqual(await toolNames(NOBODY), ["get_my_schedule", "whoami"]);
});

test("the server does not advertise list-change notifications it cannot send", async () => {
  const client = await connect(AGENT);
  assert.equal(client.getServerCapabilities()?.tools?.listChanged, false);
  await client.close();
});

test("whoami reports access per area", async () => {
  const client = await connect(AGENT);
  const result = await client.callTool({ name: "whoami", arguments: {} });
  const text = result.content[0].text;
  assert.match(text, /Admin: no/);
  assert.match(text, /Scheduling: view/);
  assert.match(text, /Reports: self/);
  assert.match(text, /Performance: none/);
  await client.close();
});

test("find_shifts refuses drafts below Scheduling: edit, before touching the database", { timeout: 5000 }, async () => {
  const client = await connect(AGENT);
  const result = await client.callTool({
    name: "find_shifts",
    arguments: { from: "2026-10-05", to: "2026-10-06", status: "draft" },
  });
  assert.match(result.content[0].text, /Draft shifts need Scheduling: edit/);
  assert.match(result.content[0].text, /with Scheduling: view/);
  await client.close();
});

test("a stale client calling a tool it no longer has gets a reason, not 'not found'", async () => {
  // As mcpHandler builds it for a tools/call request naming create_shift.
  const client = await connect({ ...AGENT, toolCallNames: ["create_shift"] });
  const result = await client.callTool({
    name: "create_shift",
    arguments: { agents: ["Someone"], position: "Chat", start: "2026-10-06T09:00:00Z" },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /"create_shift" needs Scheduling: edit — you have Scheduling: view/);
  assert.match(result.content[0].text, /restart or refresh your MCP client/);
  await client.close();
  // The stub exists only on that call: a plain listing still hides the tool.
  assert.equal((await toolNames(AGENT)).includes("create_shift"), false);
});

test("over HTTP, mcpHandler gives a revoked tool's call the explanation", async () => {
  const { default: express } = await import("express");
  const { mcpHandler } = await import("./mcpRouter.js");
  const app = express();
  app.use(express.json());
  // Stand in for mcpAuth: the caller it would have resolved.
  app.post("/mcp", (req, res, next) => {
    req.requestId = "test";
    req.mcpCaller = AGENT;
    next();
  }, mcpHandler);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "delete_shift", arguments: { shiftIds: ["x"] } },
      }),
    });
    const raw = await res.text();
    // Streamable HTTP may answer as SSE ("data: {...}") or plain JSON.
    const json = JSON.parse(raw.includes("data:") ? raw.split("data:").pop().trim() : raw);
    assert.equal(json.result?.isError, true, raw);
    assert.match(json.result.content[0].text, /"delete_shift" needs Scheduling: edit/);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("toolCallNamesOf reads single messages and batches", () => {
  assert.deepEqual(toolCallNamesOf({ method: "tools/call", params: { name: "whoami" } }), ["whoami"]);
  assert.deepEqual(
    toolCallNamesOf([
      { method: "tools/list" },
      { method: "tools/call", params: { name: "a" } },
      { method: "tools/call", params: { name: "b" } },
    ]),
    ["a", "b"],
  );
  for (const body of [undefined, null, "x", {}, { method: "tools/call" }, [{ params: {} }]]) {
    assert.deepEqual(toolCallNamesOf(body), []);
  }
});

test("every tool must declare a valid requirement, or the server won't load", () => {
  const server = { registerTool: () => ({}) };
  const handler = async () => ({ content: [] });
  assert.throws(() => registerTool(server, ADMIN, { name: "t", description: "", handler }), /must declare requires/);
  assert.throws(
    () => registerTool(server, ADMIN, { name: "t", requires: "scheduling:write", description: "", handler }),
    /Unknown level/,
  );
  assert.throws(
    () => registerTool(server, ADMIN, { name: "t", requires: "public", description: "", handler }),
    /for routes only/,
  );
  assert.throws(
    () => registerTool(server, ADMIN, { name: "t", level: "admin", description: "", handler }),
    /must declare requires/,
  );
});

test("OAuth scopes stay identity-only — permissions never live in tokens", () => {
  // Adding a permission scope would force re-consent on every grant (see the plan, §2).
  assert.deepEqual(MCP_REQUIRED_SCOPES, ["openid", "profile", "email", "offline_access"]);
});
