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

export default { resolveUser };
