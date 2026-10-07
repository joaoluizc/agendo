import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionsForExistingUser, parseAllowlist } from "./backfill.js";

// Synthetic addresses only — the repo is public.
const allowlist = parseAllowlist(" Lead@Example.test, ops@example.test ,,");

test("parseAllowlist trims, lowercases and drops blanks", () => {
  assert.deepEqual([...allowlist].sort(), ["lead@example.test", "ops@example.test"]);
  assert.equal(parseAllowlist(undefined).size, 0);
  assert.equal(parseAllowlist("").size, 0);
});

test("an existing user keeps today's access and gains their own report", () => {
  assert.deepEqual(permissionsForExistingUser({ email: "agent@example.test", type: "normal" }, allowlist), {
    scheduling: "view",
    bugs: "none",
    reports: "self",
    performance: "none",
  });
});

test("the Performance allowlist becomes performance:edit, case-insensitively", () => {
  const p = permissionsForExistingUser({ email: "LEAD@example.test", type: "normal" }, allowlist);
  assert.equal(p.performance, "edit");
});

test("admins get the same stored values — their access comes from the flag", () => {
  assert.deepEqual(
    permissionsForExistingUser({ email: "boss@example.test", type: "admin" }, allowlist),
    permissionsForExistingUser({ email: "boss@example.test", type: "normal" }, allowlist),
  );
});

test("a user with no email never matches the allowlist", () => {
  assert.equal(permissionsForExistingUser({}, parseAllowlist("")).performance, "none");
});
