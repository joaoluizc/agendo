import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * agendo's MCP server, driven over the SDK's own client and an in-memory transport, as a
 * real client would see it: which tools each person is offered, what the server
 * advertises, and what a refusal says. The caller is supplied directly (no Clerk), and the
 * two modules that do I/O at import — the Redis client and the Sling service — are mocked.
 * No test here reaches Mongo: a tool that tried would hang on Mongoose's buffering.
 */

let createMcpServer;
let registerTool;
let registerZendeskTool;
let zendesk;
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
  ({ registerZendeskTool } = await import("./lib/registerZendeskTool.js"));
  ({ zendesk } = await import("./lib/zendeskClient.js"));
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
const SCHEDULER = persona({ scheduling: "edit", bugs: "none", reports: "self", performance: "none", zendesk: "none" });
const AGENT = persona({ scheduling: "view", bugs: "none", reports: "self", performance: "none", zendesk: "none" });
const ZENDESK_READER = persona({ scheduling: "view", bugs: "none", reports: "self", performance: "none", zendesk: "view" });
const NOBODY = persona({ scheduling: "none", bugs: "none", reports: "none", performance: "none", zendesk: "none" });

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

const ZENDESK_TOOLS = ["zendesk_connection_status", "zendesk_search_tickets"];

test("each person is offered exactly the tools their access allows", async () => {
  const agendoOnly = [...READ_TOOLS, ...EDIT_TOOLS].sort();
  assert.deepEqual(await toolNames(ADMIN), [...agendoOnly, ...ZENDESK_TOOLS].sort());
  // Scheduling: edit says nothing about Zendesk — the two areas are independent.
  assert.deepEqual(await toolNames(SCHEDULER), agendoOnly);
  assert.deepEqual(await toolNames(AGENT), READ_TOOLS);
  assert.deepEqual(await toolNames(ZENDESK_READER), [...READ_TOOLS, ...ZENDESK_TOOLS].sort());
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

/* ------------------------------ agendo + Zendesk ------------------------------ */

/** Run `fn` with fake Zendesk credentials in the environment and `fetch` stubbed. */
async function withZendesk({ env, respond }, fn) {
  const keys = ["ZD_SUBDOMAIN", "ZD_API_EMAIL", "ZD_API_TOKEN"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, env);
  const calls = [];
  const stub = mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), init });
    return respond(url, init);
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

const FAKE_ZENDESK_ENV = {
  ZD_SUBDOMAIN: "example-test",
  ZD_API_EMAIL: "service-user@example.test",
  ZD_API_TOKEN: "secret-token-value",
};

test("the server is titled for both systems, and its instructions follow the caller's access", async () => {
  const withAccess = await connect(ZENDESK_READER);
  assert.equal(withAccess.getServerVersion().name, "agendo");
  assert.equal(withAccess.getServerVersion().title, "Agendo + Zendesk");
  const text = withAccess.getInstructions();
  assert.match(text, /TWO separate systems/);
  assert.match(text, /AGENDO — scheduling/);
  assert.match(text, /ZENDESK — support tickets/);
  assert.match(text, /Read-only/);
  assert.match(text, /ONE shared Zendesk user/);
  assert.match(text, /<zendesk-untrusted id="…"> blocks that end only at the closing tag carrying the same id/);
  assert.match(text, /"agent" in agendo is a support team\s+member on the schedule/);
  await withAccess.close();

  // Someone without access is told why there are no Zendesk tools, not left to look for them.
  const without = await connect(AGENT);
  assert.match(without.getInstructions(), /AGENDO — scheduling/);
  assert.match(without.getInstructions(), /no Zendesk access/);
  assert.doesNotMatch(without.getInstructions(), /ZENDESK — support tickets/);
  await without.close();
});

test("every tool says which system it acts on: name, title, description, annotations", async () => {
  const client = await connect(ADMIN);
  const { tools } = await client.listTools();
  await client.close();

  const zendesk = tools.filter((tool) => tool.name.startsWith("zendesk_"));
  const agendo = tools.filter((tool) => !tool.name.startsWith("zendesk_"));
  assert.ok(zendesk.length >= 1 && agendo.length >= 10, "both systems are listed");

  for (const tool of zendesk) {
    assert.match(tool.title, /^Zendesk: /, tool.name);
    assert.match(tool.description, /^\[Zendesk, read-only\] /, tool.name);
    assert.deepEqual(
      tool.annotations,
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      tool.name,
    );
  }
  for (const tool of agendo) {
    assert.match(tool.title, /^agendo: /, tool.name);
    assert.match(tool.description, /^\[agendo( scheduling)?\] /, tool.name);
  }
});

test("zendesk_connection_status names the shared Zendesk user and keeps secrets out", async () => {
  await withZendesk(
    {
      env: FAKE_ZENDESK_ENV,
      respond: () =>
        new Response(
          JSON.stringify({
            user: { name: "Test Service User", role: "agent", ticket_restriction: null, active: true },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json", "x-rate-limit": "400", "x-rate-limit-remaining": "398" },
          },
        ),
    },
    async (calls) => {
      const client = await connect(ZENDESK_READER);
      const result = await client.callTool({ name: "zendesk_connection_status", arguments: {} });
      await client.close();

      assert.equal(result.isError, undefined);
      const text = result.content[0].text;
      assert.match(text, /Zendesk account: example-test\.zendesk\.com/);
      assert.match(text, /as ONE shared user — not as you/);
      assert.match(text, /Name: Test Service User/);
      assert.match(text, /Role: agent/);
      assert.match(text, /Ticket access: all tickets \(no restriction\)/);
      assert.match(text, /398 of 400 requests left/);
      assert.match(text, /Read-only/);
      // The service user's address and the token never reach the model.
      assert.doesNotMatch(text, /secret-token-value|service-user@example\.test/);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://example-test.zendesk.com/api/v2/users/me.json");
      assert.equal(calls[0].init.method, "GET");
    },
  );
});

test("zendesk_connection_status says so plainly when Zendesk is not configured", async () => {
  await withZendesk({ env: {}, respond: () => assert.fail("must not call Zendesk") }, async (calls) => {
    const client = await connect(ZENDESK_READER);
    const result = await client.callTool({ name: "zendesk_connection_status", arguments: {} });
    await client.close();
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not configured on the agendo server/);
    assert.match(result.content[0].text, /ZD_API_TOKEN/);
    assert.equal(calls.length, 0);
  });
});

test("a stale client calling a Zendesk tool it lacks is told which access it needs", async () => {
  const client = await connect({ ...AGENT, toolCallNames: ["zendesk_connection_status"] });
  const result = await client.callTool({ name: "zendesk_connection_status", arguments: {} });
  await client.close();
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /"zendesk_connection_status" needs Zendesk: view — you have Zendesk: none/);
  assert.equal((await toolNames(AGENT)).includes("zendesk_connection_status"), false);
});

test("registerZendeskTool fixes the name, the requirement and the annotations", () => {
  const server = { registerTool: () => ({}) };
  const handler = async () => ({ content: [] });
  const base = { name: "zendesk_x", title: "X", description: "Does x.", handler };
  assert.throws(() => registerZendeskTool(server, ADMIN, { ...base, name: "find_tickets" }), /must be named zendesk_/);
  assert.throws(() => registerZendeskTool(server, ADMIN, { ...base, title: undefined }), /needs a title and a description/);
  assert.throws(() => registerZendeskTool(server, ADMIN, { ...base, requires: "signedIn" }), /must not set requires or annotations/);
  assert.throws(
    () => registerZendeskTool(server, ADMIN, { ...base, annotations: { readOnlyHint: false } }),
    /must not set requires or annotations/,
  );
});

test("redactArgs logs how much was asked, never what — and a typo fails the load", async () => {
  const handler = async () => ({ content: [{ type: "text", text: "ok" }] });
  const server = new McpServer({ name: "t", version: "1" });
  registerTool(server, ADMIN, {
    name: "t_search",
    requires: "signedIn",
    description: "x",
    inputSchema: { query: z.string(), limit: z.number().optional() },
    redactArgs: ["query"],
    handler,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const log = mock.method(console, "log", () => {});
  try {
    await client.callTool({ name: "t_search", arguments: { query: "jane@example.test", limit: 5 } });
  } finally {
    log.mock.restore();
  }
  await client.close();

  const line = log.mock.calls.map((call) => call.arguments.join(" ")).find((text) => text.includes("tool=t_search"));
  assert.ok(line, "the call was logged");
  assert.match(line, /\[redacted: 17 chars\]/);
  assert.doesNotMatch(line, /jane@example\.test/);
  assert.match(line, /"limit":5/);

  const stub = { registerTool: () => ({}) };
  const schema = { query: z.string() };
  const define = (redactArgs) => ({ name: "t", requires: "signedIn", description: "", inputSchema: schema, redactArgs, handler });
  assert.throws(() => registerTool(stub, ADMIN, define(["quary"])), /redacts quary/);
  assert.throws(() => registerTool(stub, ADMIN, define("query")), /must be a list of argument names/);
});

/** An in-memory client connected to a hand-built server. */
async function connectTo(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** Call `name` and return the call-log line it produced. */
async function loggedLine(client, name, args) {
  const log = mock.method(console, "log", () => {});
  try {
    await client.callTool({ name, arguments: args });
  } finally {
    log.mock.restore();
  }
  return log.mock.calls.map((call) => call.arguments.join(" ")).find((text) => text.includes(`tool=${name}`));
}

test("a Zendesk tool logs only the arguments it declares safe — every other one by size", async () => {
  const handler = async () => ({ content: [{ type: "text", text: "ok" }] });
  const schema = { query: z.string(), name: z.string().optional(), ticket_id: z.number() };
  const server = new McpServer({ name: "t", version: "1" });
  registerZendeskTool(server, ADMIN, {
    name: "zendesk_declared", title: "A", description: "a", inputSchema: schema, logArgs: ["ticket_id"], handler,
  });
  registerZendeskTool(server, ADMIN, {
    name: "zendesk_forgot", title: "B", description: "b", inputSchema: schema, handler,
  });
  const client = await connectTo(server);
  const args = { query: "jane@example.test", name: "Jane", ticket_id: 4242 };

  const declared = await loggedLine(client, "zendesk_declared", args);
  assert.match(declared, /"ticket_id":4242/);
  assert.match(declared, /\[redacted: 17 chars\]/);
  assert.doesNotMatch(declared, /jane@example\.test|Jane/);

  // An author who declares nothing logs nothing but sizes: forgetting is safe.
  const forgot = await loggedLine(client, "zendesk_forgot", args);
  assert.match(forgot, /\[redacted: /);
  assert.doesNotMatch(forgot, /jane@example\.test|Jane|4242/);
  await client.close();
});

test("registerZendeskTool accounts for every argument in the log", () => {
  const server = { registerTool: () => ({}) };
  const handler = async () => ({ content: [] });
  const base = { name: "zendesk_x", title: "X", description: "Does x.", handler };
  const inputSchema = { query: z.string() };
  assert.throws(
    () => registerZendeskTool(server, ADMIN, { ...base, inputSchema, redactArgs: ["query"] }),
    /must not set redactArgs/,
  );
  assert.throws(
    () => registerZendeskTool(server, ADMIN, { ...base, inputSchema: z.object({ query: z.string() }) }),
    /plain \{ field: z\.type\(\) \} object/,
  );
  assert.throws(
    () => registerZendeskTool(server, ADMIN, { ...base, inputSchema, logArgs: ["quary"] }),
    /lists quary in logArgs/,
  );
  assert.throws(
    () => registerZendeskTool(server, ADMIN, { ...base, logArgs: ["query"] }),
    /has no inputSchema/,
  );
  assert.throws(
    () => registerZendeskTool(server, ADMIN, { ...base, inputSchema, logArgs: "query" }),
    /logArgs must be a list/,
  );
});

test("an error's log-safe message reaches the log; the client still gets the full one", async () => {
  const server = new McpServer({ name: "t", version: "1" });
  registerTool(server, ADMIN, {
    name: "t_fail",
    requires: "signedIn",
    description: "x",
    handler: async () => {
      throw Object.assign(new Error("rejected: jane@example.test"), { logMessage: "rejected" });
    },
  });
  const client = await connectTo(server);
  const errors = mock.method(console, "error", () => {});
  let result;
  try {
    result = await client.callTool({ name: "t_fail", arguments: {} });
  } finally {
    errors.mock.restore();
  }
  await client.close();

  assert.match(result.content[0].text, /jane@example\.test/);
  const line = errors.mock.calls.map((call) => call.arguments.join(" ")).find((text) => text.includes("tool=t_fail"));
  assert.match(line, /failed: rejected$/);
  assert.doesNotMatch(line, /jane@example\.test/);
});

test("handlers receive the request's cancellation signal, with or without arguments", async () => {
  const seen = {};
  const server = new McpServer({ name: "t", version: "1" });
  registerTool(server, ADMIN, {
    name: "t_plain",
    requires: "signedIn",
    description: "x",
    handler: async (_args, _caller, extra) => {
      seen.plain = extra;
      return { content: [{ type: "text", text: "ok" }] };
    },
  });
  registerTool(server, ADMIN, {
    name: "t_args",
    requires: "signedIn",
    description: "x",
    inputSchema: { q: z.string().optional() },
    handler: async (_args, _caller, extra) => {
      seen.args = extra;
      return { content: [{ type: "text", text: "ok" }] };
    },
  });
  const client = await connectTo(server);
  await client.callTool({ name: "t_plain", arguments: {} });
  await client.callTool({ name: "t_args", arguments: { q: "x" } });
  await client.close();
  // The signal, and nothing else: the SDK's `extra` also holds the caller's bearer token.
  for (const extra of [seen.plain, seen.args]) {
    assert.deepEqual(Object.keys(extra), ["signal"]);
    assert.ok(extra.signal instanceof AbortSignal);
  }
});

test("the Zendesk tool charges the caller's own share and hands on the cancel signal", async () => {
  let seen;
  const forCaller = mock.method(zendesk, "forCaller", (key) => ({
    get: async (path, params, options) => {
      seen = { key, path, params, options };
      return { user: { name: "Test Service User", role: "agent", ticket_restriction: null, active: true } };
    },
  }));
  const host = mock.method(zendesk, "host", () => "example-test.zendesk.com");
  try {
    const client = await connect({ ...ZENDESK_READER, clerkId: "user_distinct" });
    await client.callTool({ name: "zendesk_connection_status", arguments: {} });
    await client.close();
  } finally {
    forCaller.mock.restore();
    host.mock.restore();
  }
  assert.equal(seen.key, "user_distinct", "their own id, never a shared key");
  assert.equal(seen.path, "/api/v2/users/me.json");
  assert.ok(seen.options.signal instanceof AbortSignal, "a cancelled request can stop the Zendesk call");
});

test("only a number, boolean, enum or literal can be declared safe to log", () => {
  const server = { registerTool: () => ({}) };
  const handler = async () => ({ content: [] });
  const base = { name: "zendesk_x", title: "X", description: "Does x.", handler };
  const refuse = (inputSchema, logArgs) =>
    assert.throws(
      () => registerZendeskTool(server, ADMIN, { ...base, inputSchema, logArgs }),
      /not a number, boolean, enum or literal/,
    );
  // Free text, however it is dressed up.
  refuse({ query: z.string() }, ["query"]);
  refuse({ query: z.string().optional() }, ["query"]);
  refuse({ query: z.string().min(1).max(50).default("") }, ["query"]);
  refuse({ query: z.string().refine((v) => v.length > 0) }, ["query"]);
  refuse({ names: z.array(z.string()) }, ["names"]);
  refuse({ blob: z.any() }, ["blob"]);
  // A string-typed field is not safe because of what it is called.
  refuse({ status: z.string() }, ["status"]);

  // The shapes that carry no free text pass, wrapped or not.
  assert.doesNotThrow(() =>
    registerZendeskTool(server, ADMIN, {
      ...base,
      inputSchema: {
        ticket_id: z.number().int().positive(),
        page: z.number().optional(),
        status: z.enum(["open", "pending", "solved"]).default("open"),
        include_notes: z.boolean(),
        kind: z.literal("ticket"),
      },
      logArgs: ["ticket_id", "page", "status", "include_notes", "kind"],
    }),
  );
});

test("a Zendesk tool's own unexpected error is shown to the client but logged generically", async () => {
  const server = new McpServer({ name: "t", version: "1" });
  registerZendeskTool(server, ADMIN, {
    name: "zendesk_boom",
    title: "Boom",
    description: "Fails.",
    inputSchema: { q: z.string() },
    handler: async ({ q }) => {
      throw new Error(`No ticket for ${q}`);
    },
  });
  registerZendeskTool(server, ADMIN, {
    name: "zendesk_vouched",
    title: "Vouched",
    description: "Fails, and says what is safe to log.",
    handler: async () => {
      throw Object.assign(new Error("full detail for the client"), { logMessage: "vouched line" });
    },
  });
  const client = await connectTo(server);
  const errors = mock.method(console, "error", () => {});
  let boom;
  let vouched;
  try {
    boom = await client.callTool({ name: "zendesk_boom", arguments: { q: "jane@example.test" } });
    vouched = await client.callTool({ name: "zendesk_vouched", arguments: {} });
  } finally {
    errors.mock.restore();
  }
  await client.close();
  const logged = (tool) =>
    errors.mock.calls.map((call) => call.arguments.join(" ")).find((text) => text.includes(`tool=${tool}`));

  assert.match(boom.content[0].text, /No ticket for jane@example\.test/);
  assert.match(logged("zendesk_boom"), /details are not logged for Zendesk tools/);
  assert.doesNotMatch(logged("zendesk_boom"), /jane@example\.test/);

  assert.match(vouched.content[0].text, /full detail for the client/);
  assert.match(logged("zendesk_vouched"), /failed: vouched line$/);
});

test("OAuth scopes stay identity-only — permissions never live in tokens", () => {
  // Adding a permission scope would force re-consent on every grant (see the plan, §2).
  assert.deepEqual(MCP_REQUIRED_SCOPES, ["openid", "profile", "email", "offline_access"]);
});
