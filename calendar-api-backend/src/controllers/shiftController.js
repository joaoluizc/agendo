import { validateObjFields } from "../utils/validateObjFields.js";
import shiftService from "../services/shiftService.js";
import { sortByDate, groupByDay, groupByUsers } from "../utils/sortShifts.js";

function validateShift(shift, type = "create") {
  const requiredFields = [
    "startTime",
    "endTime",
    "userId",
    "positionId",
    "createdBy",
  ];

  if (type === "update") {
    requiredFields.pop();
  }

  const shiftFieldsExist = validateObjFields(shift, requiredFields);

  shiftFieldsExist.startTime = new Date(shiftFieldsExist.startTime);
  shiftFieldsExist.endTime = new Date(shiftFieldsExist.endTime);

  if (shiftFieldsExist.startTime > shiftFieldsExist.endTime) {
    throw new Error("startTime cannot be after endTime");
  }

  return shiftFieldsExist;
}

async function createShift(req, res) {
  let shift;
  try {
    shift = validateShift(req.body);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  try {
    await shiftService.createShift(shift);
    res.status(201).json({ message: "Shift created" });
  } catch (err) {
    console.error(err.message);
    res
      .status(500)
      .json({ message: `caught error when creating shift: ${err.message}` });
  }

  return shift;
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

async function updateShift(req, res) {
  const { shiftId } = req.query;

  let shift;
  try {
    shift = validateShift(req.body, "update");
    console.log(
      `updating shift. shift after validation: ${JSON.stringify(shift)}`
    );
  } catch (err) {
    return res.status(400).json({ message: err.message });
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

  if (!shift) {
    return res.status(404).json({ message: "Shift not found" });
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
  updateShift,
  deleteShift,
  getShift,
};
