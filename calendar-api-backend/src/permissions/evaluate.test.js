import { test } from "node:test";
import assert from "node:assert/strict";
import { PERMISSION_AREAS, AREA_KEYS, publicRegistry } from "./registry.js";
import {
  rank,
  levelOf,
  can,
  effectivePermissions,
  defaultPermissions,
  scopeFor,
  parseRequirement,
  decide,
  validatePermissionsPatch,
} from "./evaluate.js";

// Synthetic personas only — the repo is public.
const person = (permissions, extra = {}) => ({
  clerkId: "user_test",
  isAdmin: false,
  mongoUser: { type: "normal", permissions },
  ...extra,
});
const admin = { clerkId: "user_admin", isAdmin: true, mongoUser: { type: "admin" } };
const agent = person({ scheduling: "view", bugs: "none", reports: "self", performance: "none" });
const scheduler = person({ scheduling: "edit", bugs: "view", reports: "edit", performance: "none" });
const noAccount = { clerkId: "user_ghost", noAccount: true };

test("registry: every area starts at none, has unique levels, a valid default and copy", () => {
  for (const area of AREA_KEYS) {
    const def = PERMISSION_AREAS[area];
    assert.equal(def.levels[0], "none", `${area} starts at none`);
    assert.equal(new Set(def.levels).size, def.levels.length, `${area} levels are unique`);
    assert.ok(def.levels.includes(def.defaultForNewUsers), `${area} default is a level`);
    if (def.selfLevel) assert.ok(def.levels.includes(def.selfLevel), `${area} selfLevel`);
    for (const level of def.levels) assert.ok(def.describe[level], `${area}:${level} described`);
  }
  assert.throws(() => {
    PERMISSION_AREAS.scheduling.levels.push("god");
  }, "the registry is frozen");
});

test("registry: the decided v1 areas and levels", () => {
  assert.deepEqual(
    Object.fromEntries(AREA_KEYS.map((a) => [a, PERMISSION_AREAS[a].levels])),
    {
      scheduling: ["none", "view", "edit"],
      bugs: ["none", "view", "edit"],
      reports: ["none", "self", "edit"],
      performance: ["none", "edit"],
    },
  );
  // Agents never see the performance score: there is no self level to grant.
  assert.equal(PERMISSION_AREAS.performance.levels.includes("self"), false);
});

test("public registry carries labels and copy only", () => {
  const pub = publicRegistry();
  assert.equal(pub.areas.length, AREA_KEYS.length);
  const performance = pub.areas.find((a) => a.key === "performance");
  assert.deepEqual(performance.levels.map((l) => l.key), ["none", "edit"]);
  assert.ok(performance.levels.every((l) => typeof l.description === "string"));
});

test("admins hold the top level of every area", () => {
  assert.deepEqual(effectivePermissions(admin), {
    scheduling: "edit",
    bugs: "edit",
    reports: "edit",
    performance: "edit",
  });
});

test("fails closed: no caller, no account, missing or malformed stored levels are none", () => {
  for (const caller of [null, undefined, noAccount, { clerkId: "x" }]) {
    assert.equal(levelOf(caller, "scheduling"), "none");
  }
  assert.equal(levelOf(person(undefined), "scheduling"), "none");
  assert.equal(levelOf(person({}), "bugs"), "none");
  assert.equal(levelOf(person({ scheduling: "god" }), "scheduling"), "none");
  assert.equal(levelOf(person({ scheduling: 2 }), "scheduling"), "none");
  assert.equal(levelOf(person({ performance: "self" }), "performance"), "none");
  // `type` alone never grants anything: only isAdmin (set by authz from type) does.
  assert.equal(levelOf(person({}, { mongoUser: { type: "admin" } }), "bugs"), "none");
});

test("unknown areas and levels in code throw", () => {
  assert.throws(() => levelOf(agent, "billing"), /Unknown permission area/);
  assert.throws(() => can(agent, "scheduling", "admin"), /Unknown level/);
  assert.throws(() => rank("reports", "view"), /Unknown level/);
});

test("levels are ordinal", () => {
  assert.equal(can(agent, "scheduling", "view"), true);
  assert.equal(can(agent, "scheduling", "edit"), false);
  assert.equal(can(scheduler, "scheduling", "view"), true);
  assert.equal(can(agent, "reports", "self"), true);
  assert.equal(can(agent, "reports", "edit"), false);
  assert.equal(can(agent, "performance", "edit"), false);
  assert.equal(can(agent, "bugs", "none"), true);
});

test("new users get the decided defaults", () => {
  assert.deepEqual(defaultPermissions(), {
    scheduling: "view",
    bugs: "none",
    reports: "self",
    performance: "none",
  });
});

test("scopeFor: self level scopes to the caller, higher levels see all, none is denied", () => {
  assert.deepEqual(scopeFor(agent, "reports"), { clerkId: "user_test" });
  assert.equal(scopeFor(scheduler, "reports"), "all");
  assert.equal(scopeFor(admin, "reports"), "all");
  assert.equal(scopeFor(person({ reports: "none" }), "reports"), null);
  assert.equal(scopeFor(null, "reports"), null);
  // Areas without a self level are all-or-nothing.
  assert.equal(scopeFor(agent, "scheduling"), "all");
  assert.equal(scopeFor(agent, "performance"), null);
});

test("parseRequirement accepts the specials and area:level, and rejects typos", () => {
  assert.deepEqual(parseRequirement("signedIn"), { kind: "signedIn" });
  assert.deepEqual(parseRequirement("bugs:edit"), { kind: "level", area: "bugs", level: "edit" });
  for (const bad of ["bug:edit", "bugs:write", "bugs", "bugs:edit:x", ":edit", "", "Admin"]) {
    assert.throws(() => parseRequirement(bad), undefined, bad);
  }
});

test("decide covers every requirement kind", () => {
  const req = (r) => parseRequirement(r);
  assert.equal(decide(null, req("public")).allowed, true);
  assert.equal(decide(null, req("webhook")).allowed, true);
  assert.equal(decide(null, req("mcp")).allowed, true);

  assert.deepEqual(decide(null, req("signedIn")), { allowed: false, reason: "no_session" });
  assert.deepEqual(decide(noAccount, req("signedIn")), {
    allowed: false,
    reason: "no_agendo_account",
  });
  assert.equal(decide(agent, req("signedIn")).allowed, true);

  assert.deepEqual(decide(agent, req("admin")), {
    allowed: false,
    reason: "not_admin",
    required: "admin",
  });
  assert.equal(decide(admin, req("admin")).allowed, true);

  assert.deepEqual(decide(agent, req("scheduling:edit")), {
    allowed: false,
    reason: "below_required",
    required: "scheduling:edit",
    have: "view",
  });
  assert.equal(decide(agent, req("scheduling:view")).allowed, true);
  assert.equal(decide(admin, req("performance:edit")).allowed, true);
  assert.equal(decide(noAccount, req("scheduling:view")).reason, "no_agendo_account");
});

test("validatePermissionsPatch accepts known areas and levels only", () => {
  assert.deepEqual(validatePermissionsPatch({}), { ok: true, errors: [] });
  assert.deepEqual(validatePermissionsPatch({ scheduling: "edit", reports: "self" }), {
    ok: true,
    errors: [],
  });
  const bad = validatePermissionsPatch({ billing: "edit", performance: "self", bugs: 1 });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 3);
  for (const notObject of [null, [], "edit", 3]) {
    assert.equal(validatePermissionsPatch(notObject).ok, false);
  }
});
