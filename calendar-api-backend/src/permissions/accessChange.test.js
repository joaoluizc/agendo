import { test } from "node:test";
import assert from "node:assert/strict";
import { planAccessChange } from "./accessChange.js";

// Synthetic people only — the repo is public.
const actor = { clerkId: "user_admin", isAdmin: true };
const agent = {
  clerkId: "user_agent",
  type: "normal",
  permissions: { scheduling: "view", bugs: "none", reports: "self", performance: "none" },
};
const otherAdmin = { clerkId: "user_admin2", type: "admin", permissions: null };
const plan = (body, { target = agent, otherAdminCount = 1, by = actor } = {}) =>
  planAccessChange({ actor: by, target, body, otherAdminCount });

test("grants merge over what is stored", () => {
  assert.deepEqual(plan({ permissions: { bugs: "edit" } }), {
    ok: true,
    type: "normal",
    permissions: { scheduling: "view", bugs: "edit", reports: "self", performance: "none" },
    changed: true,
  });
});

test("a user with nothing stored starts from the new-user defaults", () => {
  const result = plan({ permissions: { performance: "edit" } }, { target: otherAdmin });
  assert.deepEqual(result.permissions, {
    scheduling: "view",
    bugs: "none",
    reports: "self",
    performance: "edit",
  });
});

test("promoting and demoting admins", () => {
  assert.equal(plan({ type: "admin" }).type, "admin");
  assert.equal(plan({ type: "normal" }, { target: otherAdmin }).type, "normal");
});

test("re-sending what is already there is a no-op", () => {
  assert.equal(plan({ permissions: { scheduling: "view" } }).changed, false);
  assert.equal(plan({ type: "normal" }).changed, false);
});

test("you can't change your own access", () => {
  const result = plan({ permissions: { bugs: "edit" } }, { target: { ...otherAdmin, clerkId: "user_admin" } });
  assert.deepEqual(result, { ok: false, status: 403, error: "You can't change your own access" });
});

test("the last admin can't be demoted", () => {
  const result = plan({ type: "normal" }, { target: otherAdmin, otherAdminCount: 0 });
  assert.deepEqual(result, { ok: false, status: 409, error: "Can't remove the last admin" });
  // Their levels can still change — they keep admin.
  assert.equal(plan({ permissions: { bugs: "view" } }, { target: otherAdmin, otherAdminCount: 0 }).ok, true);
});

test("bad bodies are 400s that say why", () => {
  const cases = [
    [null, /Body must be/],
    [[], /Body must be/],
    [{}, /Nothing to change/],
    [{ role: "admin" }, /Unknown field\(s\): role/],
    [{ type: "superuser" }, /type must be one of admin, normal/],
    [{ permissions: { performance: "self" } }, /Invalid permissions/],
    [{ permissions: { billing: "view" } }, /Invalid permissions/],
    [{ permissions: "edit" }, /Invalid permissions/],
  ];
  for (const [body, message] of cases) {
    const result = plan(body);
    assert.equal(result.ok, false, JSON.stringify(body));
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.match(result.error, message);
  }
  assert.ok(plan({ permissions: { performance: "self" } }).details.length);
});

test("an unknown user is a 404", () => {
  assert.deepEqual(plan({ type: "admin" }, { target: null }), {
    ok: false,
    status: 404,
    error: "User not found",
  });
});
