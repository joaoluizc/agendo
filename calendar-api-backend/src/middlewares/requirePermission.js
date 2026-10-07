import { getAuth } from "@clerk/express";
import { getCaller } from "../services/authz.js";
import { decide, parseRequirement } from "../permissions/evaluate.js";

/**
 * Route requirement markers — the only authorization gate on agendo's REST API. Every
 * route declares exactly one, first in its handler chain:
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
 * The checking markers resolve the caller once per request (`authz.getCaller`: a Clerk
 * **session** token only, then the Mongo user) and answer:
 *
 *   401 {error:"Unauthorized"}                                   no session
 *   403 {error:"Forbidden", reason:"no_agendo_account"}          a Clerk identity with no agendo user
 *   403 {error:"Forbidden", reason:"not_admin", required}        an admin-only route
 *   403 {error:"Forbidden", reason:"below_required", required, have}
 *   500 {error:"Could not verify permissions"}                   the lookup itself failed
 *
 * Every refusal except a plain missing session is logged as `[perm] denied`. A valid token
 * of the wrong type (an MCP OAuth token, say) is a 401, logged as a refused token.
 */

function describeCaller(caller) {
  if (!caller) return "anonymous";
  return caller.mongoUser?.email || caller.clerkId || "unknown";
}

/**
 * A request with no session might still carry a valid token of another type — an MCP
 * OAuth token, an API key. Worth a line: it's either a client relying on behavior that is
 * gone or a token used somewhere it shouldn't be. A signed-out browser is not logged.
 */
function logRefusedToken(req) {
  try {
    const any = getAuth(req, { acceptsToken: "any" });
    if (any?.tokenType && any.tokenType !== "session_token") {
      console.warn(
        `[${req.requestId}] - [perm] refused a ${any.tokenType} for ${any.userId ?? any.subject ?? "unknown"} on ${req.method} ${req.originalUrl}: REST takes session tokens only`,
      );
    }
  } catch {
    // Logging only; the 401 stands either way.
  }
}

function checkingMarker(requirement, name) {
  const parsed = parseRequirement(requirement);
  const marker = async function permissionGuard(req, res, next) {
    let caller;
    try {
      caller = await getCaller(req);
    } catch (err) {
      // Express 4 doesn't catch async rejections — answer rather than hang.
      console.error(
        `[${req.requestId}] - [perm] could not resolve caller on ${req.method} ${req.originalUrl}: ${err.message}`,
      );
      return res.status(500).json({ error: "Could not verify permissions" });
    }

    const verdict = decide(caller, parsed);
    if (verdict.allowed) {
      return next();
    }

    if (verdict.reason === "no_session") {
      logRefusedToken(req);
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.warn(
      `[${req.requestId}] - [perm] denied ${req.method} ${req.originalUrl}: requires ${requirement} — ${verdict.reason}${verdict.have ? ` (has ${verdict.have})` : ""} — caller ${describeCaller(caller)}`,
    );
    const body = { error: "Forbidden", reason: verdict.reason };
    if (verdict.required) body.required = verdict.required;
    if (verdict.have) body.have = verdict.have;
    return res.status(403).json(body);
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
  return checkingMarker(requirement, `requirePermission(${requirement})`);
}

export const requireAdmin = checkingMarker("admin", "requireAdmin");
export const signedIn = checkingMarker("signedIn", "signedIn");
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
