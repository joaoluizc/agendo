import {
  ZendeskQueryError,
  anyOf,
  booleanToken,
  finishQuery,
  range,
  tagTokens,
  value,
} from "./zendeskQueryParts.js";

/**
 * Building Zendesk user and organization search queries from structured filters.
 *
 * There is no free-text query, on purpose, the same as the connector the team already uses:
 * the model asks for "agents named X in organization Y", not for a search string. Every value
 * goes through the same allowlist as a ticket search (see `zendeskQueryParts.js`).
 *
 * Keywords come from Zendesk's search reference (2026-10). For users: `name` (partial or
 * full), `email`, `role`, `organization` (a name, an id or none), `group`, `phone`,
 * `external_id`, `tags`, `created`, `is_verified`, `is_suspended`. For organizations: `name`
 * (partial or full), `external_id`, `tags`, `created`. The reference does not document a user
 * id keyword — looking people up by id is a separate call, not a search — nor `none` for name
 * or group, so those are not accepted. Custom user and organization fields are not offered
 * yet: the reference says only "use the field name as the keyword".
 *
 * `type:` is never emitted: the export endpoint takes the object type as its own parameter.
 */

export { ZendeskQueryError };

export const USER_ROLES = Object.freeze(["end-user", "agent", "admin"]);

/** The query for these user filters, or a ZendeskQueryError naming the field that is wrong. */
export function buildUserQuery(filters = {}) {
  const f = filters ?? {};
  const tokens = [];

  if (f.name !== undefined) tokens.push(`name:${value(f.name, "name", { allowNone: false })}`);
  if (f.email !== undefined) tokens.push(`email:${value(f.email, "email")}`);
  if (f.role !== undefined) tokens.push(...anyOf("role", f.role, USER_ROLES, "role"));
  if (f.organization !== undefined) tokens.push(`organization:${value(f.organization, "organization")}`);
  if (f.group !== undefined) tokens.push(`group:${value(f.group, "group", { allowNone: false })}`);
  if (f.phone !== undefined) tokens.push(`phone:${value(f.phone, "phone")}`);
  if (f.external_id !== undefined) tokens.push(`external_id:${value(f.external_id, "external_id")}`);

  tokens.push(...tagTokens(f));

  if (f.is_verified !== undefined) tokens.push(booleanToken("is_verified", f.is_verified, "is_verified"));
  if (f.is_suspended !== undefined) tokens.push(booleanToken("is_suspended", f.is_suspended, "is_suspended"));

  tokens.push(...range("created", f.start_date, f.end_date, "start_date", "end_date"));

  return finishQuery(tokens);
}

/** The query for these organization filters, or a ZendeskQueryError naming the field that is wrong. */
export function buildOrganizationQuery(filters = {}) {
  const f = filters ?? {};
  const tokens = [];

  if (f.name !== undefined) tokens.push(`name:${value(f.name, "name", { allowNone: false })}`);
  if (f.external_id !== undefined) tokens.push(`external_id:${value(f.external_id, "external_id")}`);

  tokens.push(...tagTokens(f));

  tokens.push(...range("created", f.start_date, f.end_date, "start_date", "end_date"));

  return finishQuery(tokens);
}

export default { buildUserQuery, buildOrganizationQuery, ZendeskQueryError, USER_ROLES };
