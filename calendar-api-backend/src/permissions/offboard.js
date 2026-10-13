/**
 * The rules for offboarding someone (`DELETE /user/:clerkId`) — removing them from agendo
 * and from Clerk in one step. Pure, like `accessChange.js`: the controller loads the
 * target and counts admins, this decides, the service deletes.
 *
 * The route itself is admin-only (`requireAdmin`). On top of that:
 *
 *  - **You can't offboard yourself.** Same rule as a self access change, for the same
 *    reason: an admin removing their own account is either a mistake or a way to lock the
 *    org out of user management, and there is no undo. Someone leaving is offboarded by
 *    someone else.
 *  - **The last admin can't be offboarded.** Deleting them leaves nobody who can grant
 *    access, offboard anyone, or edit locations — recoverable only by hand in Mongo.
 *  - **A missing Mongo user is not an error.** It means a previous offboard deleted Mongo
 *    and then failed at Clerk (see the ordering note in `services/offboardService.js`), or
 *    that someone removed the document by hand. Either way the Clerk account may still be
 *    there, so the plan is "resume": skip Mongo, still delete from Clerk. That makes the
 *    same button recover a half-finished offboard instead of answering 404 and leaving an
 *    orphaned login nobody can clear from the UI.
 *
 * A user with no Mongo document is never an admin (`services/authz.resolveUser` fails
 * closed), so the last-admin guard is vacuous on the resume path — the count is only
 * consulted when there is a target to count.
 *
 * Returns `{ ok: true, resume }` or `{ ok: false, status, error }`.
 */

export function planOffboard({ actor, target, targetClerkId, otherAdminCount }) {
  const clerkId = target?.clerkId ?? targetClerkId;
  if (!clerkId) {
    return { ok: false, status: 400, error: "A clerk id is required" };
  }
  if (actor?.clerkId && actor.clerkId === clerkId) {
    return { ok: false, status: 403, error: "You can't offboard yourself — ask another admin" };
  }
  if (target && target.type === "admin" && otherAdminCount < 1) {
    return { ok: false, status: 409, error: "Can't offboard the last admin" };
  }
  // No Mongo document: nothing to delete there, but Clerk may still hold the account.
  return { ok: true, resume: !target };
}

export default { planOffboard };
