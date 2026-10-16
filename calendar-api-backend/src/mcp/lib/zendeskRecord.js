import { truncateText } from "./zendeskShape.js";

/**
 * How a ticket, a user and an organization are shown: a small record per object, built from
 * a Zendesk object, that every tool shares so they cannot drift apart.
 *
 * Two rules hold for every value that comes out. **It is cut to a size** — one ticket with a
 * hundred tags or a 60 kB comment must not swell an answer — and **it is checked to be what it
 * claims**: an id is a positive whole number a double holds exactly, a flag is a boolean, an
 * object where a list should be is dropped. Whatever is left is still data a customer may
 * have written (a subject, a name, a custom-field value), so the *caller* puts these records
 * inside the fence (see `fencePayload`); nothing here is safe to print outside it.
 */

/** A Zendesk id: a positive whole number a double can hold exactly. Anything else is not one. */
export const isId = (value) => Number.isSafeInteger(value) && value > 0;
export const id = (value) => (isId(value) ? value : null);
export const text = (value, max) => (typeof value === "string" ? truncateText(value, max) : null);
export const flag = (value) => (typeof value === "boolean" ? value : null);
export const unique = (values) => [...new Set(values.filter(isId))];
const idList = (list) => (Array.isArray(list) ? list.filter(isId) : []);
const wordList = (list, each) => (Array.isArray(list) ? list.map((item) => text(String(item), each)) : []);

/** Characters of JSON a bag of custom values may take before the rest is left out. */
const CUSTOM_CHARS = 3_000;

/**
 * `items` clipped to `maxItems` and, when `maxChars` is given, to about that many characters of
 * JSON (always keeping the first). What was left out is counted, never dropped silently.
 */
function bound(items, maxItems, maxChars = Infinity) {
  const kept = [];
  let used = 0;
  for (const item of items) {
    const cost = JSON.stringify(item).length + 1;
    if (kept.length >= maxItems || (kept.length > 0 && used + cost > maxChars)) break;
    kept.push(item);
    used += cost;
  }
  return { kept, more: items.length - kept.length };
}

/** `record[field]` as the bounded list, and `record[field_more]` as how many were left out, if any. */
function setList(record, field, items, maxItems, maxChars) {
  const { kept, more } = bound(items, maxItems, maxChars);
  record[field] = kept;
  if (more > 0) record[`${field}_more`] = more;
}

/** One custom field's value, as data: scalars as they are, text clipped, anything else dropped. */
export function customValue(value) {
  if (typeof value === "string") return truncateText(value, 100);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const shown = value.slice(0, 10).map((item) => text(String(item), 100));
    return value.length > 10 ? [...shown, `… and ${value.length - 10} more`] : shown;
  }
  return null;
}

/** `record[field]` as an object of custom values (`user_fields`, `organization_fields`), bounded. */
function setCustomObject(record, field, object) {
  const entries = [];
  if (object && typeof object === "object" && !Array.isArray(object)) {
    for (const [key, raw] of Object.entries(object)) {
      const value = customValue(raw);
      if (value !== null && value !== "") entries.push([truncateText(key, 60), value]);
    }
  }
  const { kept, more } = bound(entries, 30, CUSTOM_CHARS);
  record[field] = Object.fromEntries(kept);
  if (more > 0) record[`${field}_more`] = more;
}
/* ------------------------------ tickets ------------------------------ */

/** What `include_fields` can add to a ticket. All come from the ticket itself: no extra request. */
export const TICKET_FIELDS = Object.freeze([
  "subject",
  "description",
  "priority",
  "type",
  "requester_id",
  "assignee_id",
  "submitter_id",
  "organization_id",
  "group_id",
  "brand_id",
  "form_id",
  "tags",
  "updated_at",
  "via",
  "custom_fields",
  "custom_status_id",
  "problem_id",
  "has_incidents",
  "due_at",
  "collaborator_ids",
  "follower_ids",
  "email_cc_ids",
  "satisfaction_score",
  "is_public",
  "url",
]);

/**
 * A ticket as an answer shows it: id, status and created_at, plus whatever was asked for.
 * `descriptionChars` is how much of the first comment a list shows (500) or a single ticket
 * does (2,000).
 */
export function ticketRecord(ticket, fields, host, { descriptionChars = 500 } = {}) {
  const record = {
    id: ticket.id,
    status: text(ticket.status, 30),
    created_at: text(ticket.created_at, 40),
  };
  for (const field of fields) {
    switch (field) {
      case "subject":
        record.subject = text(ticket.subject, 300);
        break;
      case "description":
        // The first comment, which can run to pages.
        record.description = text(ticket.description, descriptionChars);
        break;
      case "priority":
        record.priority = text(ticket.priority, 30);
        break;
      case "type":
        record.type = text(ticket.type, 30);
        break;
      case "requester_id":
        record.requester_id = id(ticket.requester_id);
        break;
      case "assignee_id":
        record.assignee_id = id(ticket.assignee_id);
        break;
      case "submitter_id":
        record.submitter_id = id(ticket.submitter_id);
        break;
      case "organization_id":
        record.organization_id = id(ticket.organization_id);
        break;
      case "group_id":
        record.group_id = id(ticket.group_id);
        break;
      case "brand_id":
        record.brand_id = id(ticket.brand_id);
        break;
      case "form_id":
        record.form_id = id(ticket.ticket_form_id);
        break;
      case "tags":
        setList(record, "tags", wordList(ticket.tags, 100), 20);
        break;
      case "updated_at":
        record.updated_at = text(ticket.updated_at, 40);
        break;
      case "via":
        record.via = text(ticket.via?.channel, 30);
        break;
      case "custom_fields":
        setList(
          record,
          "custom_fields",
          (Array.isArray(ticket.custom_fields) ? ticket.custom_fields : [])
            .filter((field) => isId(field?.id) && customValue(field.value) !== null && field.value !== "")
            .map((field) => ({ id: field.id, value: customValue(field.value) })),
          25,
          CUSTOM_CHARS,
        );
        break;
      case "custom_status_id":
        record.custom_status_id = id(ticket.custom_status_id);
        break;
      case "problem_id":
        record.problem_id = id(ticket.problem_id);
        break;
      case "has_incidents":
        record.has_incidents = flag(ticket.has_incidents);
        break;
      case "due_at":
        record.due_at = text(ticket.due_at, 40);
        break;
      case "collaborator_ids":
        setList(record, "collaborator_ids", idList(ticket.collaborator_ids), 20);
        break;
      case "follower_ids":
        setList(record, "follower_ids", idList(ticket.follower_ids), 20);
        break;
      case "email_cc_ids":
        setList(record, "email_cc_ids", idList(ticket.email_cc_ids), 20);
        break;
      case "satisfaction_score":
        // The score only ("good", "bad", "offered" …), never the customer's comment.
        record.satisfaction_score = text(ticket.satisfaction_rating?.score, 30);
        break;
      case "is_public":
        record.is_public = flag(ticket.is_public);
        break;
      case "url":
        // Built here from our host and a checked id: not Zendesk's `url`, which is the API's.
        record.url = `https://${host}/agent/tickets/${ticket.id}`;
        break;
      default:
        break;
    }
  }
  return record;
}

/* ------------------------------ users ------------------------------ */

/** What `include_fields` can add to a user. */
export const USER_FIELDS = Object.freeze([
  "phone",
  "organization_id",
  "tags",
  "created_at",
  "updated_at",
  "last_login_at",
  "time_zone",
  "locale",
  "external_id",
  "active",
  "suspended",
  "verified",
  "custom_role_id",
  "ticket_restriction",
  "default_group_id",
  "user_fields",
  "notes",
  "details",
]);

/** A user: id, name, email and role, plus whatever was asked for. */
export function userRecord(user, fields = []) {
  const record = {
    id: id(user?.id),
    name: text(user?.name, 200),
    email: text(user?.email, 200),
    role: text(user?.role, 30),
  };
  for (const field of fields) {
    switch (field) {
      case "phone":
        record.phone = text(user?.phone, 50);
        break;
      case "organization_id":
        record.organization_id = id(user?.organization_id);
        break;
      case "tags":
        setList(record, "tags", wordList(user?.tags, 100), 20);
        break;
      case "created_at":
      case "updated_at":
      case "last_login_at":
        record[field] = text(user?.[field], 40);
        break;
      case "time_zone":
        record.time_zone = text(user?.time_zone, 60);
        break;
      case "locale":
        record.locale = text(user?.locale, 20);
        break;
      case "external_id":
        record.external_id = text(user?.external_id, 100);
        break;
      case "active":
      case "suspended":
      case "verified":
        record[field] = flag(user?.[field]);
        break;
      case "custom_role_id":
        record.custom_role_id = id(user?.custom_role_id);
        break;
      case "ticket_restriction":
        record.ticket_restriction = text(user?.ticket_restriction, 30);
        break;
      case "default_group_id":
        record.default_group_id = id(user?.default_group_id);
        break;
      case "user_fields":
        setCustomObject(record, "user_fields", user?.user_fields);
        break;
      case "notes":
      case "details":
        record[field] = text(user?.[field], 500);
        break;
      default:
        break;
    }
  }
  return record;
}

/* ------------------------------ organizations ------------------------------ */

/** What `include_fields` can add to an organization. */
export const ORGANIZATION_FIELDS = Object.freeze([
  "domain_names",
  "external_id",
  "tags",
  "created_at",
  "updated_at",
  "group_id",
  "organization_fields",
  "notes",
  "details",
]);

/** An organization: id and name, plus whatever was asked for. */
export function organizationRecord(organization, fields = []) {
  const record = { id: id(organization?.id), name: text(organization?.name, 200) };
  for (const field of fields) {
    switch (field) {
      case "domain_names":
        setList(record, "domain_names", wordList(organization?.domain_names, 100), 10);
        break;
      case "external_id":
        record.external_id = text(organization?.external_id, 100);
        break;
      case "tags":
        setList(record, "tags", wordList(organization?.tags, 100), 20);
        break;
      case "created_at":
      case "updated_at":
        record[field] = text(organization?.[field], 40);
        break;
      case "group_id":
        record.group_id = id(organization?.group_id);
        break;
      case "organization_fields":
        setCustomObject(record, "organization_fields", organization?.organization_fields);
        break;
      case "notes":
      case "details":
        record[field] = text(organization?.[field], 500);
        break;
      default:
        break;
    }
  }
  return record;
}

export default {
  isId,
  id,
  text,
  flag,
  unique,
  customValue,
  ticketRecord,
  userRecord,
  organizationRecord,
  TICKET_FIELDS,
  USER_FIELDS,
  ORGANIZATION_FIELDS,
};
