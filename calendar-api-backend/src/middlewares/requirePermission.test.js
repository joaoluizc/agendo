import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

/**
 * Shadow-mode markers over HTTP: they must never block or break a request, and must log
 * exactly the disagreements with the legacy gate that answered it. The caller resolver is
 * mocked (authz.getCaller); everything else is real.
 */

const CALLERS = {
  agent: {
    clerkId: "user_agent",
    isAdmin: false,
    mongoUser: { email: "agent@example.test", permissions: { scheduling: "view", reports: "self" } },
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

  // A stand-in legacy gate: answers 403 when the test asks it to, else lets through.
  const legacy = (req, res, next) =>
    req.get("x-legacy") === "deny" ? res.status(403).json({ error: "Forbidden" }) : next();
  const ok = (req, res) => res.json({ ok: true });

  const app = express();
  app.get("/edit", requirePermission("scheduling", "edit"), legacy, ok);
  app.get("/view", requirePermission("scheduling", "view"), legacy, ok);
  app.get("/admin", requireAdmin, legacy, ok);
  app.get("/signed-in", signedIn, legacy, ok);
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

async function call(path, { caller, legacy } = {}) {
  const headers = {};
  if (caller) headers["x-test-caller"] = caller;
  if (legacy) headers["x-legacy"] = legacy;
  const before = warnings.length;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  await res.text();
  // 'finish' fires as the response ends; give the listener a tick.
  await new Promise((resolve) => setImmediate(resolve));
  return { status: res.status, logged: warnings.slice(before) };
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

test("agreement is silent: both allow, or both deny", async () => {
  assert.deepEqual(await call("/view", { caller: "agent" }), { status: 200, logged: [] });
  assert.deepEqual(await call("/edit", { caller: "agent", legacy: "deny" }), {
    status: 403,
    logged: [],
  });
  assert.deepEqual(await call("/admin", { caller: "admin" }), { status: 200, logged: [] });
});

test("never blocks: a would-deny still reaches the handler, and is logged", async () => {
  const { status, logged } = await call("/edit", { caller: "agent" });
  assert.equal(status, 200);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /\[perm\] shadow mismatch: GET \/edit requires scheduling:edit/);
  assert.match(logged[0], /would DENY \(below_required, has scheduling:view\), legacy answered 200/);
  assert.match(logged[0], /caller agent@example\.test/);
});

test("a would-allow that legacy refused is logged", async () => {
  const { status, logged } = await call("/view", { caller: "agent", legacy: "deny" });
  assert.equal(status, 403);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /would ALLOW, legacy answered 403/);
});

test("users without an agendo account and anonymous callers are would-deny", async () => {
  const ghost = await call("/signed-in", { caller: "ghost" });
  assert.equal(ghost.status, 200);
  assert.match(ghost.logged[0], /would DENY \(no_agendo_account\)/);
  const anon = await call("/signed-in");
  assert.match(anon.logged[0], /would DENY \(no_session\).*caller anonymous/);
});

test("a failing caller lookup is logged and the request carries on", async () => {
  const { status, logged } = await call("/admin", { caller: "explode" });
  assert.equal(status, 200);
  assert.deepEqual(logged, []);
  assert.ok(errors.some((line) => line.includes("[perm] shadow check failed") && line.includes("mongo is down")));
});

test("declaration markers never resolve a caller", async () => {
  const calls = getCallerCalls;
  assert.equal((await call("/public")).status, 200);
  assert.equal(getCallerCalls, calls);
});
