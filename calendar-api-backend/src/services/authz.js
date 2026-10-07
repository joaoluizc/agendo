import process from "process";
import { getAuth } from "@clerk/express";
import userService from "./userService.js";

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
 * Is the admin gate bypassed for this process?
 *
 * Read through this function rather than the env var directly so the flag has exactly one
 * reader. Deliberately not keyed on NODE_ENV: that variable also selects the Mongo
 * collection (dev-users vs users), and tying the two together used to disable every admin
 * gate as a silent side effect of pointing at dev data. See middlewares/adminOnly.js.
 */
export function adminBypassEnabled() {
  return process.env.ADMIN_BYPASS === "1";
}

/**
 * Admin verdict for a request, bypass included.
 *
 * `adminOnly` covers routes that are entirely admin-gated. This is for a route that is
 * open to everyone but *shows more* to an admin — the schedule read, which returns draft
 * shifts only to someone who can act on them. Both answer the question the same way, so
 * neither grows its own notion of who is an admin.
 */
export async function isAdminRequest(clerkUserId) {
  if (adminBypassEnabled()) {
    return true;
  }
  const { isAdmin } = await resolveUser(clerkUserId);
  return isAdmin;
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
 * (a Clerk identity with no agendo user), or `callerFromUser(...)`.
 *
 * Resolved once per request and memoized — the promise on a private key, the settled
 * value on `req.caller` — so any number of checks cost a single Mongo read.
 *
 * Identity is read from a **session token only**, the same rule as `requireSession`:
 * Clerk's middleware accepts any token type, and an MCP OAuth token must never act on
 * REST. ADMIN_BYPASS=1 marks the caller admin here and nowhere else; MCP builds its caller
 * with `callerFromUser` and so keeps ignoring the bypass, as before.
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
  const { mongoUser } = await resolveUser(userId);
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
  adminBypassEnabled,
  isAdminRequest,
  callerFromUser,
  getCaller,
};
