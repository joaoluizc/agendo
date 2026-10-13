import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEW_ACCOUNT_WINDOW_MS,
  identityFromClerkUser,
  identityFromWebhook,
  planInvite,
  planProvisioning,
} from "./onboarding.js";
import { defaultPermissions } from "./evaluate.js";

// Synthetic people only — the repo is public.
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const who = (overrides = {}) => ({
  clerkId: "user_new",
  email: "new.agent@example.test",
  emailVerified: true,
  firstName: "New",
  lastName: "Agent",
  createdAt: NOW - HOUR,
  ...overrides,
});
const invite = (overrides = {}) => ({
  email: "new.agent@example.test",
  type: "normal",
  permissions: { scheduling: "edit", bugs: "view", reports: "self", performance: "none" },
  invitedBy: "user_admin",
  ...overrides,
});
const plan = (args) => planProvisioning({ now: NOW, identity: who(), source: "request", ...args });

/* --------------------------------- identities --------------------------------- */

test("a webhook payload: the primary address, normalized, and whether Clerk verified it", () => {
  const identity = identityFromWebhook({
    id: "user_new",
    first_name: "New",
    last_name: null,
    primary_email_address_id: "idn_2",
    created_at: NOW,
    email_addresses: [
      { id: "idn_1", email_address: "old@example.test", verification: { status: "verified" } },
      { id: "idn_2", email_address: " New.Agent@Example.TEST ", verification: { status: "verified" } },
    ],
  });
  assert.deepEqual(identity, {
    clerkId: "user_new",
    email: "new.agent@example.test",
    emailVerified: true,
    firstName: "New",
    lastName: "",
    createdAt: NOW,
  });
});

test("a Clerk user object reads the same way; with no primary named, the first address", () => {
  const identity = identityFromClerkUser({
    id: "user_new",
    firstName: "New",
    lastName: "Agent",
    primaryEmailAddressId: null,
    createdAt: NOW,
    emailAddresses: [
      { id: "idn_1", emailAddress: "new.agent@example.test", verification: { status: "unverified" } },
    ],
  });
  assert.equal(identity.email, "new.agent@example.test");
  assert.equal(identity.emailVerified, false);
});

test("no addresses at all gives an empty email, which is refused", () => {
  const identity = identityFromWebhook({ id: "user_new", email_addresses: [] });
  assert.equal(identity.email, "");
  assert.deepEqual(plan({ identity, source: "webhook" }), { action: "refuse", reason: "no_email" });
});

/* -------------------------------- provisioning -------------------------------- */

test("the webhook creates the user with the new-user defaults", () => {
  assert.deepEqual(plan({ source: "webhook" }), {
    action: "create",
    type: "normal",
    permissions: defaultPermissions(),
    grantedBy: "provisioning",
    invite: null,
  });
});

test("the webhook provisions whatever the account's age — it is the creation", () => {
  const old = who({ createdAt: NOW - 90 * 24 * HOUR });
  assert.equal(plan({ identity: old, source: "webhook" }).action, "create");
});

test("a first request provisions a new account (the webhook never arrived)", () => {
  assert.equal(plan({ source: "request" }).action, "create");
  const edge = who({ createdAt: NOW - NEW_ACCOUNT_WINDOW_MS });
  assert.equal(plan({ identity: edge }).action, "create");
});

test("a first request from an old account is refused: a deleted user stays deleted", () => {
  const old = who({ createdAt: NOW - NEW_ACCOUNT_WINDOW_MS - 1 });
  assert.deepEqual(plan({ identity: old }), { action: "refuse", reason: "not_new" });
  // No creation date means we can't tell — treat it as old.
  assert.deepEqual(plan({ identity: who({ createdAt: null }) }), {
    action: "refuse",
    reason: "not_new",
  });
});

test("an invite decides the access, from any source, and is handed back to be consumed", () => {
  const pending = invite();
  for (const source of ["webhook", "request", "invite"]) {
    const old = who({ createdAt: NOW - 400 * 24 * HOUR });
    const result = plan({ identity: old, source, invite: pending });
    assert.deepEqual(
      result,
      {
        action: "create",
        type: "normal",
        permissions: pending.permissions,
        grantedBy: "user_admin",
        invite: pending,
      },
      source,
    );
  }
});

test("an admin invite makes an admin; the last admin to edit it is the grantor", () => {
  const result = plan({ invite: invite({ type: "admin", updatedBy: "user_admin2" }) });
  assert.equal(result.type, "admin");
  assert.equal(result.grantedBy, "user_admin2");
});

test("a partial invite is filled from the new-user defaults", () => {
  const result = plan({ invite: invite({ permissions: { bugs: "edit" } }) });
  assert.deepEqual(result.permissions, { ...defaultPermissions(), bugs: "edit" });
});

test("an invite needs a verified email; without one a new account still gets the defaults", () => {
  const unverified = who({ emailVerified: false });
  const result = plan({ identity: unverified, source: "webhook", invite: invite() });
  assert.equal(result.action, "create");
  assert.equal(result.invite, null);
  assert.deepEqual(result.permissions, defaultPermissions());
  // ...and an old unverified account gets nothing.
  const old = who({ emailVerified: false, createdAt: NOW - 30 * 24 * HOUR });
  assert.equal(plan({ identity: old, invite: invite() }).action, "refuse");
});

test("the invite route only provisions on behalf of an invite", () => {
  assert.deepEqual(plan({ source: "invite" }), { action: "refuse", reason: "not_new" });
});

test("an agendo user with this email and no Clerk id gets linked, keeping their access", () => {
  const existing = { email: "new.agent@example.test", clerkId: null, type: "admin" };
  assert.deepEqual(plan({ existingByEmail: existing }), { action: "link", user: existing });
});

test("an agendo user whose Clerk account was deleted is linked to the new one", () => {
  const existing = { email: "new.agent@example.test", clerkId: "user_old" };
  assert.deepEqual(plan({ existingByEmail: existing, previousAccountGone: true }), {
    action: "link",
    user: existing,
  });
});

test("an email held by another live Clerk account is never taken over", () => {
  const existing = { email: "new.agent@example.test", clerkId: "user_other" };
  assert.deepEqual(plan({ existingByEmail: existing }), { action: "refuse", reason: "email_taken" });
});

test("linking an existing user needs a verified email", () => {
  const existing = { email: "new.agent@example.test", clerkId: null, type: "admin" };
  assert.deepEqual(plan({ identity: who({ emailVerified: false }), existingByEmail: existing }), {
    action: "refuse",
    reason: "unverified_email",
  });
});

test("an unknown source is a programming error", () => {
  assert.throws(() => plan({ source: "carrier-pigeon" }), /unknown provisioning source/);
});

/* ----------------------------------- invites ---------------------------------- */

test("a new invite: email normalized, defaults filled in", () => {
  assert.deepEqual(planInvite({ body: { email: "  Someone@Example.TEST ", permissions: { bugs: "view" } } }), {
    ok: true,
    email: "someone@example.test",
    type: "normal",
    permissions: { ...defaultPermissions(), bugs: "view" },
    changed: true,
  });
});

test("editing an invite merges over what it holds", () => {
  const existingInvite = invite({ type: "admin" });
  const result = planInvite({
    body: { email: "new.agent@example.test", permissions: { performance: "edit" } },
    existingInvite,
  });
  assert.equal(result.type, "admin");
  assert.deepEqual(result.permissions, { ...existingInvite.permissions, performance: "edit" });
  assert.equal(result.changed, true);
  const same = planInvite({ body: { email: "new.agent@example.test" }, existingInvite });
  assert.equal(same.changed, false);
});

test("an email that already has an agendo user is a 409 that points at them", () => {
  const result = planInvite({
    body: { email: "new.agent@example.test" },
    existingUser: { clerkId: "user_agent" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.clerkId, "user_agent");
});

test("bad invites are 400s", () => {
  for (const body of [
    null,
    [],
    {},
    { email: "not-an-email" },
    { email: "a@example.test", type: "owner" },
    { email: "a@example.test", permissions: { bugs: "admin" } },
    { email: "a@example.test", permissions: { payroll: "view" } },
    { email: "a@example.test", clerkId: "user_x" },
  ]) {
    const result = planInvite({ body });
    assert.equal(result.ok, false, JSON.stringify(body));
    assert.equal(result.status, 400, JSON.stringify(body));
  }
});
