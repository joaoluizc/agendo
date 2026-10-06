// Synthetic names and numbers only — this repository is public.
import { test } from "node:test";
import assert from "node:assert/strict";
import { quarterBounds, previousQuarter, parsePeriodKey, periodKey } from "./quarters.js";
import { parsePaste, parseNumber, parsePercent } from "./parsePaste.js";
import { normalizeName, matchAgent } from "./names.js";
import { defaultRegions } from "./regions.js";

test("quarters start at 03:00Z on their first day (team is UTC-3)", () => {
  const q3 = quarterBounds(2026, 3);
  assert.equal(q3.startsAt.toISOString(), "2026-07-01T03:00:00.000Z");
  assert.equal(q3.endsAt.toISOString(), "2026-10-01T03:00:00.000Z");
  assert.equal(quarterBounds(2026, 4).endsAt.toISOString(), "2027-01-01T03:00:00.000Z");
  assert.deepEqual(previousQuarter(2027, 1), { year: 2026, quarter: 4 });
  assert.deepEqual(parsePeriodKey(periodKey(2026, 3)), { year: 2026, quarter: 3 });
  assert.equal(parsePeriodKey("2026-Q5"), null);
});

test("numbers and percentages in US and Brazilian formats", () => {
  assert.equal(parseNumber("1,070").value, 1070);
  assert.equal(parseNumber("93,5").value, 93.5);
  assert.equal(parseNumber("1.234,5").value, 1234.5);
  assert.equal(parseNumber("-").value, null);
  assert.equal(parseNumber("#DIV/0!").value, null);
  assert.ok(parseNumber("abc").error);
  assert.equal(parsePercent("66.7%").value, 0.667);
  assert.equal(parsePercent("93,5").value, 0.935);
  assert.equal(parsePercent("0.9").value, 0.9);
  assert.equal(parsePercent("100%").value, 1);
  assert.ok(parsePercent("140%").error);
});

test("tickets tab pasted from the sheet: header by name, Surveys not Total Surveys", () => {
  const text = [
    "#\tTicket Assignee\tTotal Shifts\t# Solved Tickets\tCSAT\tSurveys\t% Rated\tTotal Interactions\tTotal Surveys",
    "1\tAna Lima\t262\t1,070\t66.7%\t54\t5.8%\t1241\t190",
    "2\t-\t\t\t\t\t\t\t",
    "3\tBruno Costa\t45\t34\t100.0%\t1\t2.9%\t319\t137",
    "4\tCarla Dias\t\t\t\t0.0\t\t0\t0",
    "\tTotal\t307\t1104\t\t55",
  ].join("\n");
  const parsed = parsePaste(text, "tickets");
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.columns.surveys, 5);
  assert.deepEqual(
    parsed.rows.map((r) => [r.rawName, r.values.count, r.values.csat, r.values.surveys]),
    [
      ["Ana Lima", 1070, 0.667, 54],
      ["Bruno Costa", 34, 1, 1],
    ],
  );
  assert.deepEqual(
    parsed.skipped.map((s) => s.reason),
    ["no agent name", "no values", "summary row"],
  );
});

test("CSV with quotes, no header → positional; duplicates are errors", () => {
  const text = 'Ana Lima,"1,070",95%,10\nBruno Costa,12,90%,0\nana lima,3,80%,2';
  const parsed = parsePaste(text, "chats");
  assert.equal(parsed.headerLine, null);
  assert.equal(parsed.rows[0].values.count, 1070);
  assert.equal(parsed.rows[1].values.csat, null, "CSAT without surveys is dropped");
  assert.match(parsed.rows[2].errors[0], /duplicate of line 1/);
});

test("hours from the previous-quarter block of the sheet", () => {
  const text = "Q2 2026\tChats\tChat Shifts\tChat Prod\tTickets\tTicket Shifts\nAna Lima\t310\t339\t0.9\t722\t";
  const parsed = parsePaste(text, "hours");
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows[0].values, { chatsHours: 339, ticketsHours: null });
});

test("bad values are row errors, not crashes", () => {
  const parsed = parsePaste("Agent\tServed\tCSAT\tSurveys\nAna Lima\t12.5\tabc\t3", "chats");
  assert.equal(parsed.rows[0].errors.length, 2);
});

test("name matching: email, alias, exact; fuzzy only as suggestions", () => {
  const users = [
    { clerkId: "u1", firstName: "Ana", lastName: "Lima", email: "ana@example.com" },
    { clerkId: "u2", firstName: "João", lastName: "Souza", email: "joao@example.com" },
    { clerkId: "u3", firstName: "Marko", lastName: "Reyes", email: "m@example.com" },
  ];
  const aliases = new Map([["the boss", "u2"]]);
  assert.equal(normalizeName("  João   SOUZA "), "joao souza");
  assert.deepEqual(matchAgent({ rawName: "x", email: "ANA@example.com" }, users, aliases), { clerkId: "u1", by: "email" });
  assert.deepEqual(matchAgent({ rawName: "The Boss" }, users, aliases), { clerkId: "u2", by: "alias" });
  assert.deepEqual(matchAgent({ rawName: "Joao Souza" }, users, aliases), { clerkId: "u2", by: "exact" });
  const fuzzy = matchAgent({ rawName: "Mark Kevin Reyes" }, users, aliases);
  assert.equal(fuzzy.clerkId, null);
  assert.equal(fuzzy.candidates[0].clerkId, "u3");
  const middle = matchAgent({ rawName: "Ana Maria Lima" }, users, aliases);
  assert.equal(middle.clerkId, null, "a middle name is a suggestion, never applied");
  assert.equal(middle.candidates[0].clerkId, "u1");
});

test("default regions only for agents in exactly one flag location", () => {
  const regions = defaultRegions([
    { name: "Colorado", assignedUsers: ["u1", "u3"] },
    { name: "LATAM", assignedUsers: ["u2", "u3"] },
    { name: "Somewhere else", assignedUsers: ["u4"] },
  ]);
  assert.equal(regions.get("u1"), "US");
  assert.equal(regions.get("u2"), "BR");
  assert.equal(regions.has("u3"), false);
  assert.equal(regions.has("u4"), false);
});
