import {
  ZendeskQueryError,
  anyOf,
  booleanToken,
  err,
  finishQuery,
  positiveInt,
  range,
  tagTokens,
  textTerms,
  value,
} from "./zendeskQueryParts.js";

/**
 * Building a Zendesk ticket search query from structured filters.
 *
 * The model never writes Zendesk search syntax; this builds it, from the primitives in
 * `zendeskQueryParts.js` (read its header for why every value goes through an allowlist and
 * is refused rather than altered). What is specific to tickets lives here: the filters, their
 * order, and four rules of Zendesk's own:
 *
 *  - `me` is refused for assignee and requester: it would mean the shared Zendesk user these
 *    tools read as, not the person asking.
 *  - `form` takes a name. Zendesk does not search forms by id, and an id would find nothing,
 *    which reads as "no such tickets".
 *  - `none` is accepted where Zendesk documents it (assignee, requester, organization, group)
 *    and refused for brand, form and a custom field's value.
 *  - `type:` must not appear in the query of the export endpoint (the type is a separate
 *    parameter); this module never emits it. The ticket count endpoint takes only a query, so
 *    its caller adds `type:ticket` there.
 */

export { ZendeskQueryError };

export const TICKET_STATUSES = Object.freeze(["new", "open", "pending", "hold", "solved", "closed"]);
export const TICKET_PRIORITIES = Object.freeze(["low", "normal", "high", "urgent"]);
export const TICKET_TYPES = Object.freeze(["question", "incident", "problem", "task"]);

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

  tokens.push(...tagTokens(f));

  if (f.has_attachments !== undefined) tokens.push(booleanToken("has_attachment", f.has_attachments, "has_attachments"));

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

  return finishQuery(tokens);
}

export default { buildTicketQuery, ZendeskQueryError, TICKET_STATUSES, TICKET_PRIORITIES, TICKET_TYPES };
