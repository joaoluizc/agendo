import Shift from "../models/ShiftModel.js";
import Location from "../models/LocationModel.js";
import { UserInvite } from "../models/UserInviteModel.js";
import userService from "./userService.js";

/**
 * Offboarding: removing a departing teammate from agendo and from Clerk in one step.
 *
 * ## The ordering, and why it is this way
 *
 * **Mongo first, Clerk second.** Deleting from two systems can half-succeed, and the two
 * orders fail very differently:
 *
 *  - *Mongo first* — if the Clerk call then fails, the person's **access is already gone**.
 *    Every perimeter resolves its caller through `services/authz.js`, which fails closed
 *    when no Mongo user exists: REST answers 403 `no_agendo_account`
 *    (`middlewares/requirePermission.js`) and MCP refuses at gate 2
 *    (`mcp/lib/mcpAuth.js`). What is left over is a Clerk login that can authenticate and
 *    then, in almost every case, do nothing at all.
 *
 *    *Almost*, since the onboarding backstop landed: `resolveOrProvisionUser` re-creates a
 *    Mongo user on first request when the Clerk account is less than a day old, or when a
 *    pending invite matches the email (`permissions/onboarding.js`). So for someone
 *    offboarded in their first 24 hours, a failed Clerk deletion is not an inert leftover
 *    — they would come back as a normal user with the default permissions on their next
 *    request. That is why step 2 below revokes any pending invite, and why a partial
 *    failure tells the admin to finish the Clerk deletion rather than treating it as tidying
 *    up. It does not change the ordering: Clerk-first would leave a *fully privileged*
 *    user, which is worse in every case.
 *  - *Clerk first* — if the Mongo call then fails, the leftover is a fully privileged
 *    agendo user whose only missing piece is a login, restorable by anyone who can create
 *    a Clerk account on that email.
 *
 * One order leaves an inert account, the other leaves a live one. So: Mongo first, and the
 * Mongo user goes before the cleanup steps too, so that a failure anywhere in cleanup can
 * never be the reason access is still open.
 *
 * Failures after the kill switch are collected rather than thrown: once access is cut, the
 * remaining steps are independent cleanup, and stopping at the first one would leave more
 * mess, not less. Everything that went wrong comes back in `errors` for the admin to see —
 * `offboardUser` never swallows a failure, and the UI shows the list.
 *
 * ## What happens to their data
 *
 *  - **Past shifts stay.** They are history: the hours report and the performance scores
 *    are built from them, and deleting them would silently rewrite finished quarters.
 *    `database/scripts/purgeOrphanShifts.js` already treats an ex-employee's old shifts as
 *    real history for exactly this reason.
 *  - **Future shifts are deleted.** A shift on tomorrow's grid for someone who has left is
 *    not history, it is a false plan: it draws a covered slot, and the coverage meter
 *    counts it, so the gap their leaving created stays hidden until the day arrives. The
 *    count is reported so whoever offboards them knows how big the hole is. Offboarding is
 *    deliberately *not* blocked while future shifts exist — this is the access kill switch,
 *    and it must not be gated behind tidying a schedule.
 *  - **Location assignments are removed.** `locations.assignedUsers` holds Clerk id strings
 *    with nothing enforcing that they point at a real user, so without this every offboard
 *    leaves a dangling id behind (there are already some from before this existed — see
 *    `database/scripts/purgeOrphanLocationAssignments.js`).
 *  - **Their Google Calendar is not touched.** The events were written into *their* Google
 *    account, which leaves with them, and the OAuth token needed to reach it is held by
 *    Clerk — so cleaning it would mean calling Google before the kill switch, letting a
 *    slow third party delay cutting access. To clear their calendar anyway, unpublish
 *    their future shifts first (that path does delete the events) and then offboard.
 *  - **Audit records and performance history keep pointing at their clerk id.** Both are
 *    append-only history by design; an offboard adds to that record, it does not erase it.
 */

/**
 * Offboard `clerkId`. Returns a step-by-step report — never throws for a step failure, so
 * a partial result is always visible to the admin:
 *
 * `{ mongoUserDeleted, clerkUserDeleted, clerkAlreadyGone, futureShiftsDeleted,
 *    pastShiftsKept, invitesRevoked, locationsUpdated, errors: [{ step, message }] }`
 */
export async function offboardUser(clerkId, { requestId } = {}) {
  const log = (message) => console.log(`[${requestId}] - [offboard] ${clerkId}: ${message}`);
  const report = {
    mongoUserDeleted: false,
    clerkUserDeleted: false,
    clerkAlreadyGone: false,
    futureShiftsDeleted: 0,
    pastShiftsKept: 0,
    invitesRevoked: 0,
    locationsUpdated: 0,
    errors: [],
  };
  const fail = (step, err) => {
    console.error(`[${requestId}] - [offboard] ${clerkId}: ${step} FAILED: ${err.message}`);
    report.errors.push({ step, message: err.message });
  };

  // Counted before anything is removed, so the numbers describe what was there.
  const now = new Date();
  try {
    report.pastShiftsKept = await Shift.countDocuments({
      userId: clerkId,
      startTime: { $lt: now },
    });
  } catch (err) {
    fail("count past shifts", err);
  }

  // 1. The kill switch, first and alone. Everything below is cleanup.
  let email = null;
  try {
    const { deleted, user } = await userService.deleteUserByClerkId(clerkId);
    report.mongoUserDeleted = deleted;
    email = user?.email ?? null;
    log(deleted ? "agendo user deleted — access cut" : "no agendo user (already gone)");
  } catch (err) {
    // The one failure that aborts: without this, nothing has been cut and the cleanup
    // below would delete a working user's shifts for no reason.
    fail("delete agendo user", err);
    return report;
  }

  // 2. Any pending invite for their email. An invite is a standing grant: the backstop
  // applies it the moment someone with that address signs in, so leaving one behind would
  // let an offboarded person walk back in with the access it carries. Normally the invite
  // was consumed at their signup and there is nothing here — this covers the case where
  // that delete failed (onboardingService logs and continues) and re-invites after an
  // offboard, which are deliberate and go through the invites UI.
  if (email) {
    try {
      const { deletedCount } = await UserInvite.deleteOne({ email });
      report.invitesRevoked = deletedCount;
      if (deletedCount) log(`revoked a pending invite for ${email}`);
    } catch (err) {
      fail("revoke pending invite", err);
    }
  }

  // 3. Future shifts — the phantom coverage.
  try {
    const { deletedCount } = await Shift.deleteMany({
      userId: clerkId,
      startTime: { $gte: now },
    });
    report.futureShiftsDeleted = deletedCount;
    log(`${deletedCount} future shift(s) cancelled, ${report.pastShiftsKept} past kept`);
  } catch (err) {
    fail("cancel future shifts", err);
  }

  // 4. Stale location assignments.
  try {
    const { modifiedCount } = await Location.updateMany(
      { assignedUsers: clerkId },
      { $pull: { assignedUsers: clerkId } },
    );
    report.locationsUpdated = modifiedCount;
    if (modifiedCount) log(`removed from ${modifiedCount} location(s)`);
  } catch (err) {
    fail("remove location assignments", err);
  }

  // 5. Clerk — the login and the Google grant with it. Last, because by now they can
  // already do nothing, and a Clerk outage must not hold up any of the above.
  try {
    const { deleted, alreadyGone } = await userService.deleteClerkUser(clerkId);
    report.clerkUserDeleted = deleted;
    report.clerkAlreadyGone = Boolean(alreadyGone);
    log(deleted ? "clerk account deleted" : "no clerk account (already gone)");
  } catch (err) {
    fail("delete clerk account", err);
  }

  return report;
}

export default { offboardUser };
