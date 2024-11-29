import Shift from "../models/ShiftModel.js";

async function createShift(shiftDetails) {
  const { startTime, endTime, userId, positionId, createdBy } = shiftDetails;

  const shift = new Shift({
    startTime,
    endTime,
    userId,
    positionId,
    createdBy,
  });

  await shift.save();

  return shift;
}

async function getShift(shiftId) {
  const shift = await Shift.findById(shiftId);
  return shift;
}

async function deleteShift(shiftId) {
  const shift = await Shift.findByIdAndDelete(shiftId);
  return shift;
}

async function updateShift(shiftId, shiftDetails) {
  const shift = await Shift.findById(shiftId);

  console.log(`shiftId: ${shiftId}`);
  console.log(`shiftDetails: ${shiftDetails}`);

  const { startTime, endTime, userId, positionId } = shiftDetails;
  shift.startTime = startTime;
  shift.endTime = endTime;
  shift.userId = userId;
  shift.positionId = positionId;

  await shift.save();

  return shift;
}

async function findShiftsByRange(startDateTime, endDateTime) {
  const shifts = await Shift.find({
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

export default {
  createShift,
  getShift,
  deleteShift,
  updateShift,
  findShiftsByRange,
};
