import { test } from "node:test";
import assert from "node:assert/strict";
import { asId, zendeskPath, ZendeskPathError } from "./zendeskPath.js";

// Synthetic values only — the repo is public.

test("an id goes into a path as itself", () => {
  assert.equal(zendeskPath`/api/v2/tickets/${123}.json`, "/api/v2/tickets/123.json");
  assert.equal(zendeskPath`/api/v2/tickets/${"456"}/comments.json`, "/api/v2/tickets/456/comments.json");
  assert.equal(zendeskPath`/api/v2/a/${1}/b/${2}/c`, "/api/v2/a/1/b/2/c");
  assert.equal(zendeskPath`/api/v2/ticket_fields.json`, "/api/v2/ticket_fields.json", "no slot, no check");
  assert.equal(zendeskPath`/x/${9007199254740991}`, "/x/9007199254740991");
});

test("anything that is not a positive whole-number id is refused, and never named", () => {
  const hostile = [
    "123/../../users",
    "1%2f..",
    "1%2e%2e",
    "12 3",
    "-1",
    "0",
    "00123",
    "1.5",
    "1e3",
    "0x10",
    "123\n",
    " 123",
    "123abc",
    "",
    "9".repeat(17),
    "١٢٣", // Arabic-Indic digits: not ASCII digits, so not an id
    -1,
    0,
    1.5,
    NaN,
    Infinity,
    1e21,
    9007199254740993,
    null,
    undefined,
    {},
    [],
    ["1"],
    { toString: () => "1" },
    true,
  ];
  for (const bad of hostile) {
    assert.throws(
      () => zendeskPath`/api/v2/tickets/${bad}.json`,
      (error) =>
        error instanceof ZendeskPathError &&
        /argument 1 of this Zendesk request is not a positive whole-number id/.test(error.message) &&
        error.logMessage === error.message &&
        // An empty or one-character value would "appear" in any message; check the rest.
        (String(bad).length < 3 || !error.message.includes(String(bad))),
      String(bad),
    );
  }
});

test("the second slot is checked too, and reported as the second", () => {
  assert.throws(() => zendeskPath`/a/${1}/b/${"x"}`, /argument 2 of this Zendesk request/);
});

test("asId reads a number or a string of digits, and nothing else", () => {
  assert.equal(asId(5), 5);
  assert.equal(asId("5"), 5);
  assert.equal(asId("5 "), null);
  assert.equal(asId(5.5), null);
  assert.equal(asId("05"), null);
  assert.equal(asId(true), null);
});
