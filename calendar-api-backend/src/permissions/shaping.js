import { can } from "./evaluate.js";

/**
 * Response shaping by permission: the parts of a response a caller may see. Pure, so the
 * rules are unit-tested apart from the controllers that apply them.
 */

// Who holds which access — admin-only, so nobody else can list the admins or read grants.
const ACCESS_FIELDS = ["type", "permissions", "permissionsUpdatedAt", "permissionsUpdatedBy"];
// What everyone may see about a colleague: enough to draw the schedule grid.
const MINIMAL_ROSTER_FIELDS = ["id", "firstName", "lastName", "imageUrl", "hasImage"];

const pick = (object, keys) =>
  Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));
const omit = (object, keys) =>
  Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

/**
 * The roster (`GET /user/all`) for this caller:
 *  - admin: everything, including type and permissions (the access editor reads them);
 *  - scheduling:edit: everything but access fields — schedule builders need email, slingId
 *    and the manager notes that exist "so whoever builds shifts can glance at it";
 *  - everyone else: names and avatars only.
 */
export function rosterShapeFor(caller, users) {
  if (caller?.isAdmin) {
    return users;
  }
  if (can(caller, "scheduling", "edit")) {
    return users.map((user) => omit(user, ACCESS_FIELDS));
  }
  return users.map((user) => pick(user, MINIMAL_ROSTER_FIELDS));
}

/**
 * The hours report (`{ rows, computedAt, fromCache }`, rows keyed by Clerk id in `id`)
 * narrowed to a `scopeFor(caller, "reports")` result: "all" keeps every row, `{ clerkId }`
 * keeps the caller's own, anything else keeps none (fail closed).
 */
export function scopeReportRows(report, scope) {
  if (scope === "all") {
    return report;
  }
  const rows = scope?.clerkId ? report.rows.filter((row) => row.id === scope.clerkId) : [];
  return { ...report, rows };
}

export default { rosterShapeFor, scopeReportRows };
