import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTicketQuery, ZendeskQueryError } from "./zendeskTicketQuery.js";

// Synthetic values only — the repo is public. Every unusual character below is built from
// its code point, so this file holds none of them raw.

const cp = (...codes) => String.fromCodePoint(...codes);
const q = (filters) => buildTicketQuery(filters).query;
const refused = (filters, pattern) =>
  assert.throws(
    () => buildTicketQuery(filters),
    (error) => error instanceof ZendeskQueryError && pattern.test(error.message),
    JSON.stringify(filters),
  );

/** Split a query into top-level tokens, the way Zendesk reads it: spaces inside quotes do not split. */
function tokenize(query) {
  const tokens = [];
  let current = "";
  let quoted = false;
  for (const char of query) {
    if (char === '"') quoted = !quoted;
    if (char === " " && !quoted) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  assert.equal(quoted, false, `unbalanced quotes in: ${query}`);
  if (current) tokens.push(current);
  return tokens;
}

/** Characters a stricter reader could take for a double quote. */
const QUOTE_LOOKALIKES = new Set([0x201c, 0x201d, 0x201e, 0x201f, 0xff02, 0xab, 0xbb, 0x2033, 0x301d, 0x301e, 0x275d, 0x275e].map((code) => String.fromCodePoint(code)));

/**
 * A harsher reading than `tokenize`: fold the text to NFKC, treat quote lookalikes as quotes,
 * and break on any Unicode whitespace or separator outside quotes. We do not know how Zendesk
 * tokenizes Unicode, so the guarantee must hold under the strictest plausible reading.
 */
function strictTokenize(query) {
  const tokens = [];
  let current = "";
  let quoted = false;
  for (let char of query.normalize("NFKC")) {
    if (QUOTE_LOOKALIKES.has(char)) char = '"';
    if (char === '"') quoted = !quoted;
    if (!quoted && (/\s/u.test(char) || char === cp(0x85) || /\p{Z}/u.test(char) || /\p{Cc}/u.test(char))) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return { tokens, balanced: !quoted };
}

/* ------------------------------ the shape of a query ------------------------------ */

test("every filter becomes its Zendesk condition, in a fixed order", () => {
  assert.equal(
    q({
      status: ["open", "pending"],
      custom_status_id: 42,
      priority: ["high", "urgent"],
      ticket_type: ["problem"],
      assignee: "none",
      requester: "jane@example.test",
      organization: "Example Web Studio",
      group: "12345",
      brand: "Example Brand",
      form: "Standard Form",
      include_tags: ["billing", "refund"],
      exclude_tags: ["spam"],
      has_attachments: true,
      start_date: "2026-10-01",
      end_date: "2026-10-06",
      solved_start_date: "2026-10-02T09:00:00Z",
      custom_field_id: 360012345678,
      custom_field_value: "Enterprise Plan",
      text: "site not loading",
    }),
    [
      "status:open status:pending",
      "custom_status_id:42",
      "priority:high priority:urgent",
      "ticket_type:problem",
      "assignee:none",
      "requester:jane@example.test",
      'organization:"Example Web Studio"',
      "group:12345",
      'brand:"Example Brand"',
      'form:"Standard Form"',
      "tags:billing tags:refund",
      "-tags:spam",
      "has_attachment:true",
      "created>=2026-10-01T00:00:00Z created<2026-10-07T00:00:00Z",
      "solved>=2026-10-02T09:00:00Z",
      'custom_field_360012345678:"Enterprise Plan"',
      '"site" "not" "loading"',
    ].join(" "),
  );
});

test("one status is one condition; repeated statuses are Zendesk's 'any of'", () => {
  assert.equal(q({ status: ["open"] }), "status:open");
  assert.equal(q({ status: ["open", "open", "pending"] }), "status:open status:pending");
});

test("values are bare only when they safely can be; otherwise quoted from a small alphabet", () => {
  assert.equal(q({ assignee: "12345" }), "assignee:12345");
  assert.equal(q({ assignee: "+15551234567" }), "assignee:+15551234567");
  assert.equal(q({ assignee: "jane.doe@example.test" }), "assignee:jane.doe@example.test");
  assert.equal(q({ assignee: "Jane Doe" }), 'assignee:"Jane Doe"');
  assert.equal(q({ assignee: "Jo" + cp(0xe3) + "o Luiz" }), 'assignee:"Jo' + cp(0xe3) + 'o Luiz"');
  assert.equal(q({ assignee: "-leading" }), 'assignee:"-leading"');
  assert.equal(q({ organization: "Smith & Sons (UK), Ltd." }), 'organization:"Smith & Sons (UK), Ltd."');
  assert.equal(q({ organization: "O'Brien/Web" }), 'organization:"O\'Brien/Web"');
  assert.equal(q({ organization: "  padded  " }), "organization:padded");
  // The bare alphabet is exactly letters, digits and @ . _ + - : a colon or an equals sign
  // is refused, and a bracket or comma needs quotes.
  refused({ assignee: "a:b" }, /assignee may only contain/);
  refused({ assignee: "a=b" }, /assignee may only contain/);
  assert.equal(q({ assignee: "a(b)" }), 'assignee:"a(b)"');
  assert.equal(q({ assignee: "a,b" }), 'assignee:"a,b"');
  assert.equal(q({ assignee: "a&b" }), 'assignee:"a&b"');
  assert.equal(q({ assignee: "a/b" }), 'assignee:"a/b"');
  assert.equal(q({ assignee: "a'b" }), `assignee:"a'b"`);
});

test("free text is folded to its plain form before it is split into words", () => {
  assert.equal(q({ text: `${cp(0xfb01)}sh ${cp(0xff21)}${cp(0xff22)}` }), '"fish" "AB"');
});

/* ------------------------------ a value can add nothing ------------------------------ */

test("anything outside the small alphabet is refused, not altered, and never echoed", () => {
  const secret = "secret-marker";
  const outside = [
    '"', "\\", ":", "*", "<", ">", "=", "[", "]", "{", "}", "|", ";", "#", "%", "!", "?", "~", "^", "`", "$",
    "\n", "\r", "\t", cp(0), cp(0x1f), cp(0x7f), cp(0x85), cp(0xa0), cp(0x2028), cp(0x2029), cp(0x3000),
    cp(0x201c), cp(0x201d), cp(0xff02), cp(0xff1a), cp(0xab), cp(0x2033),
    cp(0x200b), cp(0x202e), cp(0xfeff), cp(0x2011), cp(0x2212),
  ];
  for (const field of ["assignee", "requester", "organization", "group", "brand", "form"]) {
    for (const bad of outside) {
      assert.throws(
        () => buildTicketQuery({ [field]: `${secret} ${bad} tail` }),
        (error) =>
          error instanceof ZendeskQueryError &&
          error.message.includes(field) &&
          !error.message.includes(secret) &&
          error.logMessage === error.message,
        `${field}: U+${bad.codePointAt(0).toString(16)}`,
      );
    }
  }
  refused({ assignee: "" }, /assignee is empty/);
  refused({ assignee: "   " }, /assignee is empty/);
  refused({ assignee: 12345 }, /assignee must be text/);
  refused({ assignee: "x".repeat(201) }, /too long/);
});

test("a character Unicode folds into another is refused, so it cannot become an operator", () => {
  // Each of these is not its own NFKC form: a fullwidth letter, a ligature, a superscript.
  for (const folded of [cp(0xff21), cp(0xfb01), cp(0xb2), cp(0xfdfa), cp(0x2460)]) {
    refused({ organization: `Acme ${folded}` }, /plain text, without fullwidth/);
    refused({ include_tags: [`tag${folded}`] }, /include_tags entries may only use/);
  }
  // Plain accented letters are already in their NFKC form and are fine.
  assert.equal(q({ organization: "Caf" + cp(0xe9) + " Noir" }), 'organization:"Caf' + cp(0xe9) + ' Noir"');
});

test("'me' is refused: it would mean the shared Zendesk user, not the person asking", () => {
  refused({ assignee: "me" }, /would mean the shared Zendesk user/);
  refused({ requester: " ME " }, /would mean the shared Zendesk user/);
  assert.equal(q({ assignee: "none" }), "assignee:none");
});

test("'none' is accepted only where Zendesk documents it", () => {
  for (const field of ["assignee", "requester", "organization", "group"]) assert.equal(q({ [field]: "none" }), `${field}:none`);
  refused({ brand: "none" }, /brand: "none" is not a documented value/);
  refused({ form: "NONE" }, /form: "none" is not a documented value/);
  refused({ custom_field_id: 5, custom_field_value: "none" }, /custom_field_value: "none" is not a documented value/);
  refused({ include_tags: ["none"] }, /a tag named none cannot be searched/);
});

test("the form is searched by name; an id would silently find nothing, so it is refused", () => {
  assert.equal(q({ form: "Standard" }), "form:Standard");
  refused({ form: "7000" }, /form takes the ticket form's name/);
});

test("free text is searched for as words; operators and lookalikes typed into it are never obeyed", () => {
  const query = q({ text: 'refund status:solved -tags:vip type:user OR * "quoted" back\\slash' });
  assert.equal(
    query,
    '"refund" "status" "solved" "-tags" "vip" "type" "user" "OR" "quoted" "back" "slash"',
  );
  // Folded, then stripped: a fullwidth quote and colon are an ordinary quote and colon first.
  assert.equal(q({ text: `${cp(0xff02)}status${cp(0xff1a)}solved${cp(0xff02)} refund` }), '"status" "solved" "refund"');
  // Smart quotes, guillemets, separators and invisibles are not part of a word.
  assert.equal(
    q({ text: `a${cp(0x201c)}b${cp(0x201d)}c${cp(0xab)}d${cp(0xbb)}e${cp(0x2028)}f${cp(0x200b)}g${cp(0x3000)}h` }),
    '"a" "b" "c" "d" "e" "f" "g" "h"',
  );
  for (const token of tokenize(query)) assert.match(token, /^"[^"]+"$/);

  refused({ text: "   " }, /text has no searchable words/);
  refused({ text: '"\\' }, /text has no searchable words/);
  refused({ text: Array.from({ length: 21 }, (_, i) => `w${i}`).join(" ") }, /too many words/);
  assert.equal(tokenize(q({ text: Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ") })).length, 20);
});

test("the object type can never be set from a filter", () => {
  // `type:` in an export query is an error in Zendesk, and `type:user` would change what is searched.
  const hostile = [
    { text: "type:user" },
    { assignee: 'x" type:user' },
    { include_tags: ["type:user"] },
    { custom_field_id: 1, custom_field_value: 'a" type:user' },
    { status: ["open", "type:user"] },
  ];
  for (const filters of hostile) {
    let query = null;
    try {
      query = q(filters);
    } catch (error) {
      assert.ok(error instanceof ZendeskQueryError);
    }
    if (query) assert.equal(tokenize(query).some((token) => /^-?type:/.test(token)), false, query);
  }
  // And a field this tool does not have is ignored, not passed through.
  assert.equal(q({ status: ["open"], type: "user", query: "type:user" }), "status:open");
});

/* ------------------------------ tags ------------------------------ */

test("tags: include means any of, require means all of, and the two never mix", () => {
  assert.equal(q({ include_tags: ["a", "b"] }), "tags:a tags:b");
  assert.equal(q({ require_tags: ["a", "b", "c"] }), 'tags:"a b c"');
  assert.equal(q({ require_tags: ["a"] }), "tags:a");
  assert.equal(q({ require_tags: ["a", "b"], exclude_tags: ["x", "y", "x"] }), 'tags:"a b" -tags:x -tags:y');
  assert.equal(q({ include_tags: [" padded "] }), "tags:padded", "tags are trimmed");
  refused({ include_tags: ["a"], require_tags: ["b"] }, /not both/);
});

test("tags use a conservative alphabet; anything else is refused", () => {
  for (const bad of ["two words", 'quo"te', "-leading", "colon:tag", "star*", "", "a".repeat(101), "back\\slash", "new\nline"]) {
    refused({ include_tags: [bad] }, /include_tags entries may only use/);
    refused({ exclude_tags: [bad] }, /exclude_tags entries may only use/);
    refused({ require_tags: [bad] }, /require_tags entries may only use/);
  }
  refused({ include_tags: [] }, /at least one tag/);
  refused({ include_tags: [42] }, /may only use/);
  assert.equal(
    q({ include_tags: ["vip_customer", "tier-2", "v1.5", cp(0xdc) + "n" + cp(0xef) + "code"] }),
    "tags:vip_customer tags:tier-2 tags:v1.5 tags:" + cp(0xdc) + "n" + cp(0xef) + "code",
  );
});

test("a search of exclusions alone is refused: it can match nothing, which reads as 'no such tickets'", () => {
  refused({ exclude_tags: ["spam"] }, /exclusions alone/);
  assert.equal(q({ exclude_tags: ["spam"], status: ["open"] }), "status:open -tags:spam");
});

/* ------------------------------ dates ------------------------------ */

test("a bare day is a UTC day; the end day is included whole", () => {
  assert.equal(q({ start_date: "2026-10-01" }), "created>=2026-10-01T00:00:00Z");
  assert.equal(q({ end_date: "2026-10-06" }), "created<2026-10-07T00:00:00Z");
  assert.equal(q({ start_date: "2026-10-06", end_date: "2026-10-06" }), "created>=2026-10-06T00:00:00Z created<2026-10-07T00:00:00Z");
  assert.equal(q({ end_date: "2026-12-31" }), "created<2027-01-01T00:00:00Z", "rolls over the year");
  assert.equal(q({ end_date: "2028-02-29" }), "created<2028-03-01T00:00:00Z", "a real leap day");
  assert.equal(q({ end_date: "9998-12-31" }), "created<9999-01-01T00:00:00Z", "the last day that can be included");
});

test("an exact time keeps its instant, converted to UTC, and is inclusive at the end", () => {
  assert.equal(q({ start_date: "2026-10-06T15:30:00Z" }), "created>=2026-10-06T15:30:00Z");
  assert.equal(q({ end_date: "2026-10-06T15:30:00+02:00" }), "created<=2026-10-06T13:30:00Z");
  assert.equal(q({ end_date: "2026-10-06T15:30:00.250Z" }), "created<=2026-10-06T15:30:00Z");
  assert.equal(q({ start_date: "2026-10-06T15:30Z" }), "created>=2026-10-06T15:30:00Z");
  assert.equal(q({ solved_end_date: "2026-10-06" }), "solved<2026-10-07T00:00:00Z");
  assert.equal(q({ start_date: "2026-10-06T23:59:59-14:00" }), "created>=2026-10-07T13:59:59Z");
});

test("dates that are ambiguous or wrong are refused", () => {
  for (const bad of ["2026-10-06T15:30:00", "06/10/2026", "yesterday", "4hours", "2026-13-01", "", "2026-10-06 15:30:00Z", 20261006]) {
    refused({ start_date: bad }, /start_date must be a day|start_date is not a real date/);
    refused({ solved_end_date: bad }, /solved_end_date must be a day|solved_end_date is not a real date/);
  }
  refused({ start_date: "2026-10-07", end_date: "2026-10-06" }, /end_date is before start_date/);
  refused({ start_date: "2026-10-06T12:00:00Z", end_date: "2026-10-06T12:00:00Z" }, /end_date is before start_date/);
});

test("a date or time that does not exist is refused, never moved to one that does", () => {
  // `new Date` alone would turn each of these into a different, real instant.
  for (const impossible of [
    "2026-02-30",
    "2026-02-30T10:00:00Z",
    "2026-04-31T10:00:00Z",
    "2027-02-29T00:00:00Z",
    "2026-00-10T00:00:00Z",
    "2026-10-00",
    "2026-10-06T24:00:00Z",
    "2026-10-06T10:60:00Z",
    "2026-10-06T10:00:60Z",
    "2026-10-06T10:00:00+15:00",
    "2026-10-06T10:00:00+05:60",
    "1969-12-31",
    "9999-12-31",
    "0000-01-01",
  ]) {
    refused({ start_date: impossible }, /start_date is not a real date and time/);
    refused({ end_date: impossible }, /end_date is not a real date and time/);
  }
});

/* ------------------------------ the rest ------------------------------ */

test("a custom field needs both its id and its value", () => {
  assert.equal(q({ custom_field_id: 99, custom_field_value: "checked" }), "custom_field_99:checked");
  refused({ custom_field_id: 99 }, /go together/);
  refused({ custom_field_value: "x" }, /go together/);
  refused({ custom_field_id: 0, custom_field_value: "x" }, /custom_field_id must be a positive whole number/);
  refused({ custom_field_id: 1.5, custom_field_value: "x" }, /positive whole number/);
  refused({ custom_field_id: "99; status:solved", custom_field_value: "x" }, /positive whole number/);
});

test("ids must be positive whole numbers a double holds exactly", () => {
  // zod's .int() lets these through; the builder is the barrier that does not.
  for (const bad of [1e21, 9007199254740993, -5, 0, NaN, Infinity, 2 ** 53]) {
    refused({ custom_status_id: bad }, /custom_status_id must be a positive whole number/);
    refused({ custom_field_id: bad, custom_field_value: "x" }, /custom_field_id must be a positive whole number/);
  }
  assert.equal(q({ custom_status_id: 9007199254740991 }), "custom_status_id:9007199254740991");
});

test("enumerations are checked against fixed lists", () => {
  refused({ status: ["open", "deleted"] }, /status must be one of: new, open/);
  refused({ status: [] }, /status must list at least one value/);
  refused({ status: "open" }, /status must list at least one value/);
  refused({ priority: ["extreme"] }, /priority must be one of/);
  refused({ ticket_type: ["bug"] }, /ticket_type must be one of: question, incident, problem, task/);
  refused({ has_attachments: "yes" }, /has_attachments must be true or false/);
  assert.equal(q({ has_attachments: false }), "has_attachment:false");
});

test("a search with no filter is refused, with the cheapest way to bound it", () => {
  for (const filters of [{}, undefined, null, { unknown: "x" }]) refused(filters, /give at least one filter/);
});

test("a query too long for Zendesk is refused", () => {
  const manyTags = Array.from({ length: 50 }, (_, i) => `tag${i}`);
  refused({ include_tags: manyTags, text: Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ") }, /too many conditions/);
});

/* ------------------------------ a value can add nothing: property tests ------------------------------ */

/** A small deterministic generator, so a failure can be reproduced. */
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const HOSTILE = [
  ...'"\\ :-*<>=()[]{}|&;,#%+@._\n\r\t\'',
  ..."abcXYZ0189",
  " status:solved", " OR ", " -tags:", " type:user", ' " ', "organization:", "custom_field_1:", "created>2000-01-01", " has_attachment:true ",
  // Lookalikes and separators a stricter reader might fold or break on.
  cp(0), cp(0x1f), cp(0x7f), cp(0x85), cp(0xa0), cp(0xad), cp(0x2028), cp(0x2029), cp(0x3000), cp(0x2003),
  cp(0x201c), cp(0x201d), cp(0x201e), cp(0xff02), cp(0xab), cp(0xbb), cp(0x2033), cp(0x301d),
  cp(0xff1a), cp(0xff0d), cp(0x2010), cp(0x2011), cp(0x2212), cp(0xfe63), cp(0xff0a),
  cp(0x200b), cp(0x200d), cp(0x202e), cp(0x2066), cp(0xfeff), cp(0xfdfa), cp(0xfb01), cp(0x2460), cp(0xff21),
  cp(0xe9), cp(0x3b1), cp(0x4e2d), cp(0x1f600),
];

function hostileString(random) {
  const length = 1 + Math.floor(random() * 25);
  return Array.from({ length }, () => HOSTILE[Math.floor(random() * HOSTILE.length)]).join("");
}

/** What an accepted query may contain: no control or separator character other than a plain space. */
const NO_SLIPPERY = /[\p{C}\p{Zl}\p{Zp}]|[^\S ]|\p{Zs}(?<! )/u;

function assertOneCondition(query, shape, label) {
  const loose = tokenize(query);
  assert.equal(loose.length, 1, `${label} became ${query}`);
  assert.match(loose[0], shape, query);
  // And under the strict reading too: folded, lookalike quotes as quotes, breaking on every separator.
  const strict = strictTokenize(query);
  assert.equal(strict.balanced, true, `${label}: quotes unbalanced under a strict reading of ${JSON.stringify(query)}`);
  assert.equal(strict.tokens.length, 1, `${label}: ${JSON.stringify(query)} reads as ${strict.tokens.length} conditions under a strict reading`);
  assert.doesNotMatch(query, NO_SLIPPERY, `${label}: ${JSON.stringify(query)} holds a control or separator character`);
}

test("whatever a value contains, it yields exactly one condition of the expected kind — or is refused", () => {
  const random = generator(20261016);
  const oneCondition = [
    ["assignee", (v) => ({ assignee: v }), /^assignee:/],
    ["requester", (v) => ({ requester: v }), /^requester:/],
    ["organization", (v) => ({ organization: v }), /^organization:/],
    ["group", (v) => ({ group: v }), /^group:/],
    ["brand", (v) => ({ brand: v }), /^brand:/],
    ["form", (v) => ({ form: v }), /^form:/],
    ["custom_field_value", (v) => ({ custom_field_id: 7, custom_field_value: v }), /^custom_field_7:/],
  ];
  let accepted = 0;
  let rejected = 0;
  for (const [field, build, shape] of oneCondition) {
    for (let i = 0; i < 4000; i += 1) {
      const hostile = hostileString(random);
      let query;
      try {
        query = q(build(hostile));
      } catch (error) {
        assert.ok(error instanceof ZendeskQueryError, `${field}: ${JSON.stringify(hostile)} threw something else`);
        rejected += 1;
        continue;
      }
      accepted += 1;
      assertOneCondition(query, shape, `${field}: ${JSON.stringify(hostile)}`);
    }
  }
  assert.ok(accepted > 300 && rejected > 300, `both outcomes exercised (accepted ${accepted}, rejected ${rejected})`);
});

test("whatever free text contains, every token it yields is one quoted word, under any reading", () => {
  const random = generator(7);
  let accepted = 0;
  for (let i = 0; i < 6000; i += 1) {
    const hostile = hostileString(random) + " " + hostileString(random);
    let query;
    try {
      query = q({ text: hostile });
    } catch (error) {
      assert.ok(error instanceof ZendeskQueryError);
      continue;
    }
    accepted += 1;
    for (const token of tokenize(query)) assert.match(token, /^"[^"\\]+"$/, `${JSON.stringify(hostile)} -> ${query}`);
    const strict = strictTokenize(query);
    assert.equal(strict.balanced, true, JSON.stringify(query));
    for (const token of strict.tokens) assert.match(token, /^"[^"]+"$/u, `${JSON.stringify(hostile)} -> ${JSON.stringify(query)}`);
    assert.equal(strict.tokens.length, tokenize(query).length, "the same tokens, however it is read");
    assert.doesNotMatch(query, NO_SLIPPERY);
  }
  assert.ok(accepted > 1500);
});

test("whatever a tag contains, it yields only tags: conditions — or is refused", () => {
  const random = generator(99);
  let accepted = 0;
  for (let i = 0; i < 4000; i += 1) {
    const hostile = hostileString(random);
    for (const filters of [
      { status: ["open"], include_tags: [hostile] },
      { status: ["open"], exclude_tags: [hostile] },
      { status: ["open"], require_tags: [hostile, "ok"] },
    ]) {
      let query;
      try {
        query = q(filters);
      } catch (error) {
        assert.ok(error instanceof ZendeskQueryError);
        continue;
      }
      accepted += 1;
      const [, ...rest] = tokenize(query);
      assert.ok(rest.length >= 1 && rest.length <= 2, query);
      for (const token of rest) assert.match(token, /^-?tags:/, query);
      const strict = strictTokenize(query);
      assert.equal(strict.balanced, true);
      assert.equal(strict.tokens.length, tokenize(query).length, JSON.stringify(query));
      assert.doesNotMatch(query, NO_SLIPPERY);
    }
  }
  assert.ok(accepted > 100);
});

test("dates cannot add anything either: any string is a real instant, or refused", () => {
  const random = generator(31);
  let accepted = 0;
  const pad = (n) => String(n).padStart(2, "0");
  const realDate = () => {
    const day = `${2000 + Math.floor(random() * 30)}-${pad(1 + Math.floor(random() * 12))}-${pad(1 + Math.floor(random() * 28))}`;
    return random() < 0.5 ? day : `${day}T${pad(Math.floor(random() * 24))}:${pad(Math.floor(random() * 60))}:${pad(Math.floor(random() * 60))}Z`;
  };
  for (let i = 0; i < 4000; i += 1) {
    // A third pure noise, a third a real date with noise around it, a third a real date.
    const kind = Math.floor(random() * 3);
    const hostile = kind === 0 ? hostileString(random) : kind === 1 ? hostileString(random) + realDate() + hostileString(random) : realDate();
    for (const field of ["start_date", "end_date", "solved_start_date", "solved_end_date"]) {
      let query;
      try {
        query = q({ [field]: hostile });
      } catch (error) {
        assert.ok(error instanceof ZendeskQueryError);
        continue;
      }
      accepted += 1;
      assert.match(query, /^(created|solved)(>=|<=|<)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, query);
    }
  }
  assert.ok(accepted > 3000, `real dates were accepted (${accepted})`);
});
