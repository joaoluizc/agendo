import Shift from "../models/ShiftModel.js";
import positionService from "./positionService.js";

/**
 * Stamp the position's "used today" marker, for ordering the position pickers.
 *
 * Deliberately swallowed on failure: this is ordering metadata for a dropdown, and losing
 * it must never be the reason a shift fails to save.
 */
async function notePositionUsed(positionId) {
  try {
    await positionService.touchPositionUsage(positionId);
  } catch (err) {
    console.warn(`Could not record position usage: ${err.message}`);
  }
}

async function createShift(shiftDetails) {
  const {
    startTime,
    endTime,
    userId,
    positionId,
    createdBy,
    // A shift starts as a plan; publishing is what makes it real and puts it on an agent's
    // calendar (see publishShifts). This is the fail-closed default for the whole app —
    // `ShiftModel` deliberately has none, because a schema default would also apply when
    // Mongoose hydrates the pre-lifecycle documents that have no status and are in fact
    // published. Since this is the only place a Shift is constructed, defaulting here gets
    // "new means draft" without misreading history.
    status = "draft",
    source = "ui",
    runId,
    notes,
    // Set only when a caller creates a shift already published — see
    // shiftController.createShift. A draft carries neither.
    publishedAt,
    publishedBy,
    isSynced = false,
    syncedEvent = {},
  } = shiftDetails;

  const shift = new Shift({
    startTime,
    endTime,
    userId,
    positionId,
    createdBy,
    status,
    source,
    runId,
    notes,
    publishedAt,
    publishedBy,
    isSynced,
    syncedEvent,
  });

  await shift.save();
  await notePositionUsed(positionId);

  return shift;
}

async function getShift(shiftId) {
  const shift = await Shift.findById(shiftId);
  return shift;
}

/**
 * Create many shifts in one write. The duplicate-day flow's counterpart to `createShift`,
 * with the same "new means draft" default: a copied full day used to be one save plus one
 * position-usage write per shift, per target day, all serial.
 *
 * `ordered: false` lets the valid documents land when one fails validation. Returns what
 * was inserted and a message per failure, so the caller can still count both.
 */
async function createShifts(shiftDetailsList) {
  const docs = shiftDetailsList.map(
    ({
      startTime,
      endTime,
      userId,
      positionId,
      createdBy,
      status = "draft",
      source = "ui",
      runId,
      notes,
      publishedAt,
      publishedBy,
      isSynced = false,
      syncedEvent = {},
    }) => ({
      startTime,
      endTime,
      userId,
      positionId,
      createdBy,
      status,
      source,
      runId,
      notes,
      publishedAt,
      publishedBy,
      isSynced,
      syncedEvent,
    })
  );
  if (docs.length === 0) return { created: [], errors: [] };

  let created = [];
  const errors = [];
  try {
    created = await Shift.insertMany(docs, { ordered: false });
  } catch (err) {
    // With `ordered: false` a write error still inserts the rest; Mongoose hands those
    // back on the error.
    created = err.insertedDocs ?? [];
    const writeErrors = err.writeErrors ?? [];
    if (writeErrors.length) {
      writeErrors.forEach((writeError) =>
        errors.push(writeError.errmsg ?? writeError.message ?? String(writeError))
      );
    } else {
      errors.push(err.message);
    }
  }
  // Mongoose drops documents that fail validation from an unordered insert without
  // throwing, so account for any shortfall rather than let it vanish.
  const unaccounted = docs.length - created.length - errors.length;
  if (unaccounted > 0) {
    errors.push(
      `${unaccounted} shift${
        unaccounted === 1 ? " was" : "s were"
      } not created (failed validation)`
    );
  }

  const positionIds = [...new Set(created.map((shift) => String(shift.positionId)))];
  await Promise.all(positionIds.map((positionId) => notePositionUsed(positionId)));

  return { created, errors };
}

/** Delete many shifts in one write. */
async function deleteShifts(shiftIds) {
  if (!shiftIds?.length) return 0;
  const result = await Shift.deleteMany({ _id: { $in: shiftIds } });
  return result.deletedCount ?? 0;
}

async function deleteShift(shiftId) {
  const shift = await Shift.findByIdAndDelete(shiftId);
  return shift;
}

async function updateShift(shiftId, shiftDetails) {
  const shift = await Shift.findById(shiftId);

  console.log(`shiftId: ${shiftId}`);
  console.log(`shiftDetails: ${shiftDetails}`);

  const {
    startTime,
    endTime,
    userId,
    positionId,
    isSynced,
    syncedEvent,
    status,
    publishedAt,
    publishedBy,
  } = shiftDetails;
  shift.startTime = startTime;
  shift.endTime = endTime;
  shift.userId = userId;
  shift.positionId = positionId;
  shift.isSynced = isSynced;
  shift.syncedEvent = syncedEvent;

  // An edit may move the shift between draft and published — that is how un-publishing
  // exists at all, and how re-timing a published shift can drop back to draft instead of
  // silently pushing the new time to a calendar. Only assigned when the caller actually
  // said something, so an edit that ignores status leaves it alone rather than resetting
  // it. The transition's side effects (deleting or creating the calendar event, stamping
  // publishedAt/By) belong to shiftController.updateShift, which knows the previous state.
  if (status !== undefined) {
    shift.status = status;
    shift.publishedAt = publishedAt ?? null;
    shift.publishedBy = publishedBy ?? null;
  }

  await shift.save();
  await notePositionUsed(positionId);

  return shift;
}

/**
 * Every shift overlapping a window.
 *
 * Drafts are excluded unless asked for, so the safe behaviour is the one a caller gets by
 * not thinking about it — and the caller that most needs it that way is the hours report,
 * where counting a plan as time worked is a reporting error.
 *
 * Two callers opt in, both because they are about the plan rather than the record: the
 * schedule grid (reviewing drafts is the point of it) and the duplicate-day flow (the day
 * being copied is usually one that was just built, so entirely draft).
 *
 * The filter is `$ne: "draft"` rather than `= "published"` on purpose — a shift written
 * before `status` existed has no such field, and matching on the positive value would
 * hide all of it. See models/ShiftModel.js.
 */
async function findShiftsByRange(
  startDateTime,
  endDateTime,
  { includeDrafts = false } = {},
) {
  const shifts = await Shift.find({
    ...(includeDrafts ? {} : { status: { $ne: "draft" } }),
    // Find shifts that overlap with the given 24-hour range
    $or: [
      // Shifts that start within the range
      {
        startTime: {
          $gte: startDateTime,
          $lt: endDateTime,
        },
      },
      // Shifts that end within the range
      {
        endTime: {
          $gt: startDateTime,
          $lte: endDateTime,
        },
      },
      // Shifts that completely encompass the range
      {
        startTime: { $lte: startDateTime },
        endTime: { $gte: endDateTime },
      },
    ],
  });

  return shifts;
}

/**
 * Turn drafts into real shifts.
 *
 * Only the status write lives here; syncing the newly-published shifts to Google Calendar
 * is the controller's job, and has to happen *after* this returns — `shouldSyncShift`
 * refuses a draft, so a shift that hasn't flipped yet would be silently skipped.
 *
 * Kept separate from `updateShift` so that publishing is never a side effect of an edit.
 * Publishing an already-published shift is a no-op rather than an error, which is what
 * makes a retry safe after a partial failure.
 *
 * @returns {Promise<{published: object[], alreadyPublished: object[], notFound: string[]}>}
 */
async function publishShifts(shiftIds, publishedBy) {
  const shifts = await Shift.find({ _id: { $in: shiftIds } });

  const foundIds = new Set(shifts.map((shift) => String(shift._id)));
  const notFound = shiftIds
    .map(String)
    .filter((shiftId) => !foundIds.has(shiftId));

  const alreadyPublished = shifts.filter((shift) => shift.status !== "draft");
  const draftIds = shifts
    .filter((shift) => shift.status === "draft")
    .map((shift) => shift._id);
  if (draftIds.length === 0) return { published: [], alreadyPublished, notFound };

  const publishedAt = new Date();
  // One write for the batch instead of a save per shift. The `status: "draft"` filter is
  // what keeps two concurrent publishes of the same shift from both claiming it: only one
  // write matches, and the re-read below returns only the shifts *this* call flipped, so
  // only one of them goes on to create the calendar event.
  await Shift.updateMany(
    { _id: { $in: draftIds }, status: "draft" },
    { $set: { status: "published", publishedAt, publishedBy } }
  );
  const published = await Shift.find({
    _id: { $in: draftIds },
    status: "published",
    publishedAt,
    publishedBy,
  });

  return { published, alreadyPublished, notFound };
}

/**
 * Take published shifts back to draft.
 *
 * Returns each one with the calendar event it *had*, because clearing `syncedEvent` is part
 * of the write and the controller still needs the id to delete the event from Google. The
 * order matters: capture, then clear, then let the controller delete — a shift that says it
 * has an event which no longer exists is worse than the reverse.
 *
 * A shift already in draft is reported, not touched. A shift with no status at all predates
 * the lifecycle and counts as published, so unpublishing it is meaningful.
 *
 * @returns {Promise<{unpublished: {shift: object, priorEvent: object|null}[], alreadyDraft: object[], notFound: string[]}>}
 */
async function unpublishShifts(shiftIds) {
  const shifts = await Shift.find({ _id: { $in: shiftIds } });

  const foundIds = new Set(shifts.map((shift) => String(shift._id)));
  const notFound = shiftIds
    .map(String)
    .filter((shiftId) => !foundIds.has(shiftId));

  const alreadyDraft = shifts.filter((shift) => shift.status === "draft");
  const toUnpublish = shifts.filter((shift) => shift.status !== "draft");
  if (toUnpublish.length === 0) return { unpublished: [], alreadyDraft, notFound };

  // Capture each event before the write clears it — the controller still needs the ids to
  // delete them from Google.
  const priorEvents = new Map(
    toUnpublish.map((shift) => [
      String(shift._id),
      shift.isSynced ? shift.syncedEvent : null,
    ])
  );

  // One write for the batch. `$ne: "draft"` rather than `"published"`: a legacy shift has
  // no status at all and is published (see ShiftModel).
  await Shift.updateMany(
    { _id: { $in: toUnpublish.map((shift) => shift._id) }, status: { $ne: "draft" } },
    {
      $set: {
        status: "draft",
        publishedAt: null,
        publishedBy: null,
        isSynced: false,
        syncedEvent: null,
      },
    }
  );
  const updated = await Shift.find({
    _id: { $in: toUnpublish.map((shift) => shift._id) },
  });

  const unpublished = updated
    .filter((shift) => shift.status === "draft")
    .map((shift) => ({ shift, priorEvent: priorEvents.get(String(shift._id)) }));

  return { unpublished, alreadyDraft, notFound };
}

export default {
  createShift,
  getShift,
  deleteShift,
  deleteShifts,
  createShifts,
  updateShift,
  findShiftsByRange,
  publishShifts,
  unpublishShifts,
};
