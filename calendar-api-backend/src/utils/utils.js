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

const shiftToEvent = (shift) => {
  const event = {
    summary: shift.position.name,
    // description: 'optional',
    start: {
      dateTime: shift.dtstart,
      timeZone: "Brazil/East",
    },
    end: {
      dateTime: shift.dtend,
      timeZone: "Brazil/East",
    },
  };
  return event;
};

const getSlingIdByEmail = async (email) => {
  const slingService = new SlingService();
  await slingService.init();
  const slingUsers = slingService.users;

  if (!slingUsers) {
    console.error(
      "Sling users not found. Please check if SlingService is initialized correctly."
    );
    return undefined;
  }

  const user = slingUsers.find((user) => user.email === email);
  return user ? user.slingId : undefined;
};

export default {
  todayISO,
  shiftToEvent,
  getSlingIdByEmail,
};
