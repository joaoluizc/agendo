import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

/**
 * The requirement markers over HTTP: who gets through, and exactly what everyone else gets
 * back. The caller resolver (authz.getCaller) is mocked — it has its own tests — while the
 * evaluator and the markers are real.
 */

const CALLERS = {
  agent: {
    clerkId: "user_agent",
    isAdmin: false,
    mongoUser: {
      email: "agent@example.test",
      permissions: { scheduling: "view", bugs: "none", reports: "self", performance: "none" },
    },
  },
  scheduler: {
    clerkId: "user_scheduler",
    isAdmin: false,
    mongoUser: { email: "scheduler@example.test", permissions: { scheduling: "edit" } },
  },
  admin: { clerkId: "user_admin", isAdmin: true, mongoUser: { email: "admin@example.test" } },
  ghost: { clerkId: "user_ghost", noAccount: true },
};

let getCallerCalls = 0;
let markers;
let server;
let baseUrl;
const warnings = [];
const errors = [];
const original = { warn: console.warn, error: console.error };

before(async () => {
  mock.module(new URL("../services/authz.js", import.meta.url).href, {
    namedExports: {
      getCaller: async (req) => {
        getCallerCalls++;
        const who = req.get("x-test-caller");
        if (who === "explode") throw new Error("mongo is down");
        return who ? CALLERS[who] ?? null : null;
      },
    },
  });
  markers = await import("./requirePermission.js");
  const { requirePermission, requireAdmin, signedIn, publicRoute } = markers;

  const ok = (req, res) => res.json({ ok: true });
  const app = express();
  // Stand in for clerkMiddleware: getAuth(req) needs a req.auth to exist.
  app.use((req, res, next) => {
    const tokenType = req.get("x-token-type") || "session_token";
    const auth = { userId: req.get("x-token-type") ? "user_mcp" : null, tokenType };
    req.auth = new Proxy(() => auth, { get: (_t, prop) => auth[prop] });
    next();
  });
  app.get("/edit", requirePermission("scheduling", "edit"), ok);
  app.get("/view", requirePermission("scheduling", "view"), ok);
  app.get("/reports", requirePermission("reports", "self"), ok);
  app.get("/admin", requireAdmin, ok);
  app.get("/signed-in", signedIn, ok);
  app.get("/public", publicRoute, ok);

  console.warn = (...args) => warnings.push(args.join(" "));
  console.error = (...args) => errors.push(args.join(" "));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  console.warn = original.warn;
  console.error = original.error;
  server?.closeAllConnections();
  server?.close();
});

async function call(path, { caller, tokenType } = {}) {
  const headers = {};
  if (caller) headers["x-test-caller"] = caller;
  if (tokenType) headers["x-token-type"] = tokenType;
  const before = warnings.length;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { status: res.status, body: await res.json(), logged: warnings.slice(before) };
}

test("markers expose their requirement and reject typos when declared", () => {
  assert.equal(markers.requirePermission("bugs", "edit").requirement, "bugs:edit");
  assert.equal(markers.requireAdmin.requirement, "admin");
  assert.equal(markers.signedIn.requirement, "signedIn");
  assert.equal(markers.publicRoute.requirement, "public");
  assert.equal(markers.webhookRoute.requirement, "webhook");
  assert.equal(markers.mcpRoute.requirement, "mcp");
  assert.throws(() => markers.requirePermission("bugs", "write"), /Unknown level/);
  assert.throws(() => markers.requirePermission("billing", "view"), /Unknown permission area/);
});

test("callers at or above the level get through, silently", async () => {
  for (const [path, caller] of [
    ["/view", "agent"],
    ["/view", "scheduler"],
    ["/edit", "scheduler"],
    ["/edit", "admin"],
    ["/reports", "agent"],
    ["/admin", "admin"],
    ["/signed-in", "agent"],
  ]) {
    const { status, logged } = await call(path, { caller });
    assert.equal(status, 200, `${caller} on ${path}`);
    assert.deepEqual(logged, []);
  }
});

test("below the level is a 403 that says what was needed and what they have", async () => {
  const { status, body, logged } = await call("/edit", { caller: "agent" });
  assert.equal(status, 403);
  assert.deepEqual(body, {
    error: "Forbidden",
    reason: "below_required",
    required: "scheduling:edit",
    have: "view",
  });
  assert.equal(logged.length, 1);
  assert.match(logged[0], /\[perm\] denied GET \/edit: requires scheduling:edit — below_required \(has view\) — caller agent@example\.test/);
});

test("admin-only routes refuse everyone else, however high their levels", async () => {
  const { status, body } = await call("/admin", { caller: "scheduler" });
  assert.equal(status, 403);
  assert.deepEqual(body, { error: "Forbidden", reason: "not_admin", required: "admin" });
});

test("a Clerk identity with no agendo user is refused everywhere but public routes", async () => {
  for (const path of ["/signed-in", "/view"]) {
    const { status, body } = await call(path, { caller: "ghost" });
    assert.equal(status, 403);
    assert.equal(body.reason, "no_agendo_account");
  }
  assert.equal((await call("/public", { caller: "ghost" })).status, 200);
});

test("no session is a JSON 401, not a redirect; a signed-out browser isn't logged", async () => {
  const { status, body, logged } = await call("/signed-in");
  assert.equal(status, 401);
  assert.deepEqual(body, { error: "Unauthorized" });
  assert.deepEqual(logged, []);
});

test("a valid token of another type (an MCP OAuth token) is a 401, and logged", async () => {
  const { status, logged } = await call("/view", { tokenType: "oauth_token" });
  assert.equal(status, 401);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /refused a oauth_token for user_mcp on GET \/view/);
});

test("a failing caller lookup is a 500, never a pass", async () => {
  const { status, body } = await call("/view", { caller: "explode" });
  assert.equal(status, 500);
  assert.deepEqual(body, { error: "Could not verify permissions" });
  assert.ok(errors.some((line) => line.includes("could not resolve caller") && line.includes("mongo is down")));
});

test("declaration markers never resolve a caller", async () => {
  const calls = getCallerCalls;
  assert.equal((await call("/public")).status, 200);
  assert.equal(getCallerCalls, calls);
});
