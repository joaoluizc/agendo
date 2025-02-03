import { validateObjFields } from "../utils/validateObjFields.js";
import shiftService from "../services/shiftService.js";
import { sortByDate, groupByDay, groupByUsers } from "../utils/sortShifts.js";
import slingController from "./slingController.js";
import { mergeShiftsFromSling } from "../utils/mergeShiftsFromSling.js";
import gCalendarService from "../services/gCalendarService.js";
import userService from "../services/userService.js";
import { userIsAdmin } from "../utils/userIsAdmin.js";
import isISODate from "../utils/isISODate.js";

function validateShift(shift) {
  const requiredFields = ["startTime", "endTime", "userId", "positionId"];

  const shiftFieldsExist = validateObjFields(shift, requiredFields);

  shiftFieldsExist.startTime = new Date(shiftFieldsExist.startTime);
  shiftFieldsExist.endTime = new Date(shiftFieldsExist.endTime);

  if (shiftFieldsExist.startTime > shiftFieldsExist.endTime) {
    throw new Error("startTime cannot be after endTime");
  }

  return shiftFieldsExist;
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

  const shiftUserId = shift.userId;

  let errorAddingToCalendar = false;
  try {
    const addedEvent = await gCalendarService.addEventForShift(
      shiftUserId,
      shift,
      req.requestId
    );
    if (addedEvent) {
      shift.isSynced = true;
      shift.syncedEvent = addedEvent;
      console.log(`[${req.requestId}] - shift synced with google calendar`);
    }
  } catch (err) {
    console.error(
      `[${req.requestId}] Caught error adding created shift to google calendar: `,
      err.message
    );
    shift.isSynced = false;
    errorAddingToCalendar = true;
  }

  let createdShift;
  try {
    createdShift = await shiftService.createShift(shift);
  } catch (err) {
    console.error(`[${req.requestId}]`, err.message);
    return res
      .status(500)
      .json({ message: `Caught error when creating shift: ${err.message}` });
  }

  console.log(
    `[${req.requestId}] Shift created: ${JSON.stringify(createdShift._id)}`
  );
  if (shift.isSynced) {
    return res.status(201).json({ message: "Shift created" });
  }
  if (errorAddingToCalendar) {
    return res.status(201).json({
      message: "Shift created",
      details: "Not synced. Error adding to google calendar.",
    });
  }
  return res.status(201).json({
    message: "Shift created",
    details: "Not synced by user's request.",
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

  try {
    await shiftService.updateShift(shiftId, shift);
    res.status(200).json({ message: "Shift updated" });
  } catch (err) {
    console.error(err.message);
    res
      .status(500)
      .json({ message: `caught error when updating shift: ${err.message}` });
  }

  return shift;
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

async function duplicateShiftsFromDay(req, res) {
  const { sourceDate, targetDate, users } = req.body;
  const { userId } = req.auth;

  if (!userId || !(await userIsAdmin(userId))) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  if (!sourceDate || !targetDate || !users) {
    return res.status(400).json({
      message:
        "sourceDate, targetDate, and users are required query parameters",
    });
  }

  if (!isISODate(sourceDate) || !isISODate(targetDate)) {
    return res.status(400).json({
      message: "sourceDate and targetDate must be valid ISO dates",
    });
  }

  if (!Array.isArray(users)) {
    return res.status(400).json({ message: "users must be an array" });
  }

  console.log(
    `[${req.requestId}] - Duplicating shifts from ${sourceDate} to ${targetDate} for users ${users}`
  );

  let shifts;
  const sourceDateBegin = new Date(sourceDate);
  console.log(
    `[${req.requestId}] - DEBUG Source date begin: ${sourceDateBegin}`
  );
  const sourceDateEnd = new Date(sourceDate).setHours(23, 59, 59, 999);
  console.log(`[${req.requestId}] - DEBUG Source date end: ${sourceDateEnd}`);
  try {
    shifts = await shiftService.findShiftsByRange(
      sourceDateBegin,
      sourceDateEnd
    );
    console.log(
      `[${req.requestId}] - Found shifts for sourceDate: ${JSON.stringify(
        shifts
      )}`
    );
  } catch (err) {
    console.error(`[${req.requestId}] - Error finding shifts: ${err.message}`);
    return res
      .status(500)
      .json({ message: `caught error when finding shifts: ${err.message}` });
  }

  const shiftsToDuplicate = shifts.filter((shift) =>
    users.includes(shift.userId)
  );
  console.log(
    `[${req.requestId}] - Shifts to duplicate: ${JSON.stringify(
      shiftsToDuplicate
    )}`
  );

  const targetDateObj = new Date(targetDate);
  const targetDayNum = targetDateObj.getDate();
  const targetMonthNum = targetDateObj.getMonth();
  const targetYearNum = targetDateObj.getFullYear();

  console.log(`[${req.requestId}] - DEBUG Target date number: ${targetDayNum}`);

  const duplicatedShifts = shiftsToDuplicate.map((shift) => {
    const newShift = { ...shift.toObject() };

    const shiftStartTime = new Date(shift.startTime);
    const shiftEndTime = new Date(shift.endTime);

    const startTimeNewDate = new Date(
      targetYearNum,
      targetMonthNum,
      targetDayNum,
      shiftStartTime.getHours(),
      shiftStartTime.getMinutes()
    );
    const endTimeNewDate = new Date(
      targetYearNum,
      targetMonthNum,
      targetDayNum,
      shiftEndTime.getHours(),
      shiftEndTime.getMinutes()
    );

    newShift.startTime = new Date(startTimeNewDate).toISOString();
    newShift.endTime = new Date(endTimeNewDate).toISOString();

    newShift.isSynced = false;
    newShift.syncedEvent = null;
    newShift.createdBy = userId;
    return newShift;
  });

  console.log(
    `[${req.requestId}] - Duplicated shifts: ${JSON.stringify(
      duplicatedShifts
    )}`
  );

  for (const shift of duplicatedShifts) {
    try {
      const addedEvent = await gCalendarService.addEventForShift(
        shift.userId,
        shift,
        req.requestId
      );
      if (addedEvent) {
        shift.isSynced = true;
        shift.syncedEvent = addedEvent;
        console.log(
          `[${
            req.requestId
          }] - Shift synced with Google Calendar: ${JSON.stringify(addedEvent)}`
        );
      }
    } catch (err) {
      console.error(
        `[${req.requestId}] - Error adding duplicated shift to Google Calendar: ${err.message}`
      );
      shift.isSynced = false;
    }

    try {
      const addedShift = await shiftService.createShift(shift);
      console.log(
        `[${req.requestId}] - Shift created: ${JSON.stringify(addedShift)}`
      );
    } catch (err) {
      console.error(
        `[${req.requestId}] - Error creating shift: ${err.message}`
      );

      if (shift.isSynced) {
        try {
          const user = await userService.findUser_cl(shift.userId);
          await gCalendarService.deleteEvents_cl(
            user,
            [shift.syncedEvent],
            req.requestId
          );
          shift.isSynced = false;
          console.log(
            `[${req.requestId}] - Deleted event from Google Calendar after failing to create shift`
          );
        } catch (e) {
          console.log(
            `[${req.requestId}] - Error deleting event from Google Calendar: ${e.message}`
          );
        }
      }

      return res
        .status(500)
        .json({ message: `Caught error when creating shift: ${err.message}` });
    }
  }
  res.status(201).json({ message: "Shifts duplicated" });
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
