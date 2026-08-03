// utils/addShiftToSchedule.ts
import { CalendarUser } from "@/types/gCalendarTypes";
import { Shift, SortedCalendar } from "@/types/shiftTypes";

const byStartTime = (a: Shift, b: Shift) =>
  new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

/**
 * Splice a newly created shift into the schedule without refetching the day.
 *
 * Every level is replaced rather than mutated. This used to `push` onto
 * `shifts[userId]` and only spread the outer object, so the agent's own array kept
 * its identity — the schedule grid memoises each agent's lane packing on that array,
 * and a second shift for the same agent would not appear until a reload (the first
 * one did, because a missing key allocated a fresh array).
 */
export function addShiftToSchedule(
  newShift: Shift,
  shifts: SortedCalendar,
  events: CalendarUser[],
  setShifts: (value: SortedCalendar) => void,
  setEvents: (events: CalendarUser[]) => void
) {
  const userId = newShift.userId;

  setShifts({
    ...shifts,
    [userId]: [...(shifts[userId] ?? []), newShift].sort(byStartTime),
  });

  if (newShift.isSynced) {
    setEvents(
      events.map((calendarUser) =>
        calendarUser.userId === userId
          ? {
              ...calendarUser,
              events: [...calendarUser.events, newShift.syncedEvent].sort(
                (a, b) =>
                  new Date(a.start.dateTime).getTime() -
                  new Date(b.start.dateTime).getTime()
              ),
            }
          : calendarUser
      )
    );
  }
}
