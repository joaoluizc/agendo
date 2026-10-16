import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrganizationQuery, buildUserQuery, ZendeskQueryError } from "./zendeskPeopleQuery.js";
import { NO_SLIPPERY, cp, generator, sample, strictTokenize, tokenize } from "../testing/queryKit.js";

// Synthetic values only — the repo is public.

const user = (filters) => buildUserQuery(filters).query;
const org = (filters) => buildOrganizationQuery(filters).query;
const refused = (build, filters, pattern) =>
  assert.throws(
    () => build(filters),
    (error) => error instanceof ZendeskQueryError && pattern.test(error.message),
    JSON.stringify(filters),
  );

/* ------------------------------ users ------------------------------ */

test("every user filter becomes its Zendesk condition, in a fixed order", () => {
  assert.equal(
    user({
      name: "Jane Doe",
      email: "jane@example.test",
      role: ["agent", "admin"],
      organization: "Example Web Studio",
      group: "Tier 2",
      phone: "+15551234567",
      external_id: "ext-42",
      include_tags: ["vip", "beta"],
      exclude_tags: ["spam"],
      is_verified: true,
      is_suspended: false,
      start_date: "2026-10-01",
      end_date: "2026-10-06",
    }),
    [
      'name:"Jane Doe"',
      "email:jane@example.test",
      "role:agent role:admin",
      'organization:"Example Web Studio"',
      'group:"Tier 2"',
      "phone:+15551234567",
      "external_id:ext-42",
      "tags:vip tags:beta",
      "-tags:spam",
      "is_verified:true",
      "is_suspended:false",
      "created>=2026-10-01T00:00:00Z created<2026-10-07T00:00:00Z",
    ].join(" "),
  );
});

test("roles are the three Zendesk has, and the end user's is spelt with a hyphen", () => {
  assert.equal(user({ role: ["end-user"] }), "role:end-user");
  assert.equal(user({ role: ["agent", "agent"] }), "role:agent");
  refused(buildUserQuery, { role: ["customer"] }, /role must be one of: end-user, agent, admin/);
  refused(buildUserQuery, { role: [] }, /role must list at least one value/);
  refused(buildUserQuery, { role: "agent" }, /role must list at least one value/);
});

test("'none' is accepted where Zendesk documents it for users, and refused for name and group", () => {
  for (const field of ["email", "organization", "phone", "external_id"]) assert.equal(user({ [field]: "none" }), `${field}:none`);
  refused(buildUserQuery, { name: "none" }, /name: "none" is not a documented value/);
  refused(buildUserQuery, { group: "NONE" }, /group: "none" is not a documented value/);
  refused(buildUserQuery, { include_tags: ["none"] }, /a tag named none cannot be searched/);
});

test("a user search needs a positive filter, and refuses what could match nothing", () => {
  refused(buildUserQuery, {}, /give at least one filter/);
  refused(buildUserQuery, undefined, /give at least one filter/);
  refused(buildUserQuery, { exclude_tags: ["spam"] }, /exclusions alone/);
  refused(buildUserQuery, { is_verified: "yes" }, /is_verified must be true or false/);
  refused(buildUserQuery, { is_suspended: 1 }, /is_suspended must be true or false/);
  refused(buildUserQuery, { include_tags: ["a"], require_tags: ["b"] }, /not both/);
  assert.equal(user({ exclude_tags: ["spam"], role: ["agent"] }), "role:agent -tags:spam");
});

test("a field a user search does not have is ignored, and no filter can set the type", () => {
  assert.equal(user({ role: ["agent"], type: "ticket", query: "type:ticket", text: "anything" }), "role:agent");
  for (const filters of [{ name: "type:ticket" }, { email: 'x" type:ticket' }, { organization: "a type:ticket" }]) {
    let query = null;
    try {
      query = user(filters);
    } catch (error) {
      assert.ok(error instanceof ZendeskQueryError);
    }
    if (query) assert.equal(tokenize(query).some((token) => /^-?type:/.test(token)), false, query);
  }
});

test("user names and emails go through the same allowlist as everywhere", () => {
  assert.equal(user({ name: "Jo" + cp(0xe3) + "o" }), 'name:"Jo' + cp(0xe3) + 'o"');
  for (const bad of ['a"b', "a\\b", "a:b", "a*b", "a<b", "a=b", "a\nb", "a" + cp(0x2028) + "b", "a" + cp(0x201c) + "b", "a" + cp(0xff1a) + "b", "a" + cp(0xa0) + "b"]) {
    for (const field of ["name", "email", "organization", "group", "phone", "external_id"]) {
      refused(buildUserQuery, { [field]: bad }, new RegExp(`${field} may only contain|${field} must be plain text`));
    }
  }
});

/* ------------------------------ organizations ------------------------------ */

test("every organization filter becomes its Zendesk condition, in a fixed order", () => {
  assert.equal(
    org({
      name: "Example Web Studio",
      external_id: "ext-7",
      require_tags: ["enterprise", "emea"],
      start_date: "2026-01-01",
    }),
    'name:"Example Web Studio" external_id:ext-7 tags:"enterprise emea" created>=2026-01-01T00:00:00Z',
  );
  assert.equal(org({ name: "Acme" }), "name:Acme");
  assert.equal(org({ external_id: "none" }), "external_id:none");
});

test("an organization search has the same guards", () => {
  refused(buildOrganizationQuery, {}, /give at least one filter/);
  refused(buildOrganizationQuery, { name: "none" }, /name: "none" is not a documented value/);
  refused(buildOrganizationQuery, { exclude_tags: ["x"] }, /exclusions alone/);
  refused(buildOrganizationQuery, { name: 'a"b' }, /name may only contain/);
  refused(buildOrganizationQuery, { start_date: "2026-02-30" }, /start_date is not a real date and time/);
  assert.equal(org({ name: "Acme", role: ["agent"], is_verified: true }), "name:Acme", "user-only filters are ignored");
});

test("a value with no letter or digit, an invisible character or a leading mark is refused in both searches", () => {
  const mark = cp(0x301);
  const invisible = [0x34f, 0x115f, 0x180b, 0x200b, 0x200d, 0x2060, 0xfe0f, 0xe0041, 0xe0100, 0xad];
  const userFields = ["name", "email", "organization", "group", "phone", "external_id"];
  for (const field of userFields) {
    for (const bad of [".", "---", "@", "( )", "+", "_", ". . ."]) {
      refused(buildUserQuery, { [field]: bad }, new RegExp(`${field} must contain at least one letter or digit`));
    }
    for (const code of invisible) {
      for (const text of [cp(code), `Acme${cp(code)}`, `${cp(code)}Acme`, `Ac${cp(code)}me Ltd`]) {
        refused(buildUserQuery, { [field]: text }, new RegExp(`^${field} (may only contain|must contain)`));
      }
    }
    refused(buildUserQuery, { [field]: `${mark}Acme` }, new RegExp(`${field} cannot start a word with a combining mark`));
    refused(buildUserQuery, { [field]: `Acme ${mark}Ltd` }, new RegExp(`${field} cannot start a word with a combining mark`));
  }
  for (const field of ["name", "external_id"]) {
    for (const bad of [".", "---", "@", "( )"]) {
      refused(buildOrganizationQuery, { [field]: bad }, new RegExp(`${field} must contain at least one letter or digit`));
    }
    for (const code of invisible) {
      refused(buildOrganizationQuery, { [field]: `Acme${cp(code)}` }, new RegExp(`^${field} (may only contain|must contain)`));
    }
    refused(buildOrganizationQuery, { [field]: `${mark}Acme` }, new RegExp(`${field} cannot start a word with a combining mark`));
  }
  for (const code of invisible) {
    refused(buildUserQuery, { include_tags: [`vip${cp(code)}`] }, /include_tags entries may only use/);
    refused(buildOrganizationQuery, { exclude_tags: [`vip${cp(code)}`], name: "x" }, /exclude_tags entries may only use/);
  }
  refused(buildUserQuery, { include_tags: ["..."] }, /include_tags entries may only use/);
  assert.equal(user({ phone: "+15551234567" }), "phone:+15551234567");
  assert.equal(user({ name: `x${mark}y z` }), `name:"x${mark}y z"`);
});
test("a date or time that does not exist is refused in both searches, never moved to one that does", () => {
  for (const impossible of ["2026-02-30T10:00:00Z", "2026-10-06T24:00:00Z", "2026-10-06T10:60:00Z", "2026-10-06T10:00:60Z", "2026-10-06T10:00:00+15:00", "1969-12-31", "9999-12-31"]) {
    refused(buildUserQuery, { start_date: impossible }, /start_date is not a real date and time/);
    refused(buildOrganizationQuery, { end_date: impossible, name: "x" }, /end_date is not a real date and time/);
  }
  assert.equal(user({ start_date: "2026-10-06T23:59:59Z" }), "created>=2026-10-06T23:59:59Z");
});

/* ------------------------------ a value can add nothing: property tests ------------------------------ */

function assertOneCondition(query, shape, label) {
  const loose = tokenize(query);
  assert.equal(loose.length, 1, `${label} became ${query}`);
  assert.match(loose[0], shape, query);
  const strict = strictTokenize(query);
  assert.equal(strict.balanced, true, `${label}: quotes unbalanced under a strict reading of ${JSON.stringify(query)}`);
  assert.equal(strict.tokens.length, 1, `${label}: ${JSON.stringify(query)} reads as ${strict.tokens.length} conditions under a strict reading`);
  assert.doesNotMatch(query, NO_SLIPPERY, `${label}: ${JSON.stringify(query)} holds a control or separator character`);
}

test("whatever a user or organization value contains, it yields exactly one condition — or is refused", () => {
  const random = generator(20261017);
  const cases = [
    [buildUserQuery, "name", /^name:/],
    [buildUserQuery, "email", /^email:/],
    [buildUserQuery, "organization", /^organization:/],
    [buildUserQuery, "group", /^group:/],
    [buildUserQuery, "phone", /^phone:/],
    [buildUserQuery, "external_id", /^external_id:/],
    [buildOrganizationQuery, "name", /^name:/],
    [buildOrganizationQuery, "external_id", /^external_id:/],
  ];
  let accepted = 0;
  let rejected = 0;
  for (const [build, field, shape] of cases) {
    for (let i = 0; i < 2500; i += 1) {
      const hostile = sample(random, i);
      let query;
      try {
        query = build({ [field]: hostile }).query;
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

test("whatever a tag or a date contains in a user or organization search, nothing extra is added", () => {
  const random = generator(53);
  let accepted = 0;
  for (let i = 0; i < 2500; i += 1) {
    const hostile = sample(random, i);
    for (const build of [buildUserQuery, buildOrganizationQuery]) {
      for (const filters of [
        { include_tags: [hostile] },
        { exclude_tags: [hostile], name: "ok" },
        { require_tags: [hostile, "ok"] },
        { start_date: hostile },
        { end_date: hostile, name: "ok" },
      ]) {
        let query;
        try {
          query = build(filters).query;
        } catch (error) {
          assert.ok(error instanceof ZendeskQueryError);
          continue;
        }
        accepted += 1;
        const strict = strictTokenize(query);
        assert.equal(strict.balanced, true, JSON.stringify(query));
        assert.equal(strict.tokens.length, tokenize(query).length, JSON.stringify(query));
        assert.doesNotMatch(query, NO_SLIPPERY);
        for (const token of strict.tokens) assert.match(token, /^(-?tags:|name:|created[<>]=?)/, query);
      }
    }
  }
  assert.ok(accepted > 100, `accepted ${accepted}`);
});
