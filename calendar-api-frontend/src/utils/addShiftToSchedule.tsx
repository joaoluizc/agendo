// utils/addShiftToSchedule.ts
import { CalendarUser } from "@/types/gCalendarTypes";
import { Shift, SortedCalendar } from "@/types/shiftTypes";

export function addShiftToSchedule(
  newShift: Shift,
  shifts: SortedCalendar,
  events: CalendarUser[],
  setShifts: (value: SortedCalendar) => void,
  setEvents: (events: CalendarUser[]) => void
) {
  const userId = newShift.userId;

  if (!shifts[userId]) {
    shifts[userId] = [];
  }

  shifts[userId].push(newShift);

  shifts[userId].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  setShifts({ ...shifts });

  if (newShift.isSynced) {
    const userEvents = events.find((event) => event.userId === userId)?.events;
    if (userEvents) {
      userEvents.push(newShift.syncedEvent);
      userEvents.sort((a, b) => {
        return (
          new Date(a.start.dateTime).getTime() -
          new Date(b.start.dateTime).getTime()
        );
      });
    }
    setEvents([...events]);
  }
}
