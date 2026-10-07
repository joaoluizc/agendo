import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import requireSession from "./requireSession.js";

/**
 * Drives the real middleware, and the real `getAuth` from @clerk/express underneath it,
 * over HTTP. `clerkMiddleware()` is replaced by a stand-in that decorates `req.auth` the
 * way @clerk/express 1.7 does: a Proxy around a function, so it is both callable
 * (`getAuth` does `req.auth(opts)`) and property-readable (`req.auth.userId`). The shapes
 * below mirror what @clerk/backend's `toAuth()` returns for each token type.
 */
const AUTH_OBJECTS = {
  session: { userId: "user_session", sessionId: "sess_1", tokenType: "session_token" },
  // What the MCP bridge holds: a Clerk OAuth access token. Clerk puts the user id on it.
  oauth: { userId: "user_mcp", subject: "user_mcp", clientId: "client_1", tokenType: "oauth_token" },
  apiKey: { userId: "user_key", subject: "user_key", tokenType: "api_key" },
  m2m: { machineId: "mch_1", subject: "mch_1", tokenType: "m2m_token" },
  signedOut: { userId: null, sessionId: null, tokenType: "session_token" },
};

let server;
let baseUrl;
const warnings = [];
const originalWarn = console.warn;

before(async () => {
  const app = express();
  app.use((req, res, next) => {
    const authObject = AUTH_OBJECTS[req.get("x-test-token")];
    if (authObject) {
      req.auth = new Proxy(() => authObject, { get: (_t, prop) => authObject[prop] });
    }
    next();
  });
  // Same handler shape as the real routes: read the caller after the gate.
  app.get("/guarded", requireSession, (req, res) => res.json({ userId: req.auth.userId }));

  console.warn = (...args) => warnings.push(args.join(" "));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  console.warn = originalWarn;
  server?.close();
});

const call = (token) =>
  fetch(`${baseUrl}/guarded`, { headers: token ? { "x-test-token": token } : {} });

test("a session token passes and the handler sees the user", async () => {
  const res = await call("session");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { userId: "user_session" });
});

test("an MCP OAuth token is refused with a JSON 401, not a redirect", async () => {
  const res = await call("oauth");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Unauthorized" });
  assert.ok(
    warnings.some((line) => line.includes("refused a oauth_token for user_mcp")),
    "refusing a valid non-session token is logged",
  );
});

test("API keys and M2M tokens are refused", async () => {
  assert.equal((await call("apiKey")).status, 401);
  assert.equal((await call("m2m")).status, 401);
});

test("a signed-out request gets a JSON 401 and is not logged as a refused token", async () => {
  const before = warnings.length;
  const res = await call("signedOut");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Unauthorized" });
  assert.equal(warnings.length, before);
});

test("missing clerkMiddleware is a 500, not a silent pass", async () => {
  const res = await call(null);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "Could not verify session" });
});
