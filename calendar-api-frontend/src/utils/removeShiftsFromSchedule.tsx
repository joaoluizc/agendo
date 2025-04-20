import { CalendarUser } from "@/types/gCalendarTypes";
import { Shift, SortedCalendar } from "@/types/shiftTypes";

function removeShiftFromSchedule(
  shiftsToRemove: Shift[],
  shifts: SortedCalendar,
  events: CalendarUser[],
  setShifts: (value: SortedCalendar) => void,
  setEvents: (events: CalendarUser[]) => void
): any {
  const updatedSchedule = { ...shifts };
  let updatedEvents = [...events];

  for (const shift of shiftsToRemove) {
    const userId = shift.userId;

    updatedSchedule[userId] = updatedSchedule[userId].filter(
      (s) => s._id !== shift._id
    );

    if (shift.isSynced) {
      const userEvents = events.find(
        (calendarUser) => calendarUser.userId === userId
      )?.events;
      if (userEvents) {
        const updatedUserEvents = userEvents.filter(
          (s) => s.id !== shift.syncedEvent.id
        );
        updatedEvents = events.map((calendarUser) =>
          calendarUser.userId === userId
            ? { ...calendarUser, events: updatedUserEvents }
            : calendarUser
        );
      }
    }
  }

  setEvents(updatedEvents);
  setShifts(updatedSchedule);
}

export default removeShiftFromSchedule;
