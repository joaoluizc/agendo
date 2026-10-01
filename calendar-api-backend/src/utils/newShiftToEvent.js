import positionService from "../services/positionService.js";
import utils from "./utils.js";

/**
 * @param {object} [position] The shift's position doc, when the caller already has it —
 *   the bulk publish path loads every position once rather than once per shift.
 */
export async function newShiftToEvent(shift, colorId, position = null) {
  const positionName =
    position ?? (await positionService.getPositionById(shift.positionId));
  console.log("positionName: ", JSON.stringify(positionName));

  const event = {
    summary: positionName.name,
    // The same text the Sling path writes. This was a commented-out placeholder, so agendo's
    // own events were the only ones with no "created by agendo" line.
    description: utils.eventDescription(),
    start: {
      dateTime: shift.startTime,
      timeZone: "GMT",
    },
    end: {
      dateTime: shift.endTime,
      timeZone: "GMT",
    },
  };
  // Google Calendar colorId ("1".."11"); omit entirely when no color is chosen.
  if (colorId) event.colorId = colorId;
  return event;
}
