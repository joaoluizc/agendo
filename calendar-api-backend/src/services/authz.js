import process from "process";
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

export default { resolveUser, adminBypassEnabled, isAdminRequest };
