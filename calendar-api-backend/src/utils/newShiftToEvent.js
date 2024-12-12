import positionService from "../services/positionService.js";

export async function newShiftToEvent(shift) {
  const positionName = await positionService.getPositionById(shift.positionId);
  console.log("positionName: ", JSON.stringify(positionName));

  const event = {
    summary: positionName.name,
    // description: 'optional',
    start: {
      dateTime: shift.startTime,
      timeZone: "GMT",
    },
    end: {
      dateTime: shift.endTime,
      timeZone: "GMT",
    },
  };
  return event;
}
