import { defaultPermissions, validatePermissionsPatch } from "./evaluate.js";

/**
 * The rules for an admin changing someone's access (`PUT /user/:clerkId/permissions`).
 * Pure — the controller loads the target and counts admins, this decides, the controller
 * writes. The route itself is admin-only.
 *
 * Body: `{ type?: "admin" | "normal", permissions?: { [area]: level } }`.
 *  - Nothing else in the body; at least one of the two.
 *  - You can't change your own access. With the route admin-only, that rules out both
 *    self-escalation and locking yourself out.
 *  - The last admin can't be demoted. (Two admins demoting each other at the very same
 *    moment could still race past this; recovery is the same Mongo edit as before.)
 *  - `permissions` may be partial: it is merged over what the user has stored, or over the
 *    new-user defaults for a user who has never had any.
 *
 * Returns `{ ok: true, type, permissions, changed }` or `{ ok: false, status, error, details? }`.
 */
const ALLOWED_KEYS = ["type", "permissions"];
const TYPES = ["admin", "normal"];

export function storedPermissions(user) {
  const stored = user?.permissions;
  if (!stored) return null;
  return typeof stored.toObject === "function" ? stored.toObject() : { ...stored };
}

export function planAccessChange({ actor, target, body, otherAdminCount }) {
  if (!target) {
    return { ok: false, status: 404, error: "User not found" };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Body must be { type?, permissions? }" };
  }
  const unknown = Object.keys(body).filter((key) => !ALLOWED_KEYS.includes(key));
  if (unknown.length) {
    return { ok: false, status: 400, error: `Unknown field(s): ${unknown.join(", ")}` };
  }
  if (body.type === undefined && body.permissions === undefined) {
    return { ok: false, status: 400, error: "Nothing to change: send type and/or permissions" };
  }
  if (actor?.clerkId && actor.clerkId === target.clerkId) {
    return { ok: false, status: 403, error: "You can't change your own access" };
  }
  if (body.type !== undefined && !TYPES.includes(body.type)) {
    return { ok: false, status: 400, error: `type must be one of ${TYPES.join(", ")}` };
  }
  if (body.permissions !== undefined) {
    const { ok, errors } = validatePermissionsPatch(body.permissions);
    if (!ok) {
      return { ok: false, status: 400, error: "Invalid permissions", details: errors };
    }
  }

  const type = body.type ?? target.type;
  if (target.type === "admin" && type !== "admin" && otherAdminCount < 1) {
    return { ok: false, status: 409, error: "Can't remove the last admin" };
  }

  const current = storedPermissions(target);
  const permissions = { ...(current ?? defaultPermissions()), ...(body.permissions ?? {}) };
  const changed =
    type !== target.type || JSON.stringify(permissions) !== JSON.stringify(current);
  return { ok: true, type, permissions, changed };
}

export default { planAccessChange, storedPermissions };
