import { test } from "node:test";
import assert from "node:assert/strict";
import { rosterShapeFor, scopeReportRows } from "./shaping.js";

// Synthetic people only — the repo is public.
const roster = [
  {
    id: "user_a",
    firstName: "Ana",
    lastName: "Test",
    imageUrl: "",
    hasImage: false,
    email: "ana@example.test",
    slingId: "1",
    type: "admin",
    timezone: "UTC",
    preferences: "<p>mornings</p>",
    preferencesUpdatedAt: null,
    preferencesUpdatedBy: null,
    permissions: null,
    permissionsUpdatedAt: null,
    permissionsUpdatedBy: null,
  },
];
const caller = (permissions, isAdmin = false) => ({
  clerkId: "user_me",
  isAdmin,
  mongoUser: { permissions },
});

test("admins get the whole roster, access fields included", () => {
  assert.deepEqual(rosterShapeFor(caller({}, true), roster), roster);
});

test("schedule builders get contact details and manager notes, never access fields", () => {
  const [row] = rosterShapeFor(caller({ scheduling: "edit" }), roster);
  assert.equal(row.email, "ana@example.test");
  assert.equal(row.preferences, "<p>mornings</p>");
  for (const field of ["type", "permissions", "permissionsUpdatedAt", "permissionsUpdatedBy"]) {
    assert.equal(field in row, false, field);
  }
});

test("everyone else gets names and avatars only", () => {
  for (const permissions of [{ scheduling: "view" }, {}, undefined]) {
    assert.deepEqual(rosterShapeFor(caller(permissions), roster), [
      { id: "user_a", firstName: "Ana", lastName: "Test", imageUrl: "", hasImage: false },
    ]);
  }
  assert.deepEqual(rosterShapeFor(null, roster)[0], {
    id: "user_a",
    firstName: "Ana",
    lastName: "Test",
    imageUrl: "",
    hasImage: false,
  });
});

const report = {
  rows: [
    { id: "user_me", name: "Me", hours: { Tickets: 1, Chats: 2, Other: 0 }, totalHours: 3 },
    { id: "user_b", name: "B", hours: { Tickets: 5, Chats: 0, Other: 1 }, totalHours: 6 },
  ],
  computedAt: "2026-10-07T00:00:00.000Z",
  fromCache: true,
};

test("the hours report: everyone for 'all', own row for self, nothing otherwise", () => {
  assert.equal(scopeReportRows(report, "all"), report);
  assert.deepEqual(scopeReportRows(report, { clerkId: "user_me" }), {
    ...report,
    rows: [report.rows[0]],
  });
  assert.deepEqual(scopeReportRows(report, { clerkId: "user_nobody" }).rows, []);
  assert.deepEqual(scopeReportRows(report, null).rows, []);
});
