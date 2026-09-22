import { validateObjFields } from "../utils/validateObjFields.js";
import shiftService from "../services/shiftService.js";
import { sortByDate, groupByDay, groupByUsers } from "../utils/sortShifts.js";
import slingController from "./slingController.js";
import { mergeShiftsFromSling } from "../utils/mergeShiftsFromSling.js";
import gCalendarService from "../services/gCalendarService.js";
import positionService from "../services/positionService.js";
import userService from "../services/userService.js";
import isISODate from "../utils/isISODate.js";
import { isAdminRequest } from "../services/authz.js";

const SHIFT_STATUSES = ["draft", "published"];

/**
 * Put a published shift on its agent's calendar and record the event on it.
 *
 * Shared by the two paths that can publish — creating a shift already published, and
 * publishing a draft — so the sync, the "no event because the agent switched this position
 * off" case, and the failure handling exist once rather than twice.
 *
 * Never call this for a draft: `shouldSyncShift` would refuse it anyway, but the point is
 * that a draft has no business here.
 *
 * @returns {Promise<string|null>} an error message, or null on success.
 */
async function syncPublishedShift(shift, requestId, enforcedObjectIds) {
  try {
    const addedEvent = await gCalendarService.addEventForShift(
      shift.userId,
      shift,
      requestId,
      enforcedObjectIds
    );
    // No event is the normal outcome when the agent has this position's sync switched
    // off — the shift is still published, it just doesn't reach their calendar.
    if (addedEvent) {
      shift.isSynced = true;
      shift.syncedEvent = addedEvent;
      await shift.save();
    }
    return null;
  } catch (err) {
    console.error(
      `[${requestId}] - Error syncing published shift ${shift._id}: ${err.message}`
    );
    return err.message;
  }
}

/**
 * Check a shift payload and strip anything not in the required set.
 *
 * `userField` differs by route and has to: `POST /shift/new` takes a `userIds` **array**
 * (one slot, many agents), while `PUT /shift/` takes a single `userId`. Both used to share
 * the `userIds` list, so every update was rejected with `Missing fields: userIds` — which
 * meant editing a shift from the dialog, and dragging one to another agent or time, both
 * failed with "1 change could not be saved" and no hint as to why.
 *
 * Note that `validateObjFields` MUTATES the object it is given, deleting every key outside
 * the required set. Callers pass `req.body` directly, so read anything else off the body
 * *before* calling this — see the comments in createShift and updateShift.
 */
function validateShift(shift, { userField = "userIds" } = {}) {
  const requiredFields = ["startTime", "endTime", userField, "positionId"];

  const shiftValidated = validateObjFields(shift, requiredFields);

  shiftValidated.startTime = new Date(shiftValidated.startTime);
  shiftValidated.endTime = new Date(shiftValidated.endTime);

  if (shiftValidated.startTime > shiftValidated.endTime) {
    throw new Error("startTime cannot be after endTime");
  }

  return shiftValidated;
}

async function createShift(req, res) {
  const { userId } = req.auth;

  console.log(`[${req.requestId}] - starting shift creation flow`);

  // Read before validating. `validateShift` -> `validateObjFields` mutates the object it
  // is given and *deletes* every key outside its required list, and it is handed
  // `req.body` directly — so anything read from the body afterwards is already gone. That
  // is what made "Publish now" silently create drafts: the status was stripped, and the
  // `?? "draft"` fallback below then looked entirely reasonable.
  //
  // A new shift is a draft unless the caller explicitly asks for it published. The dialog
  // offers that as a toggle for the case where someone knows the shift is final and does
  // not want a second step; the default stays draft, so the safe outcome is the one you
  // get by not choosing. Only an admin can reach this route at all (`adminOnly`).
  //
  // An unrecognised value is rejected rather than quietly treated as a draft: silently
  // ignoring it would let a client believe it had published something it had not.
  const status = req.body.status ?? "draft";
  if (!SHIFT_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status must be one of ${SHIFT_STATUSES.join(", ")}`,
    });
  }
  const publishing = status === "published";

  let shift;
  try {
    shift = validateShift(req.body);
    shift.createdBy = userId;
  } catch (err) {
    console.error(`[${req.requestId}] - error validating shift: `, err.message);
    return res.status(400).json({ message: err.message });
  }

  // Check if `userId` is an array
  const shiftUserIds = Array.isArray(shift.userIds)
    ? shift.userIds
    : [shift.userIds];

  const createdShifts = [];
  const errors = [];

  // Only needed when publishing, and then once for the batch rather than per shift.
  const enforcedObjectIds = publishing
    ? (await positionService.getEnforcedPositionIds()).objectIds
    : null;

  for (const shiftUserId of shiftUserIds) {
    const shiftCopy = {
      ...shift,
      userId: shiftUserId,
      status,
      source: "ui",
      ...(publishing
        ? { publishedAt: new Date(), publishedBy: userId }
        : {}),
    };

    let createdShift;
    try {
      createdShift = await shiftService.createShift(shiftCopy);
      createdShifts.push(createdShift);
    } catch (err) {
      console.error(`[${req.requestId}]`, err.message);
      errors.push({
        userId: shiftUserId,
        message: `Caught error when creating shift: ${err.message}`,
      });
      continue;
    }

    // Written first, synced second — the same order publishShifts uses, and for the same
    // reason: a shift that exists without its calendar event is recoverable, an event for
    // a shift that failed to save is not.
    if (publishing) {
      const syncError = await syncPublishedShift(
        createdShift,
        req.requestId,
        enforcedObjectIds
      );
      if (syncError) {
        errors.push({
          userId: shiftUserId,
          message: `Shift published but calendar sync failed: ${syncError}`,
        });
      }
    }

    console.log(
      `[${req.requestId}] ${status} shift created for user ${shiftUserId}: ${JSON.stringify(
        createdShift._id
      )}`
    );
  }

  if (errors.length > 0) {
    return res.status(207).json({
      message: "Some shifts were created, but there were errors.",
      createdShifts,
      errors,
    });
  }

  return res.status(201).json({
    message: `${publishing ? "Published" : "Draft"} shifts created successfully`,
    data: createdShifts,
  });
}

/**
 * Should this request see draft shifts?
 *
 * Drafts go only to someone who can act on them. The route itself stays open — the
 * schedule shows the whole roster's day to everyone — so the gate is per-response rather
 * than per-route, and a non-admin simply receives the committed schedule.
 *
 * Asking `authz.isAdminRequest` rather than re-deriving the answer keeps this in step with
 * `adminOnly`, including the ADMIN_BYPASS opt-in: without that, a local admin could create
 * drafts through a bypassed route and then not see them on the grid.
 */
async function shouldReturnDrafts(req) {
  const requested =
    req.query.includeDrafts === "1" || req.query.includeDrafts === "true";
  if (!requested) return false;
  return await isAdminRequest(req.auth?.userId);
}

async function findShiftsByRange(req, res) {
  const { startTime, endTime, sort = "asc", group = "none" } = req.query;

  if (sort !== "asc" && sort !== "desc") {
    return res.status(400).json({
      message: "sort must be either 'asc' or 'desc'",
    });
  }

  if (group !== "user" && group !== "day" && group !== "none") {
    return res.status(400).json({
      message: "group must be 'user', 'day', or 'none'",
    });
  }

  if (!startTime || !endTime) {
    return res.status(400).json({
      message: "startTime and endTime are required query parameters",
    });
  }

  if (startTime > endTime) {
    return res.status(400).json({
      message: "startTime cannot be after endTime",
    });
  }

  let shifts = [];
  try {
    shifts = await shiftService.findShiftsByRange(startTime, endTime, {
      includeDrafts: await shouldReturnDrafts(req),
    });
  } catch (err) {
    console.error(err.message);
    return res
      .status(500)
      .json({ message: `caught error when finding shifts: ${err.message}` });
  }

  shifts = sortByDate(shifts, sort);

  if (group === "user") {
    const shiftsByUser = groupByUsers(shifts);
    return res.status(200).json(shiftsByUser);
  } else if (group === "day") {
    const shiftsByDay = groupByDay(shifts);
    return res.status(200).json(shiftsByDay);
  }

  return res.status(200).json(shifts);
}

async function findShiftsByRangeWithSling(req, res) {
  const { startTime, endTime, sort = "asc", group = "none" } = req.query;

  if (sort !== "asc" && sort !== "desc") {
    return res.status(400).json({
      message: "sort must be either 'asc' or 'desc'",
    });
  }

  if (group !== "user" && group !== "day" && group !== "none") {
    return res.status(400).json({
      message: "group must be 'user', 'day', or 'none'",
    });
  }

  if (!startTime || !endTime) {
    return res.status(400).json({
      message: "startTime and endTime are required query parameters",
    });
  }

  if (startTime > endTime) {
    return res.status(400).json({
      message: "startTime cannot be after endTime",
    });
  }

  let shifts = [];
  try {
    shifts = await shiftService.findShiftsByRange(startTime, endTime);
  } catch (err) {
    console.error(err.message);
    return res
      .status(500)
      .json({ message: `caught error when finding shifts: ${err.message}` });
  }

  shifts = sortByDate(shifts, sort);

  let slingShifts;
  try {
    slingShifts = await slingController.getCalendar(`${startTime}/${endTime}`);
  } catch (err) {
    console.error(err.message);
    return res
      .status(500)
      .json({ message: "error fetching shifts from Sling" });
  }
  const mergedShifts = mergeShiftsFromSling(shifts, slingShifts);
  console.log(mergedShifts);

  if (group === "user") {
    const shiftsByUser = groupByUsers(shifts);
    return res.status(200).json(shiftsByUser);
  } else if (group === "day") {
    const shiftsByDay = groupByDay(shifts);
    return res.status(200).json(shiftsByDay);
  }

  return res.status(200).json(shifts);
}

/**
 * Edit one shift, including moving it between draft and published.
 *
 * The status is the caller's to set here, which is a reversal: creating a shift used to be
 * the only way to publish and an edit could not. It turned out an edit is exactly where
 * you want the choice — there was otherwise no way to un-publish anything short of
 * deleting it, and re-timing a published shift silently pushed the new time to the agent's
 * calendar. The dialog now shows the state as a toggle and turns it off when the time
 * changes, so the quiet outcome is "back to draft" rather than "already sent".
 *
 * Omitting `status` keeps whatever the shift had, so callers that don't care are unaffected.
 */
async function updateShift(req, res) {
  const { shiftId } = req.query;

  // Read before validating — `validateObjFields` deletes every key outside its required
  // list from `req.body` itself. See the same trap in createShift.
  const requestedStatus = req.body.status;
  if (requestedStatus !== undefined && !SHIFT_STATUSES.includes(requestedStatus)) {
    return res.status(400).json({
      message: `status must be one of ${SHIFT_STATUSES.join(", ")}`,
    });
  }

  const { userId } = req.auth;

  let shift;
  try {
    // One agent per update, so `userId` — not the `userIds` array the create route takes.
    shift = validateShift(req.body, { userField: "userId" });
    console.log(
      `[${
        req.requestId
      }] - updating shift. shift after validation: ${JSON.stringify(shift)}`
    );
  } catch (err) {
    console.error(
      `[${req.requestId}] - error validating shift update: `,
      err.message
    );
    return res.status(400).json({ message: err.message });
  }

  let shiftBeforeUpdate;
  try {
    shiftBeforeUpdate = await shiftService.getShift(shiftId);
  } catch (err) {
    console.error(
      `[${req.requestId}] - Caught error when updating shift. Shift not found: `,
      err.message
    );
    return res.status(404).json({ message: "Shift not found" });
  }

  // A stored shift with no status at all predates the lifecycle and is published.
  const statusBefore =
    shiftBeforeUpdate.status === "draft" ? "draft" : "published";
  const statusAfter = requestedStatus ?? statusBefore;

  // The status has to be on the object before the sync attempt: `shouldSyncShift` decides
  // on that field, and `shift` came from the request body which no longer carries it.
  shift.status = statusAfter;

  if (statusAfter === "published") {
    // Re-publishing something already published keeps its original stamps; only an actual
    // draft -> published transition records a new one.
    shift.publishedAt =
      statusBefore === "published"
        ? shiftBeforeUpdate.publishedAt
        : new Date();
    shift.publishedBy =
      statusBefore === "published" ? shiftBeforeUpdate.publishedBy : userId;
  } else {
    // Back to a plan: it is no longer committed by anyone. The calendar event it had is
    // removed by the block below, which fires on the *previous* isSynced.
    shift.publishedAt = null;
    shift.publishedBy = null;
  }

  // Start from unsynced and let the sync below prove otherwise. Without this the value
  // carried over from the request body — which is to say `undefined` — and a shift going
  // draft would keep claiming a calendar event that had just been deleted.
  shift.isSynced = false;
  shift.syncedEvent = null;

  if (shiftBeforeUpdate.isSynced) {
    try {
      const user = await userService.getClerkUserById(shiftBeforeUpdate.userId);
      await gCalendarService.deleteEvents_cl(
        user,
        [shiftBeforeUpdate.syncedEvent],
        req.requestId
      );
    } catch (err) {
      console.error(
        `[${req.requestId}] - Caught error updating shift in google calendar: `,
        err.message
      );
    }
  }

  try {
    const addedEvent = await gCalendarService.addEventForShift(
      shift.userId,
      shift,
      req.requestId
    );
    if (addedEvent) {
      shift.isSynced = true;
      shift.syncedEvent = addedEvent;
    }
  } catch (err) {
    console.error(
      `[${req.requestId}] Caught error adding updated shift to google calendar: `,
      err.message
    );
    shift.isSynced = false;
  }

  let updatedShift;
  try {
    updatedShift = await shiftService.updateShift(shiftId, shift);
    res.status(200).json({ message: "Shift updated", data: updatedShift });
  } catch (err) {
    console.error(err.message);
    res
      .status(500)
      .json({ message: `caught error when updating shift: ${err.message}` });
  }

  return updatedShift;
}

async function deleteShift(req, res) {
  const { shiftId } = req.query;

  let shift;
  try {
    shift = await shiftService.getShift(shiftId);
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({
      message: `caught error when locating shift before deleting: ${err.message}`,
    });
  }

  if (shift.isSynced) {
    try {
      const user = await userService.getClerkUserById(shift.userId);
      await gCalendarService.deleteEvents_cl(
        user,
        [shift.syncedEvent],
        req.requestId
      );
    } catch (err) {
      console.error(
        `[${req.requestId}] - Caught error updating shift in google calendar: `,
        err.message
      );
    }
  }

  if (!shift) {
    return res.status(404).json({ message: "Shift not found" });
  }

  if (shift.isSynced) {
    try {
      await gCalendarService.deleteEvents([shift.syncedEvent]);
    } catch (err) {
      console.error(
        `Caught error deleting shift from google calendar: ${err.message}`
      );
    }
  }

  try {
    await shiftService.deleteShift(shiftId);
    res.status(200).json({ message: "Shift deleted" });
  } catch (err) {
    console.error(err.message);
    res
      .status(500)
      .json({ message: `caught error when deleting shift: ${err.message}` });
  }

  return shift;
}

async function getShift(req, res) {
  const { shiftId } = req.query;

  console.log(`shiftId: ${shiftId}`);

  let shift;
  try {
    shift = await shiftService.getShift(shiftId);
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({
      message: `caught error when locating shift: ${err.message}`,
    });
  }

  if (!shift) {
    return res.status(404).json({ message: "Shift not found" });
  }

  return res.status(200).json(shift);
}

const DUPLICATE_MODES = ["skip", "merge", "replace"];

/** The 24 hours starting at an instant the client picked as its local midnight.
 *
 * Deriving the window from the instant is what makes it the *caller's* day. Reading
 * local calendar parts off it here would give the API server's day instead, which is
 * only the same day when both happen to sit in the same timezone — and this endpoint can
 * now delete shifts, so a window three hours out of step is not a cosmetic problem.
 *
 * (A day that crosses a DST boundary is 23 or 25 hours long, so two days a year the
 * window is off by one hour at the far end. Fixing that properly means sending both
 * bounds from the client, which knows the zone.)
 */
function localDayWindow(isoInstant) {
  const begin = new Date(isoInstant);
  const end = new Date(begin.getTime() + 24 * 60 * 60 * 1000);
  return { begin, end };
}

/** Delete a shift and, if it reached Google Calendar, the event with it. */
async function removeShiftAndEvent(shift, requestId) {
  if (shift.isSynced && shift.syncedEvent) {
    try {
      const user = await userService.getClerkUserById(shift.userId);
      await gCalendarService.deleteEvents_cl(
        user,
        [shift.syncedEvent],
        requestId
      );
    } catch (err) {
      console.error(
        `[${requestId}] - Error removing calendar event for replaced shift: ${err.message}`
      );
    }
  }
  await shiftService.deleteShift(shift._id);
}

/**
 * Copy one day's shifts onto one or more other days.
 *
 * `targetDate` still works; `targetDates` is the array form, so picking five days in the
 * dialog is one request rather than five. Three options shape what happens on a day that
 * already has shifts for the selected users:
 *
 * - `skip`    — leave that day alone
 * - `merge`   — copy anyway and let the shifts stack (the original behaviour, and still
 *               the default, so existing callers are unaffected)
 * - `replace` — delete those users' shifts on that day first
 *
 * `excludePositionIds` leaves positions behind. The dialog uses it for breaks, meetings
 * and unavailable blocks: copying Friday usually means copying Friday's coverage, not
 * last Friday's 1:1.
 *
 * A failure on one day no longer aborts the rest — the response reports what each day
 * did, so a partial run is legible instead of silent.
 *
 * Drafts take part on both sides: the source day is copied draft and published alike
 * (it is usually a day that was just built, so all draft), and a target day holding
 * drafts counts as non-empty for `skip`/`replace`. Every copy lands as a **draft**
 * whatever its source was — copying a week ahead proposes those days, it does not commit
 * them. Nothing here touches a calendar; that waits for POST /shift/publish.
 */
async function duplicateShiftsFromDay(req, res) {
  const {
    sourceDate,
    targetDate,
    targetDates,
    users,
    mode = "merge",
    excludePositionIds = [],
  } = req.body;
  // Stamped onto every duplicated shift as `createdBy` further down.
  const { userId } = req.auth;

  // The admin check lives on the route (`adminOnly`) like every other shift mutation.
  // It used to be done here via `utils/userIsAdmin`, which read Clerk
  // `publicMetadata.type` — a field agendo stopped writing once the profile JSON
  // outgrew Clerk's metadata size limit, so it denied genuine admins.
  const targets =
    Array.isArray(targetDates) && targetDates.length
      ? targetDates
      : [targetDate];

  if (!sourceDate || !targets[0] || !users) {
    return res.status(400).json({
      message:
        "sourceDate, targetDate (or targetDates), and users are required body parameters",
    });
  }

  if (!Array.isArray(users)) {
    return res.status(400).json({ message: "users must be an array" });
  }

  if (!isISODate(sourceDate) || !targets.every((date) => isISODate(date))) {
    return res.status(400).json({
      message: "sourceDate and every target date must be a valid ISO date",
    });
  }

  if (!DUPLICATE_MODES.includes(mode)) {
    return res
      .status(400)
      .json({ message: `mode must be one of ${DUPLICATE_MODES.join(", ")}` });
  }

  if (!Array.isArray(excludePositionIds)) {
    return res
      .status(400)
      .json({ message: "excludePositionIds must be an array" });
  }

  console.log(
    `[${req.requestId}] - Duplicating shifts from ${sourceDate} onto ${targets.length} day(s), mode ${mode}, for users ${users}`
  );

  const source = localDayWindow(sourceDate);
  let sourceShifts;
  try {
    // Drafts included: the day being copied is usually one that was just built, so it is
    // entirely draft. Excluding them would make "copy Monday onto the rest of the week"
    // silently copy nothing — the single most common reason to use this at all.
    sourceShifts = await shiftService.findShiftsByRange(
      source.begin,
      source.end,
      { includeDrafts: true }
    );
  } catch (err) {
    console.error(`[${req.requestId}] - Error finding shifts: ${err.message}`);
    return res
      .status(500)
      .json({ message: `caught error when finding shifts: ${err.message}` });
  }

  const excluded = new Set(excludePositionIds.map(String));
  const shiftsToDuplicate = sourceShifts.filter(
    (shift) =>
      users.includes(shift.userId) && !excluded.has(String(shift.positionId))
  );

  if (shiftsToDuplicate.length === 0) {
    return res.status(200).json({
      message: "Nothing to duplicate",
      created: 0,
      replaced: 0,
      days: targets.map((date) => ({ date, status: "empty", created: 0 })),
    });
  }

  const results = [];
  const errors = [];
  let createdTotal = 0;
  let replacedTotal = 0;

  for (const target of targets) {
    const window = localDayWindow(target);

    let existing = [];
    if (mode !== "merge") {
      try {
        // findShiftsByRange returns anything *overlapping* the window, which would let
        // "replace the day" delete a shift that started the night before and merely
        // spills past midnight. Only shifts that begin inside the day belong to it.
        //
        // Drafts count as existing shifts here. A target day holding drafts is not empty,
        // so `skip` must skip it, and `replace` must clear them — otherwise replacing a
        // day would stack a second set of drafts on top of the first.
        existing = (
          await shiftService.findShiftsByRange(window.begin, window.end, {
            includeDrafts: true,
          })
        ).filter(
          (shift) =>
            users.includes(shift.userId) &&
            new Date(shift.startTime) >= window.begin &&
            new Date(shift.startTime) < window.end
        );
      } catch (err) {
        console.error(
          `[${req.requestId}] - Error checking ${target} for existing shifts: ${err.message}`
        );
        errors.push({ date: target, message: err.message });
        results.push({ date: target, status: "failed", created: 0 });
        continue;
      }
    }

    if (mode === "skip" && existing.length > 0) {
      console.log(
        `[${req.requestId}] - Skipping ${target}: ${existing.length} existing shift(s)`
      );
      results.push({
        date: target,
        status: "skipped",
        created: 0,
        existing: existing.length,
      });
      continue;
    }

    let replaced = 0;
    if (mode === "replace") {
      for (const shift of existing) {
        try {
          await removeShiftAndEvent(shift, req.requestId);
          replaced++;
        } catch (err) {
          console.error(
            `[${req.requestId}] - Error replacing shift ${shift._id}: ${err.message}`
          );
          errors.push({ date: target, message: err.message });
        }
      }
      replacedTotal += replaced;
    }

    // Both dates arrived as the caller's local midnight, so the gap between them is the
    // whole of the move — the same flat-24h model `localDayWindow` already works in.
    // Translating each shift by it keeps the shift's length and its place in the day
    // exactly as they were.
    //
    // Rebuilding the times from `getHours()` is what this replaced, and it was wrong
    // twice over: it read the clock in the *API server's* zone rather than the caller's,
    // and it pinned both ends to the target day, silently dropping the date when an end
    // fell on the following one. With the server on UTC and the schedule worked at
    // UTC-3, every shift ending 21:00 or later ends the next day in UTC — so a
    // 12:00–21:00 block came back ending 21:00 the *previous* evening: an end before its
    // own start, which the grid drew as a shift running to -3.
    const dayDelta = new Date(target).getTime() - new Date(sourceDate).getTime();

    let created = 0;
    for (const sourceShift of shiftsToDuplicate) {
      const shift = { ...sourceShift.toObject() };
      delete shift._id;

      shift.startTime = new Date(
        new Date(sourceShift.startTime).getTime() + dayDelta
      ).toISOString();
      shift.endTime = new Date(
        new Date(sourceShift.endTime).getTime() + dayDelta
      ).toISOString();

      shift.isSynced = false;
      shift.syncedEvent = null;
      shift.createdBy = userId;
      // A copy is a new shift, so it lands as a draft like any other: the day is a
      // proposal until someone publishes it. Nothing syncs here, which is also why the
      // calendar-event rollback this loop used to need has gone with it.
      shift.status = "draft";
      shift.source = "ui";
      // None of the original's commit or batch history carries over to a copy.
      shift.publishedAt = undefined;
      shift.publishedBy = undefined;
      shift.runId = undefined;
      shift.notes = undefined;

      try {
        await shiftService.createShift(shift);
        created++;
      } catch (err) {
        console.error(
          `[${req.requestId}] - Error creating duplicated shift: ${err.message}`
        );
        errors.push({ date: target, message: err.message });
      }
    }

    createdTotal += created;
    results.push({
      date: target,
      status: "copied",
      created,
      replaced,
    });
  }

  const copiedDays = results.filter((day) => day.status === "copied").length;
  const payload = {
    message: createdTotal
      ? `${createdTotal} shift${createdTotal === 1 ? "" : "s"} duplicated onto ${copiedDays} day${copiedDays === 1 ? "" : "s"}`
      : "No shifts were duplicated",
    created: createdTotal,
    replaced: replacedTotal,
    days: results,
  };

  if (errors.length) {
    return res.status(207).json({ ...payload, errors });
  }

  return res.status(201).json(payload);
}

/**
 * Commit drafts: mark them published and put them on agents' calendars.
 *
 * Takes a list of ids rather than a single one so the toolbar can commit a whole day in
 * one request, and so a posted schedule can later be approved the same way.
 *
 * Order matters. The status write happens first and the sync second, because
 * `shouldSyncShift` refuses a draft — sync a shift that hasn't flipped yet and it is
 * silently skipped. The cost is a moment where a published shift has no calendar event
 * yet, which is the same state a sync failure leaves behind and is reported the same way.
 *
 * A shift that was already published is counted and left alone rather than treated as an
 * error, so a double-click or a retry after a partial failure is harmless. It is
 * deliberately *not* re-synced: repairing a published shift whose event is missing is what
 * the day-resync flow (`addDaysShiftsToGcal_cl`) is for, and retrying it here would race
 * a concurrent publish into creating the event twice.
 */
async function publishShifts(req, res) {
  const { userId } = req.auth;
  const { shiftIds } = req.body;

  if (!Array.isArray(shiftIds) || shiftIds.length === 0) {
    return res
      .status(400)
      .json({ message: "shiftIds must be a non-empty array" });
  }

  console.log(
    `[${req.requestId}] - Publishing ${shiftIds.length} shift(s) for ${userId}`
  );

  let result;
  try {
    result = await shiftService.publishShifts(shiftIds, userId);
  } catch (err) {
    console.error(
      `[${req.requestId}] - Error publishing shifts: ${err.message}`
    );
    return res.status(500).json({
      message: `caught error when publishing shifts: ${err.message}`,
    });
  }

  const { published, alreadyPublished, notFound } = result;

  // Once for the batch, not once per shift — same reason duplicateShiftsFromDay does it.
  const { objectIds: enforcedObjectIds } =
    await positionService.getEnforcedPositionIds();

  const errors = [];

  for (const shift of published) {
    const syncError = await syncPublishedShift(
      shift,
      req.requestId,
      enforcedObjectIds
    );
    if (syncError) {
      errors.push({ shiftId: String(shift._id), message: syncError });
    }
  }

  const payload = {
    message: published.length
      ? `${published.length} shift${published.length === 1 ? "" : "s"} published`
      : "No shifts needed publishing",
    published: published.length,
    alreadyPublished: alreadyPublished.length,
    data: published,
  };

  if (notFound.length) {
    payload.notFound = notFound;
  }

  if (errors.length) {
    return res.status(207).json({ ...payload, errors });
  }

  return res.status(200).json(payload);
}

/**
 * Take published shifts back to draft and remove their calendar events.
 *
 * The counterpart to publishShifts, and the bulk form of unchecking Published in the edit
 * dialog. A shift already in draft is counted, not treated as an error, so a mixed
 * selection can be sent as-is.
 *
 * A calendar event that fails to delete leaves the agent with a meeting for a shift that is
 * no longer committed — reported per shift rather than swallowed, because nothing else will
 * notice it.
 */
async function unpublishShifts(req, res) {
  const { shiftIds } = req.body;

  if (!Array.isArray(shiftIds) || shiftIds.length === 0) {
    return res
      .status(400)
      .json({ message: "shiftIds must be a non-empty array" });
  }

  console.log(
    `[${req.requestId}] - Unpublishing ${shiftIds.length} shift(s) for ${req.auth.userId}`
  );

  let result;
  try {
    result = await shiftService.unpublishShifts(shiftIds);
  } catch (err) {
    console.error(
      `[${req.requestId}] - Error unpublishing shifts: ${err.message}`
    );
    return res.status(500).json({
      message: `caught error when unpublishing shifts: ${err.message}`,
    });
  }

  const { unpublished, alreadyDraft, notFound } = result;
  const errors = [];

  for (const { shift, priorEvent } of unpublished) {
    if (!priorEvent) continue;
    try {
      const user = await userService.getClerkUserById(shift.userId);
      await gCalendarService.deleteEvents_cl(user, [priorEvent], req.requestId);
    } catch (err) {
      console.error(
        `[${req.requestId}] - Error removing calendar event for unpublished shift ${shift._id}: ${err.message}`
      );
      errors.push({ shiftId: String(shift._id), message: err.message });
    }
  }

  const payload = {
    message: unpublished.length
      ? `${unpublished.length} shift${unpublished.length === 1 ? "" : "s"} moved back to draft`
      : "No shifts needed unpublishing",
    unpublished: unpublished.length,
    alreadyDraft: alreadyDraft.length,
    data: unpublished.map(({ shift }) => shift),
  };

  if (notFound.length) {
    payload.notFound = notFound;
  }

  if (errors.length) {
    return res.status(207).json({ ...payload, errors });
  }

  return res.status(200).json(payload);
}

export default {
  createShift,
  findShiftsByRange,
  findShiftsByRangeWithSling,
  updateShift,
  deleteShift,
  getShift,
  duplicateShiftsFromDay,
  publishShifts,
  unpublishShifts,
};
