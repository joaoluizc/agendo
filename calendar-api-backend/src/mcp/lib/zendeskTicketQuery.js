/**
 * Building a Zendesk ticket search query from structured filters.
 *
 * The model never writes Zendesk search syntax. A tool takes filters (a status, an
 * assignee, a date range …) and this module builds the query string from them. That is the
 * convenient design — the model does not need to know the syntax — and the safe one: a
 * query string is a small language with operators, and a value a model (or a prompt-injected
 * ticket it just read) passes along must not be able to add a condition, negate one, or
 * widen the search. Each value therefore goes through one door, and the door is an
 * **allowlist**, not a blocklist:
 *
 *  - **Enumerations** (status, priority, ticket type) are checked against fixed lists.
 *  - **Names, emails and ids** are emitted bare if they are made of a small ASCII alphabet,
 *    and otherwise wrapped in double quotes — but only if every character is a letter, a
 *    mark, a digit, an ASCII space, or one of `. - _ @ ' & ( ) , / +`. Anything else is
 *    *refused*, not altered. That one rule covers a great deal that a blocklist would have
 *    to enumerate: ASCII and smart and fullwidth quotes, backslashes, colons, asterisks,
 *    angle brackets, every control and separator character (NUL, tab, newline, NEL, U+2028),
 *    non-breaking and ideographic spaces. A value must also equal its own NFKC form, so a
 *    character that Unicode folds into an operator (a fullwidth quote or colon) cannot get
 *    through looking harmless. This matters because we do not know how Zendesk tokenizes
 *    Unicode; the allowlist does not need to.
 *  - **Altering is refused too**, because it answers a different question than the one
 *    asked, and an empty or wrong result looks exactly like a correct one.
 *  - **Free text** is folded to NFKC, every character outside letters, digits and
 *    `@ . _ ' + -` becomes a space, and each remaining word is quoted. So an operator typed
 *    into it (`status:solved`, `-tags:x`, `type:user`) is only ever words to search for.
 *  - **Dates** are validated as real calendar dates and sent as full UTC instants. Zendesk
 *    does not say which timezone a bare `YYYY-MM-DD` means, so it is converted here, to
 *    midnight UTC. `2026-02-30T10:00:00Z` is refused, not moved to March.
 *  - **Tags** use a conservative alphabet, and the two ways of combining them cannot be
 *    mixed (below).
 *  - **A search of exclusions alone** is refused: a query with only negations may match
 *    nothing in Zendesk, and an empty result reads as "no such tickets".
 *
 * Facts about Zendesk's syntax this relies on (from its search reference, 2026-10): repeating
 * a keyword means OR (`status:open status:pending`); a quoted multi-tag value means AND
 * (`tags:"a b"`); a leading `-` negates; `>=` and `<=` exist; ISO 8601 times with `Z` are
 * accepted; bare words are ANDed; a query is limited to 64 words; `type:` must not appear in
 * the query of the export endpoint (the type is a separate parameter); `none` is documented
 * for assignee, requester, organization, group and tags only; `form` takes a name.
 *
 * Errors name the *field*, never the value: a value may be a customer's email, and these
 * messages are shown to the model and, for an unexpected failure, must not reach a log.
 */

export const TICKET_STATUSES = Object.freeze(["new", "open", "pending", "hold", "solved", "closed"]);
export const TICKET_PRIORITIES = Object.freeze(["low", "normal", "high", "urgent"]);
export const TICKET_TYPES = Object.freeze(["question", "incident", "problem", "task"]);

/** An error about the caller's filters. Its message holds field names only, so it is log-safe. */
export class ZendeskQueryError extends Error {
  constructor(message) {
    super(message);
    this.name = "ZendeskQueryError";
    this.logMessage = message;
  }
}

const MAX_VALUE_CHARS = 200;
const MAX_TEXT_WORDS = 20;
/** Zendesk allows 64 words per query; stay under it, counting spaces inside quotes too. */
const MAX_QUERY_WORDS = 60;

/** A value that needs no quotes: ASCII, no spaces, no operator characters, no leading `-`. */
const BARE_VALUE = /^[A-Za-z0-9@._+][A-Za-z0-9@._+-]*$/;
/** What may sit inside quotes: letters, marks, digits, an ASCII space, and a few separators. */
const QUOTED_VALUE = /^[\p{L}\p{M}\p{N} .\-_@'&(),/+]+$/u;
/** A tag: letters, digits, `_`, `.`, and `-` after the first character. */
const TAG = /^[\p{L}\p{N}_.][\p{L}\p{N}_.-]{0,99}$/u;
/** Everything in free text that is not part of a word. */
const NOT_TEXT = /[^\p{L}\p{N}@._'+-]+/gu;

const err = (message) => new ZendeskQueryError(message);
const isNone = (text) => text.toLowerCase() === "none";

/** One value, bare if it safely can be, quoted if not, refused if neither. */
function value(raw, field, { allowNone = true } = {}) {
  if (typeof raw !== "string") throw err(`${field} must be text`);
  const trimmed = raw.trim();
  if (!trimmed) throw err(`${field} is empty`);
  if (trimmed.length > MAX_VALUE_CHARS) throw err(`${field} is too long (${MAX_VALUE_CHARS} characters at most)`);
  if (trimmed !== trimmed.normalize("NFKC")) {
    throw err(`${field} must be plain text, without fullwidth or other compatibility characters`);
  }
  if (!allowNone && isNone(trimmed)) {
    throw err(`${field}: "none" is not a documented value for this filter, so it is not accepted`);
  }
  if (BARE_VALUE.test(trimmed)) return trimmed;
  if (!QUOTED_VALUE.test(trimmed)) {
    throw err(`${field} may only contain letters, digits, spaces and . - _ @ ' & ( ) , / +`);
  }
  return `"${trimmed}"`;
}

/** An assignee or requester: a name, an email, a user id, a phone number, or none — never `me`. */
function person(raw, field) {
  if (typeof raw === "string" && raw.trim().toLowerCase() === "me") {
    throw err(
      `${field}: "me" would mean the shared Zendesk user these tools read as, not you. ` +
        `Use a name, an email address, a user id, or none.`,
    );
  }
  return value(raw, field);
}

/** The ticket form, by name: Zendesk does not search forms by id, and an id would find nothing. */
function formName(raw) {
  const quoted = value(raw, "form", { allowNone: false });
  if (/^\d+$/.test(quoted)) {
    throw err("form takes the ticket form's name; Zendesk does not search forms by id");
  }
  return quoted;
}

/** `keyword:a keyword:b` — repeated, which Zendesk reads as "any of". */
function anyOf(keyword, values, allowed, field) {
  if (!Array.isArray(values) || !values.length) throw err(`${field} must list at least one value`);
  const unique = [...new Set(values)];
  for (const item of unique) {
    if (!allowed.includes(item)) throw err(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return unique.map((item) => `${keyword}:${item}`);
}

function tags(values, field) {
  if (!Array.isArray(values) || !values.length) throw err(`${field} must list at least one tag`);
  const unique = [...new Set(values.map((item) => (typeof item === "string" ? item.trim() : item)))];
  for (const item of unique) {
    if (typeof item !== "string" || item !== item.normalize("NFKC") || !TAG.test(item) || isNone(item)) {
      throw err(
        `${field} entries may only use letters, digits, _ . and - (and not start with -); ` +
          `a tag named none cannot be searched`,
      );
    }
  }
  return unique;
}

function positiveInt(raw, field) {
  if (!Number.isSafeInteger(raw) || raw <= 0) throw err(`${field} must be a positive whole number`);
  return raw;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 86_400_000;
/** Years Zendesk can hold and that print as four digits, with room for the day after the last. */
const MIN_YEAR = 1970;
const MAX_YEAR = 9998;

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Is this a date that exists, and a time that exists? `new Date` alone is not the test: it
 * quietly moves 30 February to 2 March and 24:00 to the next day, and a query about the
 * wrong day would read as a correct answer.
 */
function realMoment({ year, month, day, hour = 0, minute = 0, second = 0, offset = null }) {
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (offset !== null) {
    const [, sign, offsetHour, offsetMinute] = offset.match(/^([+-])(\d{2}):(\d{2})$/) ?? [];
    if (!sign || Number(offsetHour) > 14 || Number(offsetMinute) > 59) return false;
  }
  return true;
}

/** `{ at, bareDay }` from a UTC day or an ISO 8601 time with an explicit zone. */
function moment(raw, field) {
  const text = typeof raw === "string" ? raw.trim() : "";
  const notReal = () => err(`${field} is not a real date and time`);

  const day = DAY.exec(text);
  if (day) {
    const [year, month, date] = day.slice(1).map(Number);
    if (!realMoment({ year, month, day: date })) throw notReal();
    return { at: new Date(`${text}T00:00:00Z`), bareDay: true };
  }
  const time = INSTANT.exec(text);
  if (time) {
    const [year, month, date, hour, minute] = time.slice(1, 6).map(Number);
    const second = time[6] === undefined ? 0 : Number(time[6]);
    const zone = time[7];
    if (!realMoment({ year, month, day: date, hour, minute, second, offset: zone === "Z" ? null : zone })) {
      throw notReal();
    }
    const at = new Date(text);
    if (Number.isNaN(at.getTime())) throw notReal();
    return { at, bareDay: false };
  }
  throw err(
    `${field} must be a day (YYYY-MM-DD, taken as UTC) or an ISO 8601 time with an explicit zone, such as 2026-10-06T15:30:00Z`,
  );
}

/** A UTC instant as Zendesk takes it: `2026-10-06T15:30:00Z`. */
const instant = (date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * A date range on one keyword. `start` is inclusive. `end` follows agendo's other tools: a
 * bare day includes that whole day (so it becomes "before the next midnight"), an exact time
 * is inclusive.
 */
function range(keyword, start, end, startField, endField) {
  const tokens = [];
  let lower = null;
  let upper = null;
  if (start !== undefined) {
    lower = moment(start, startField).at;
    tokens.push(`${keyword}>=${instant(lower)}`);
  }
  if (end !== undefined) {
    const { at, bareDay } = moment(end, endField);
    upper = bareDay ? new Date(at.getTime() + DAY_MS) : at;
    tokens.push(bareDay ? `${keyword}<${instant(upper)}` : `${keyword}<=${instant(upper)}`);
  }
  if (lower && upper && lower.getTime() >= upper.getTime()) {
    throw err(`${endField} is before ${startField}`);
  }
  return tokens;
}

/**
 * Free text as words, each quoted, so none of it is ever parsed as an operator. The text is
 * folded to NFKC first (a fullwidth quote becomes a plain one), then everything that is not
 * part of a word becomes a space — including every quote, colon, wildcard and control or
 * separator character, however spelt. Zendesk ANDs bare words and treats a quoted word as a
 * literal term, so recall is unaffected by the punctuation that goes.
 */
function textTerms(raw, field) {
  if (typeof raw !== "string") throw err(`${field} must be text`);
  const words = raw.normalize("NFKC").replace(NOT_TEXT, " ").split(/\s+/).filter(Boolean);
  if (!words.length) throw err(`${field} has no searchable words`);
  if (words.length > MAX_TEXT_WORDS) throw err(`${field} has too many words (${MAX_TEXT_WORDS} at most)`);
  return words.map((word) => `"${word}"`);
}

/**
 * The query for these filters, or a ZendeskQueryError saying which field is wrong.
 *
 * @param {object} filters the tool's arguments; fields it does not know are ignored
 * @returns {{ query: string }}
 */
export function buildTicketQuery(filters = {}) {
  const f = filters ?? {};
  const tokens = [];

  if (f.status !== undefined) tokens.push(...anyOf("status", f.status, TICKET_STATUSES, "status"));
  if (f.custom_status_id !== undefined) {
    tokens.push(`custom_status_id:${positiveInt(f.custom_status_id, "custom_status_id")}`);
  }
  if (f.priority !== undefined) tokens.push(...anyOf("priority", f.priority, TICKET_PRIORITIES, "priority"));
  if (f.ticket_type !== undefined) {
    tokens.push(...anyOf("ticket_type", f.ticket_type, TICKET_TYPES, "ticket_type"));
  }

  if (f.assignee !== undefined) tokens.push(`assignee:${person(f.assignee, "assignee")}`);
  if (f.requester !== undefined) tokens.push(`requester:${person(f.requester, "requester")}`);
  if (f.organization !== undefined) tokens.push(`organization:${value(f.organization, "organization")}`);
  if (f.group !== undefined) tokens.push(`group:${value(f.group, "group")}`);
  if (f.brand !== undefined) tokens.push(`brand:${value(f.brand, "brand", { allowNone: false })}`);
  if (f.form !== undefined) tokens.push(`form:${formName(f.form)}`);

  // Zendesk reads a repeated `tags:` as "any of" and a quoted list as "all of". Used
  // together the two would be ORed into a different question than either asked, so refuse.
  if (f.include_tags !== undefined && f.require_tags !== undefined) {
    throw err("use include_tags (any of these) or require_tags (all of these), not both");
  }
  if (f.include_tags !== undefined) {
    tokens.push(...tags(f.include_tags, "include_tags").map((tag) => `tags:${tag}`));
  }
  if (f.require_tags !== undefined) {
    const required = tags(f.require_tags, "require_tags");
    tokens.push(required.length === 1 ? `tags:${required[0]}` : `tags:"${required.join(" ")}"`);
  }
  if (f.exclude_tags !== undefined) {
    tokens.push(...tags(f.exclude_tags, "exclude_tags").map((tag) => `-tags:${tag}`));
  }

  if (f.has_attachments !== undefined) {
    if (typeof f.has_attachments !== "boolean") throw err("has_attachments must be true or false");
    tokens.push(`has_attachment:${f.has_attachments}`);
  }

  tokens.push(...range("created", f.start_date, f.end_date, "start_date", "end_date"));
  tokens.push(...range("solved", f.solved_start_date, f.solved_end_date, "solved_start_date", "solved_end_date"));

  if ((f.custom_field_id === undefined) !== (f.custom_field_value === undefined)) {
    throw err("custom_field_id and custom_field_value go together");
  }
  if (f.custom_field_id !== undefined) {
    tokens.push(
      `custom_field_${positiveInt(f.custom_field_id, "custom_field_id")}:` +
        value(f.custom_field_value, "custom_field_value", { allowNone: false }),
    );
  }

  if (f.text !== undefined) tokens.push(...textTerms(f.text, "text"));

  if (!tokens.length) {
    throw err("give at least one filter; a date range (start_date, end_date) is the cheapest way to bound a search");
  }
  if (tokens.every((token) => token.startsWith("-"))) {
    throw err(
      "a search of exclusions alone (exclude_tags) can match nothing, which reads as 'no such tickets'; " +
        "add a positive filter, such as a date range",
    );
  }
  const query = tokens.join(" ");
  if (query.split(/\s+/).length > MAX_QUERY_WORDS) {
    throw err("too many conditions in one search (Zendesk allows about 64 words); narrow it down");
  }
  return { query };
}

export default { buildTicketQuery, ZendeskQueryError, TICKET_STATUSES, TICKET_PRIORITIES, TICKET_TYPES };
