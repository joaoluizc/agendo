import { validateObjFields } from "../utils/validateObjFields.js";
import shiftService from "../services/shiftService.js";
import { sortByDate, groupByDay, groupByUsers } from "../utils/sortShifts.js";
import slingController from "./slingController.js";
import { mergeShiftsFromSling } from "../utils/mergeShiftsFromSling.js";
import gCalendarService from "../services/gCalendarService.js";
import positionService from "../services/positionService.js";
import userService from "../services/userService.js";
import { userIsAdmin } from "../utils/userIsAdmin.js";
import isISODate from "../utils/isISODate.js";

function validateShift(shift) {
  const requiredFields = ["startTime", "endTime", "userIds", "positionId"];

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

  for (const shiftUserId of shiftUserIds) {
    const shiftCopy = { ...shift, userId: shiftUserId };

    try {
      const addedEvent = await gCalendarService.addEventForShift(
        shiftUserId,
        shiftCopy,
        req.requestId
      );
      if (addedEvent) {
        shiftCopy.isSynced = true;
        shiftCopy.syncedEvent = addedEvent;
        console.log(`[${req.requestId}] - shift synced with google calendar`);
      }
    } catch (err) {
      console.error(
        `[${req.requestId}] Caught error adding created shift to google calendar: `,
        err.message
      );
      shiftCopy.isSynced = false;
    }

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

    console.log(
      `[${
        req.requestId
      }] Shift created for user ${shiftUserId}: ${JSON.stringify(
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
    message: "Shifts created successfully",
    data: createdShifts,
  });
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
    shifts = await shiftService.findShiftsByRange(startTime, endTime);
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

async function updateShift(req, res) {
  const { shiftId } = req.query;

  let shift;
  try {
    shift = validateShift(req.body);
    console.log(
      `[${
        req.requestId
      }] - updating shift. shift after validation: ${JSON.stringify(shift)}`
    );
  } catch (err) {
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

  if (shiftBeforeUpdate.isSynced) {
    try {
      const user = await userService.findUser_cl(shiftBeforeUpdate.userId);
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
      const user = await userService.findUser_cl(shift.userId);
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
      const user = await userService.findUser_cl(shift.userId);
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
  const { userId } = req.auth;

  if (!userId || !(await userIsAdmin(userId))) {
    return res.status(403).json({ message: "Unauthorized" });
  }

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
    sourceShifts = await shiftService.findShiftsByRange(
      source.begin,
      source.end
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

  // Fetch enforced position ids once (not per shift) for this bulk duplicate.
  const { objectIds: enforcedObjectIds } =
    await positionService.getEnforcedPositionIds();

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
        existing = (
          await shiftService.findShiftsByRange(window.begin, window.end)
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

    const targetDateObj = new Date(target);
    const targetDayNum = targetDateObj.getDate();
    const targetMonthNum = targetDateObj.getMonth();
    const targetYearNum = targetDateObj.getFullYear();

    let created = 0;
    for (const sourceShift of shiftsToDuplicate) {
      const shift = { ...sourceShift.toObject() };
      delete shift._id;

      const shiftStartTime = new Date(sourceShift.startTime);
      const shiftEndTime = new Date(sourceShift.endTime);

      shift.startTime = new Date(
        targetYearNum,
        targetMonthNum,
        targetDayNum,
        shiftStartTime.getHours(),
        shiftStartTime.getMinutes()
      ).toISOString();
      shift.endTime = new Date(
        targetYearNum,
        targetMonthNum,
        targetDayNum,
        shiftEndTime.getHours(),
        shiftEndTime.getMinutes()
      ).toISOString();

      shift.isSynced = false;
      shift.syncedEvent = null;
      shift.createdBy = userId;

      try {
        const addedEvent = await gCalendarService.addEventForShift(
          shift.userId,
          shift,
          req.requestId,
          enforcedObjectIds
        );
        if (addedEvent) {
          shift.isSynced = true;
          shift.syncedEvent = addedEvent;
        }
      } catch (err) {
        console.error(
          `[${req.requestId}] - Error adding duplicated shift to Google Calendar: ${err.message}`
        );
        shift.isSynced = false;
      }

      try {
        await shiftService.createShift(shift);
        created++;
      } catch (err) {
        console.error(
          `[${req.requestId}] - Error creating duplicated shift: ${err.message}`
        );
        errors.push({ date: target, message: err.message });

        // Roll the calendar event back, or the agent keeps a meeting for a shift that
        // does not exist.
        if (shift.isSynced) {
          try {
            const user = await userService.findUser_cl(shift.userId);
            await gCalendarService.deleteEvents_cl(
              user,
              [shift.syncedEvent],
              req.requestId
            );
          } catch (e) {
            console.error(
              `[${req.requestId}] - Error rolling back calendar event: ${e.message}`
            );
          }
        }
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

export default {
  createShift,
  findShiftsByRange,
  findShiftsByRangeWithSling,
  updateShift,
  deleteShift,
  getShift,
  duplicateShiftsFromDay,
};
