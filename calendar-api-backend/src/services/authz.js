import process from "process";
import { getAuth } from "@clerk/express";
import userService from "./userService.js";
import { provisionFromClerk } from "./onboardingService.js";

/**
 * The single authority for "who is this caller, and are they an admin?".
 *
 * Mongo `User.type` is the only source of truth for the admin role. Clerk
 * `publicMetadata` is never read — it stopped being written when the profile moved
 * to Mongo, so it silently denies genuine admins.
 * See docs/knowledge/clerk-mongo-boundary.md.
 *
 * Fails closed: a Clerk user with no Mongo document is not an admin.
 *
 * @param {string} clerkUserId
 * @returns {Promise<{ mongoUser: object|null, isAdmin: boolean }>}
 */
export async function resolveUser(clerkUserId) {
  if (!clerkUserId) {
    return { mongoUser: null, isAdmin: false };
  }
  const mongoUser = await userService.findUserByClerkId(clerkUserId);
  if (!mongoUser) {
    return { mongoUser: null, isAdmin: false };
  }
  return { mongoUser, isAdmin: mongoUser.type === "admin" };
}

/**
 * `resolveUser`, and if this Clerk account has no agendo user yet, try to create one —
 * the backstop for a Clerk `user.created` webhook that never arrived. Whether it may is
 * decided in `permissions/onboarding.js`: only a brand-new Clerk account, or an email an
 * admin invited, so an agendo user deleted to cut someone off stays deleted.
 *
 * Never throws for a failed provisioning: that caller just has no account (fails closed).
 */
export async function resolveOrProvisionUser(clerkUserId, { requestId } = {}) {
  const resolved = await resolveUser(clerkUserId);
  if (resolved.mongoUser || !clerkUserId) {
    return resolved;
  }
  let mongoUser = null;
  try {
    mongoUser = await provisionFromClerk(clerkUserId, { requestId });
  } catch (err) {
    console.error(
      `[${requestId}]: could not provision ${clerkUserId} on their first request: ${err.message}`,
    );
  }
  return mongoUser ? { mongoUser, isAdmin: mongoUser.type === "admin" } : resolved;
}

/**
 * Is ADMIN_BYPASS=1 set for this process? It makes every REST caller an admin (see
 * getCaller) — an explicit, local-only escape hatch for working on admin routes.
 *
 * Read through this function rather than the env var directly so the flag has exactly one
 * reader. Deliberately not keyed on NODE_ENV: that variable also selects the Mongo
 * collection (dev-users vs users), and tying the two together used to disable every admin
 * gate as a silent side effect of pointing at dev data.
 */
export function adminBypassEnabled() {
  return process.env.ADMIN_BYPASS === "1";
}

/**
 * The caller shape the permission evaluator (`permissions/evaluate.js`) works on, built
 * from a Mongo user. `isAdmin` comes from `type` and nothing else. Used as-is by MCP and
 * scripts; REST goes through `getCaller`, which adds the ADMIN_BYPASS opt-in on top.
 */
export function callerFromUser(mongoUser, clerkId = mongoUser?.clerkId) {
  return { clerkId, mongoUser, isAdmin: mongoUser?.type === "admin" };
}

const CALLER_PROMISE = Symbol("agendo.caller");

/**
 * Who is making this REST request: `null` (no session), `{ clerkId, noAccount: true }`
 * (a Clerk identity with no agendo user, and none could be provisioned — see
 * `resolveOrProvisionUser`), or `callerFromUser(...)`.
 *
 * Resolved once per request and memoized — the promise on a private key, the settled
 * value on `req.caller` — so any number of checks cost a single Mongo read.
 *
 * Identity is read from a **session token only**: Clerk's middleware accepts any token
 * type, and an MCP OAuth token must never act on REST. ADMIN_BYPASS=1 marks the caller
 * admin here and nowhere else; MCP builds its caller with `callerFromUser` and so keeps
 * ignoring the bypass, as before.
 */
export function getCaller(req) {
  if (!req[CALLER_PROMISE]) {
    req[CALLER_PROMISE] = resolveCaller(req).then((caller) => {
      req.caller = caller;
      return caller;
    });
  }
  return req[CALLER_PROMISE];
}

async function resolveCaller(req) {
  const { userId } = getAuth(req, { acceptsToken: "session_token" });
  if (!userId) {
    return null;
  }
  const { mongoUser } = await resolveOrProvisionUser(userId, { requestId: req.requestId });
  if (!mongoUser) {
    return { clerkId: userId, noAccount: true };
  }
  const caller = callerFromUser(mongoUser, userId);
  if (adminBypassEnabled()) {
    caller.isAdmin = true;
  }
  return caller;
}

export default {
  resolveUser,
  resolveOrProvisionUser,
  adminBypassEnabled,
  callerFromUser,
  getCaller,
};
