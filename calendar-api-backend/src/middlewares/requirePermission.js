import { getCaller } from "../services/authz.js";
import { decide, parseRequirement } from "../permissions/evaluate.js";

/**
 * Route requirement markers. Every route in agendo declares exactly one of these, first
 * in its handler chain:
 *
 *   requirePermission(area, level)  a level in a permission area (permissions/registry.js)
 *   requireAdmin                    admin-only actions no level grants (user management…)
 *   signedIn                        any signed-in user with an agendo account
 *   publicRoute                     deliberately public — no auth at all
 *   webhookRoute                    authenticated by its own signature (svix)
 *   mcpRoute                        authenticated by mcpAuth, per tool
 *
 * Each marker carries `.requirement`, which `permissions/routeRequirements.test.js` reads
 * to prove that no route is missing one and that the route map hasn't drifted.
 *
 * ── SHADOW MODE (phase 1) ─────────────────────────────────────────────────────────────
 * The markers decide but do not enforce. The legacy gates (requireSession, adminOnly, the
 * Performance allowlist) still sit after them and still answer every request. Once the
 * response is sent, a marker compares its verdict with what the legacy gates did and logs
 * only disagreements:
 *
 *   [perm] shadow mismatch: would DENY  …  (legacy let it through)
 *   [perm] shadow mismatch: would ALLOW …  (legacy answered 401/403)
 *
 * Every mismatch must be an intended change (see docs/permissions-plan.md §10.2) before
 * phase 2 switches the markers to enforce and deletes the legacy gates. A marker never
 * blocks, never throws, and always calls next() exactly once.
 */

const LEGACY_DENIAL = new Set([401, 403]);

function describeCaller(caller) {
  if (!caller) return "anonymous";
  return caller.mongoUser?.email || caller.clerkId || "unknown";
}

function reportMismatch(req, res, requirement, caller, verdict) {
  const status = res.statusCode;
  const legacyDenied = LEGACY_DENIAL.has(status);
  if (verdict.allowed === !legacyDenied) {
    return;
  }
  const detail = verdict.allowed
    ? `would ALLOW, legacy answered ${status}`
    : `would DENY (${verdict.reason}${verdict.have ? `, has ${verdict.required.split(":")[0]}:${verdict.have}` : ""}), legacy answered ${status}`;
  console.warn(
    `[${req.requestId}] - [perm] shadow mismatch: ${req.method} ${req.originalUrl} requires ${requirement} — ${detail} — caller ${describeCaller(caller)}`,
  );
}

function shadowMarker(requirement, name) {
  const parsed = parseRequirement(requirement);
  const marker = async function permissionShadow(req, res, next) {
    try {
      const caller = await getCaller(req);
      const verdict = decide(caller, parsed);
      res.once("finish", () => {
        try {
          reportMismatch(req, res, requirement, caller, verdict);
        } catch (err) {
          console.error(`[${req.requestId}] - [perm] mismatch report failed: ${err.message}`);
        }
      });
    } catch (err) {
      console.error(
        `[${req.requestId}] - [perm] shadow check failed on ${req.method} ${req.originalUrl}: ${err.message}`,
      );
    }
    next();
  };
  return tag(marker, requirement, name);
}

/** A marker that only documents: these routes authenticate some other way, or not at all. */
function declarationMarker(requirement, name) {
  parseRequirement(requirement);
  return tag((req, res, next) => next(), requirement, name);
}

function tag(fn, requirement, name) {
  Object.defineProperty(fn, "name", { value: name });
  Object.defineProperty(fn, "requirement", { value: requirement, enumerable: true });
  return fn;
}

/** Requires at least `level` in permission `area`. Validated when the route module loads. */
export function requirePermission(area, level) {
  const requirement = `${area}:${level}`;
  return shadowMarker(requirement, `requirePermission(${requirement})`);
}

export const requireAdmin = shadowMarker("admin", "requireAdmin");
export const signedIn = shadowMarker("signedIn", "signedIn");
export const publicRoute = declarationMarker("public", "publicRoute");
export const webhookRoute = declarationMarker("webhook", "webhookRoute");
export const mcpRoute = declarationMarker("mcp", "mcpRoute");

export default {
  requirePermission,
  requireAdmin,
  signedIn,
  publicRoute,
  webhookRoute,
  mcpRoute,
};
