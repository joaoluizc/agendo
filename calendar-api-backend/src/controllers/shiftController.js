import { validateObjFields } from "../utils/validateObjFields.js";
import shiftService from "../services/shiftService.js";
import { sortByDate, groupByDay, groupByUsers } from "../utils/sortShifts.js";
import slingController from "./slingController.js";
import { mergeShiftsFromSling } from "../utils/mergeShiftsFromSling.js";
import gCalendarService from "../services/gCalendarService.js";
import userService from "../services/userService.js";

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

  let shift;
  try {
    shift = validateShift(req.body);
    shift.createdBy = userId;
  } catch (err) {
    console.error(`[${req.requestId}]`, err.message);
    return res.status(400).json({ message: err.message });
  }

  const shiftUserId = shift.userId;

  try {
    const addedEvent = await gCalendarService.addEventForShift(
      shiftUserId,
      shift,
      req.requestId
    );
    if (addedEvent) {
      shift.isSynced = true;
      shift.syncedEvent = addedEvent;
    }
  } catch (err) {
    console.error(
      `[${req.requestId}] Caught error adding created shift to google calendar: `,
      err.message
    );
    shift.isSynced = false;
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
  return res.status(201).json({ message: "Shift created but not synced" });
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

export default {
  createShift,
  findShiftsByRange,
  findShiftsByRangeWithSling,
  updateShift,
  deleteShift,
  getShift,
};