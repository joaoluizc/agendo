import { test, mock, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { Webhook } from "svix";

/**
 * Clerk's `user.created` webhook over real HTTP, signed with a real svix signature, the way
 * app.js parses it (express.json keeping the raw body). Provisioning itself is mocked here;
 * its rules are in permissions/onboarding.test.js. This endpoint has failed silently before
 * (it hung on every signup until svix gave up), so the wiring is worth pinning down.
 */

const SECRET = `whsec_${Buffer.from("agendo-test-webhook-secret").toString("base64")}`;
let provisioned = [];
let server;
let url;

before(async () => {
  // Modules that do I/O at import time (see permissions/routeRequirements.test.js).
  mock.module(new URL("../database/redisClient.js", import.meta.url).href, {
    defaultExport: { get: async () => null, set: async () => "OK" },
  });
  mock.module(new URL("../services/slingService.js", import.meta.url).href, {
    defaultExport: class {},
  });
  mock.module(new URL("../services/onboardingService.js", import.meta.url).href, {
    defaultExport: {
      provisionIdentity: async (identity, options) => {
        provisioned.push({ identity, options });
        return { user: { clerkId: identity.clerkId }, outcome: "created" };
      },
    },
    namedExports: { provisionFromClerk: async () => null },
  });
  process.env.CLERK_WEBHOOK_NEW_USER_CREATED_SECRET = SECRET;
  const { default: userController } = await import("./userController.js");

  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use((req, _res, next) => { req.requestId = "test"; next(); });
  app.post("/user/clerk/new", userController.newClerkUser);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  url = `http://127.0.0.1:${server.address().port}/user/clerk/new`;
});

after(() => server?.close());
beforeEach(() => { provisioned = []; });

const userCreated = {
  type: "user.created",
  data: {
    id: "user_new",
    first_name: "New",
    last_name: "Agent",
    created_at: 1791892800000,
    primary_email_address_id: "idn_1",
    email_addresses: [
      { id: "idn_1", email_address: "New.Agent@example.test", verification: { status: "verified" } },
    ],
  },
};

async function deliver(event, { secret = SECRET } = {}) {
  const body = JSON.stringify(event);
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const signature = new Webhook(secret).sign(id, new Date(), body);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": signature,
    },
    body,
  });
  // The handler acks before provisioning; let it finish.
  await new Promise((resolve) => setImmediate(resolve));
  return { status: res.status, body: await res.json() };
}

test("a signed user.created is acked and provisioned with the primary, normalized email", async () => {
  const res = await deliver(userCreated);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { message: "accepted" });
  assert.equal(provisioned.length, 1);
  assert.deepEqual(provisioned[0].identity, {
    clerkId: "user_new",
    email: "new.agent@example.test",
    emailVerified: true,
    firstName: "New",
    lastName: "Agent",
    createdAt: 1791892800000,
  });
  assert.deepEqual(provisioned[0].options, { source: "webhook", requestId: "test" });
});

test("a bad signature is a 401 and provisions nothing", async () => {
  const wrong = `whsec_${Buffer.from("someone-else").toString("base64")}`;
  const res = await deliver(userCreated, { secret: wrong });
  assert.equal(res.status, 401);
  assert.equal(provisioned.length, 0);
});

test("other Clerk events are acked and ignored", async () => {
  const res = await deliver({ ...userCreated, type: "user.updated" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { message: "ignored: user.updated" });
  assert.equal(provisioned.length, 0);
});

test("a payload with no email is acked and ignored", async () => {
  const res = await deliver({ ...userCreated, data: { ...userCreated.data, email_addresses: [] } });
  assert.equal(res.status, 200);
  assert.equal(provisioned.length, 0);
});
