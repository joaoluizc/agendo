import { PERMISSION_AREAS, AREA_KEYS } from "./registry.js";

/**
 * The permission evaluator: pure functions over a resolved caller and the registry. No
 * Mongo, no Express — so every decision is unit-testable and the REST middleware, the MCP
 * server and the frontend's /user/info all answer from the same code.
 *
 * A caller is `{ clerkId, mongoUser, isAdmin }` (built by `services/authz.js`), `null` for
 * a request with no session, or `{ clerkId, noAccount: true }` for a Clerk identity with no
 * agendo user.
 *
 * Fails closed throughout: no caller, no Mongo user, a missing, unknown or malformed
 * stored level all mean "none". An unknown *area or level in code* throws — that is a
 * programmer error and should fail loudly, at load time where possible.
 */

/** The requirements that don't name an area. */
export const SPECIAL_REQUIREMENTS = Object.freeze(["public", "webhook", "mcp", "signedIn", "admin"]);

function areaDefinition(area) {
  const def = PERMISSION_AREAS[area];
  if (!def) {
    throw new Error(`Unknown permission area "${area}"`);
  }
  return def;
}

/** Position of `level` in `area`'s ladder. Throws on an unknown area or level. */
export function rank(area, level) {
  const index = areaDefinition(area).levels.indexOf(level);
  if (index < 0) {
    throw new Error(`Unknown level "${level}" for permission area "${area}"`);
  }
  return index;
}

/**
 * The caller's effective level in `area`.
 *
 * `isAdmin` is the only short-circuit for admins anywhere in agendo: an admin holds the
 * top level of every area, including areas added later. Everyone else gets what is stored
 * on their user, or "none".
 */
export function levelOf(caller, area) {
  const def = areaDefinition(area);
  if (!caller?.mongoUser) {
    return "none";
  }
  if (caller.isAdmin) {
    return def.levels[def.levels.length - 1];
  }
  const stored = caller.mongoUser.permissions?.[area];
  return def.levels.includes(stored) ? stored : "none";
}

/** Does the caller hold at least `minLevel` in `area`? */
export function can(caller, area, minLevel) {
  return rank(area, levelOf(caller, area)) >= rank(area, minLevel);
}

/** Every area's effective level, e.g. `{ scheduling: "edit", bugs: "none", ... }`. */
export function effectivePermissions(caller) {
  return Object.fromEntries(AREA_KEYS.map((area) => [area, levelOf(caller, area)]));
}

/** The levels a newly provisioned user starts with. */
export function defaultPermissions() {
  return Object.fromEntries(
    AREA_KEYS.map((area) => [area, PERMISSION_AREAS[area].defaultForNewUsers]),
  );
}

/**
 * Row scoping for areas with a "self" level: `null` (deny), `"all"`, or `{ clerkId }` —
 * the filter a handler must apply. Always built from the caller, never from a client-sent
 * id, so a self-level user can't ask for someone else's rows.
 */
export function scopeFor(caller, area) {
  const def = areaDefinition(area);
  const level = levelOf(caller, area);
  if (level === "none") {
    return null;
  }
  if (def.selfLevel && level === def.selfLevel) {
    return caller.clerkId ? { clerkId: caller.clerkId } : null;
  }
  return "all";
}

/**
 * Parse a route or tool requirement: one of SPECIAL_REQUIREMENTS, or "<area>:<level>".
 * Throws on anything else, so a typo fails when the module that declares it loads.
 */
export function parseRequirement(requirement) {
  if (SPECIAL_REQUIREMENTS.includes(requirement)) {
    return { kind: requirement };
  }
  const parts = String(requirement).split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid permission requirement "${requirement}": expected one of ${SPECIAL_REQUIREMENTS.join(", ")} or "<area>:<level>"`,
    );
  }
  const [area, level] = parts;
  rank(area, level);
  return { kind: "level", area, level };
}

/**
 * The verdict for one caller against one parsed requirement:
 * `{ allowed, reason?, required?, have? }`. `reason` is set only on a denial:
 * "no_session", "no_agendo_account", "not_admin" or "below_required".
 */
export function decide(caller, parsed) {
  if (parsed.kind === "public" || parsed.kind === "webhook" || parsed.kind === "mcp") {
    return { allowed: true };
  }
  if (!caller) {
    return { allowed: false, reason: "no_session" };
  }
  if (caller.noAccount || !caller.mongoUser) {
    return { allowed: false, reason: "no_agendo_account" };
  }
  if (parsed.kind === "signedIn") {
    return { allowed: true };
  }
  if (parsed.kind === "admin") {
    return caller.isAdmin
      ? { allowed: true }
      : { allowed: false, reason: "not_admin", required: "admin" };
  }
  const have = levelOf(caller, parsed.area);
  const required = `${parsed.area}:${parsed.level}`;
  return rank(parsed.area, have) >= rank(parsed.area, parsed.level)
    ? { allowed: true, required, have }
    : { allowed: false, reason: "below_required", required, have };
}

/**
 * Validate an admin's permissions change: a plain object of `{ [area]: level }` naming
 * only known areas and levels. Returns `{ ok, errors }`; an empty patch is valid.
 */
export function validatePermissionsPatch(patch) {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, errors: ["permissions must be an object of { area: level }"] };
  }
  const errors = [];
  for (const [area, level] of Object.entries(patch)) {
    const def = PERMISSION_AREAS[area];
    if (!def) {
      errors.push(`unknown area "${area}"`);
    } else if (!def.levels.includes(level)) {
      errors.push(`"${level}" is not a level of ${area} (${def.levels.join(", ")})`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export default {
  SPECIAL_REQUIREMENTS,
  rank,
  levelOf,
  can,
  effectivePermissions,
  defaultPermissions,
  scopeFor,
  parseRequirement,
  decide,
  validatePermissionsPatch,
};
