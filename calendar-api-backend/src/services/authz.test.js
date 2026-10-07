import { test, mock, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

/**
 * getCaller: who a REST request is. Runs the real `getAuth` from @clerk/express against
 * auth objects shaped like @clerk/backend's (a Proxy around a function, as clerkMiddleware
 * decorates req.auth), with the Mongo lookup mocked. The point of the session-only rule is
 * that an MCP OAuth token — which carries the user's id — resolves to nobody here.
 */

const USERS = {
  user_agent: { clerkId: "user_agent", type: "normal", permissions: { scheduling: "view" } },
  user_admin: { clerkId: "user_admin", type: "admin" },
};
let lookups = [];
let authz;

before(async () => {
  mock.module(new URL("./userService.js", import.meta.url).href, {
    defaultExport: {
      findUserByClerkId: async (clerkId) => {
        lookups.push(clerkId);
        return USERS[clerkId] ?? null;
      },
    },
  });
  authz = await import("./authz.js");
});

beforeEach(() => {
  lookups = [];
  delete process.env.ADMIN_BYPASS;
});
afterEach(() => {
  delete process.env.ADMIN_BYPASS;
});

function requestWith(authObject) {
  return { auth: new Proxy(() => authObject, { get: (_t, prop) => authObject[prop] }) };
}
const session = (userId) => requestWith({ userId, sessionId: "sess_1", tokenType: "session_token" });

test("a session token resolves to the agendo user", async () => {
  const caller = await authz.getCaller(session("user_agent"));
  assert.equal(caller.clerkId, "user_agent");
  assert.equal(caller.isAdmin, false);
  assert.equal(caller.mongoUser, USERS.user_agent);
});

test("admin comes from Mongo type alone", async () => {
  assert.equal((await authz.getCaller(session("user_admin"))).isAdmin, true);
});

test("an MCP OAuth token, an API key or an M2M token resolves to nobody — and never hits Mongo", async () => {
  for (const auth of [
    { userId: "user_admin", subject: "user_admin", clientId: "c", tokenType: "oauth_token" },
    { userId: "user_admin", subject: "user_admin", tokenType: "api_key" },
    { machineId: "mch_1", subject: "mch_1", tokenType: "m2m_token" },
  ]) {
    assert.equal(await authz.getCaller(requestWith(auth)), null, auth.tokenType);
  }
  assert.deepEqual(lookups, []);
});

test("no session resolves to nobody", async () => {
  assert.equal(await authz.getCaller(requestWith({ userId: null, tokenType: "session_token" })), null);
});

test("a Clerk identity with no agendo user is marked noAccount", async () => {
  assert.deepEqual(await authz.getCaller(session("user_stranger")), {
    clerkId: "user_stranger",
    noAccount: true,
  });
});

test("resolved once per request, then memoized on req.caller", async () => {
  const req = session("user_agent");
  const [a, b] = await Promise.all([authz.getCaller(req), authz.getCaller(req)]);
  await authz.getCaller(req);
  assert.equal(a, b);
  assert.equal(req.caller, a);
  assert.deepEqual(lookups, ["user_agent"]);
});

test("ADMIN_BYPASS=1 makes a REST caller admin; callerFromUser (MCP) ignores it", async () => {
  process.env.ADMIN_BYPASS = "1";
  assert.equal((await authz.getCaller(session("user_agent"))).isAdmin, true);
  assert.equal(authz.callerFromUser(USERS.user_agent).isAdmin, false);
});
