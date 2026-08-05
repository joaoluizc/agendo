import SlingService from "../services/slingService.js";

const todayISO = (date) => {
  // Get today's date
  const today = new Date(date);
  today.setHours(0, 0, 0, 0); // Set the time to midnight (00:00:00.000)

  // Convert to ISO string
  const startOfDayISO = today.toISOString();

  // Create a Date object for 24 hours later
  const endOfDay = new Date(today);
  endOfDay.setHours(24, 0, 0, 0); // Set the time to 24 hours later (midnight next day)

  // Convert to ISO string
  const endOfDayISO = endOfDay.toISOString();

  return `${startOfDayISO}/${endOfDayISO}`;
};

const shiftToEvent = (shift, colorId) => {
  const event = {
    summary: shift.position.name,
    description: `event created by agendo on ${new Date().toString()}`,
    start: {
      dateTime: shift.dtstart,
      timeZone: "Brazil/East",
    },
    end: {
      dateTime: shift.dtend,
      timeZone: "Brazil/East",
    },
  };
  // Google Calendar colorId ("1".."11"); omit entirely when no color is chosen.
  if (colorId) event.colorId = colorId;
  return event;
};

const getSlingIdByEmail = async (email) => {
  const slingService = new SlingService();
  // Only the users endpoint is needed here — it authenticates off SLING_AUTHORIZATION
  // on its own, so there's no reason to pay for a full init() (session + positions).
  const slingUsers = await slingService.getAllUsers();

  if (!slingUsers) {
    console.error(
      "Sling users not found. Please check if SlingService is initialized correctly.",
    );
    return undefined;
  }

  // getAllUsers() returns an object keyed by sling user id, not an array.
  const user = Object.values(slingUsers).find((user) => user.email === email);
  return user ? String(user.id) : undefined;
};

export default {
  todayISO,
  shiftToEvent,
  getSlingIdByEmail,
};
