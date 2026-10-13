import { test } from "node:test";
import assert from "node:assert/strict";
import { planOffboard } from "./offboard.js";

// Synthetic people only — the repo is public.
const actor = { clerkId: "user_admin", isAdmin: true };
const agent = { clerkId: "user_agent", type: "normal" };
const otherAdmin = { clerkId: "user_admin2", type: "admin" };

const plan = ({ target = agent, targetClerkId, otherAdminCount = 1, by = actor } = {}) =>
  planOffboard({
    actor: by,
    target,
    targetClerkId: targetClerkId ?? target?.clerkId,
    otherAdminCount,
  });

test("an admin may offboard an agent", () => {
  assert.deepEqual(plan(), { ok: true, resume: false });
});

test("an admin may offboard another admin while one is left", () => {
  assert.deepEqual(plan({ target: otherAdmin, otherAdminCount: 1 }), {
    ok: true,
    resume: false,
  });
});

test("you can't offboard yourself", () => {
  const result = plan({ target: { clerkId: actor.clerkId, type: "admin" } });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("the self check also catches a resume with no mongo user", () => {
  const result = plan({ target: null, targetClerkId: actor.clerkId });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("the last admin can't be offboarded", () => {
  const result = plan({ target: otherAdmin, otherAdminCount: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("the last-admin guard doesn't block a normal user when there are no other admins", () => {
  assert.equal(plan({ otherAdminCount: 0 }).ok, true);
});

test("no mongo user is a resume, not a 404 — clerk may still hold the account", () => {
  assert.deepEqual(plan({ target: null, targetClerkId: "user_gone" }), {
    ok: true,
    resume: true,
  });
});

test("a resume is allowed even with no other admins — a user with no mongo doc is not an admin", () => {
  assert.equal(plan({ target: null, targetClerkId: "user_gone", otherAdminCount: 0 }).ok, true);
});

test("a missing clerk id is a 400", () => {
  const result = planOffboard({ actor, target: null, targetClerkId: undefined });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});
