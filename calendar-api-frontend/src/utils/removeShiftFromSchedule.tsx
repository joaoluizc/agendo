import { CalendarUser } from "@/types/gCalendarTypes";
import { Shift, SortedCalendar } from "@/types/shiftTypes";

function removeShiftFromSchedule(
  shift: Shift,
  shifts: SortedCalendar,
  events: CalendarUser[],
  setShifts: (value: SortedCalendar) => void,
  setEvents: (events: CalendarUser[]) => void
): any {
  const userId = shift.userId;
  const updatedSchedule = { ...shifts };

  updatedSchedule[userId] = updatedSchedule[userId].filter(
    (s) => s._id !== shift._id
  );

  setShifts(updatedSchedule);

  if (shift.isSynced) {
    const userEvents = events.find(
      (calendarUser) => calendarUser.userId === userId
    )?.events;
    if (userEvents) {
      const updatedEvents = userEvents.filter(
        (s) => s.id !== shift.syncedEvent.id
      );
      const updatedUserEvents = events.map((calendarUser) =>
        calendarUser.userId === userId
          ? { ...calendarUser, events: updatedEvents }
          : calendarUser
      );
      setEvents(updatedUserEvents);
    }
  }
}

export default removeShiftFromSchedule;
