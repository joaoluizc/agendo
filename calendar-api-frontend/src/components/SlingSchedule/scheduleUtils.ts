import utils from "../../utils/utils.ts";
import { Shift, User } from "../../types/slingTypes.ts";
import {
  CalendarUser,
  FetchedCalendarUser,
  GCalendarEvent,
  GCalendarEventList,
} from "@/types/gCalendarTypes.ts";
import { toast } from "sonner";

/** Midnight that opens the given local calendar day. */
const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Hours to reach back before local midnight when querying Sling.
 * Sling filters by shift start, so a shift that began the previous evening and
 * runs past midnight is only returned if the window opens before it started.
 * A night shift is comfortably under 12h.
 */
const LOOKBACK_HOURS = 12;

/** The `start/end` range to ask Sling for, plus the local day being rendered.
 * The window deliberately overshoots backwards so evening shifts that spill
 * into the rendered day come back; `sortShifts` then trims to the day itself.
 *
 * This replaces `getLocalTimeframeISOld`, which offset the window by the
 * viewer's UTC offset: in BRT (UTC-3) that happened to look back 3h — which is
 * the only reason cross-midnight shifts ever appeared — but in UTC+ zones it
 * looked *forward* past midnight, dropping those shifts entirely and pulling in
 * part of the next day instead. A fixed lookback behaves the same everywhere.
 */
const shiftQueryWindow = (date: Date) => {
  const dayStart = startOfLocalDay(date);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const from = new Date(dayStart);
  from.setHours(from.getHours() - LOOKBACK_HOURS);

  return {
    param: `${from.toISOString()}/${dayEnd.toISOString()}`,
    dayStart,
    dayEnd,
  };
};

/** Whether a shift actually occupies time inside the rendered day.
 * Boundary-touching shifts are excluded: one ending exactly at `dayStart`
 * belongs wholly to the previous day. Letting those through is what produced
 * zero-duration bars — they emitted an invalid `span 0`, collapsed to a ~9px
 * sliver at column 1, and displaced the row's real shifts onto a second grid
 * row (the "broken rows").
 */
const overlapsDay = (shift: Shift, dayStart: Date, dayEnd: Date) =>
  new Date(shift.dtend) > dayStart && new Date(shift.dtstart) < dayEnd;

/** Trim each user's shifts to the rendered day, then sort by start time.
 * @param {User[]} data - array of users with shifts
 * @param {Date} dayStart - midnight opening the rendered day
 * @param {Date} dayEnd - midnight closing the rendered day
 * @returns {User[]} - users with in-day shifts, sorted by their first shift
 * Users left with no shifts are dropped — the sort below reads `shifts[0]`.
 */
function sortShifts(data: User[], dayStart: Date, dayEnd: Date): User[] {
  return data
    .map((user: User) => ({
      ...user,
      shifts: user.shifts
        .filter((shift: Shift) => overlapsDay(shift, dayStart, dayEnd))
        .sort(
          (a: Shift, b: Shift) =>
            new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime()
        ),
    }))
    .filter((user: User) => user.shifts.length > 0)
    .sort(
      (a: User, b: User) =>
        new Date(a.shifts[0].dtstart).getTime() -
        new Date(b.shifts[0].dtstart).getTime()
    );
}

/** Fetches shifts for a given date and sets the state
 * @param {Date} date - date selected by the user
 * @param {Function} setIsLoading - function to set loading state
 * @param {Function} setSortedCalendar - function to set the state with sorted shifts
 * @returns {Promise<User[]>}
 */
export const getShifts = async (
  date: Date,
  setIsLoading: (isLoading: boolean) => void,
  setSortedCalendar: (data: User[]) => void
): Promise<User[]> => {
  setIsLoading(true);
  const { param, dayStart, dayEnd } = shiftQueryWindow(date);
  const endpoint = `/api/sling/calendar?date=${param}`;
  const response = await fetch(endpoint, {
    method: "GET",
    credentials: "include",
    mode: "cors",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch shifts" + response.statusText);
  }
  const data: User[] = await response.json();
  const sortedData = sortShifts(data, dayStart, dayEnd);

  setSortedCalendar(sortedData);
  setIsLoading(false);
  return sortedData;
};

// /** Fetches Google Calendar events for a given date and sets the state
//  * @param {Function} setgCalendarEvents - function to set the state with Google Calendar events
//  * @param {Date} date - date selected by the user
//  * @returns {Promise<CalendarUser[]>}
// */
// export const getGCalendarEvents = async (setgCalendarEvents: (gCalendarEvents: CalendarUser[]) => void, date: Date): Promise<CalendarUser[]> => {
//   const selectedDate = utils.getLocalTimeframeISO(date).todayISO;
//   const response = await fetch(`/api/gcalendar/all-events?date=${selectedDate}`);
//   if (response.status === 204) {
//     setgCalendarEvents([]);
//     return [];
//   }
//   let data = await response.json();

//   // Filter out events that are not of type 'default' and do not match the selected date
//   data = data.map((user: CalendarUser) => {
//     const filteredEvents = user.events.filter((event) => {
//       const eventDate = new Date(event.start.dateTime).getDate();
//       const selectedDate = date.getDate();
//       return event.eventType === "default" && eventDate === selectedDate;
//     });

//     return {
//       ...user,
//       events: filteredEvents,
//     };
//   });
//   setgCalendarEvents(data);
//   return data;
// };

type GetCalEventsSuccessResponse = {
  events: CalendarUser[];
  errors: {
    userId: string;
    firstName: string;
    lastName: string;
    error: string;
  }[];
};

type GetCalEventsEmptyResponse = {
  message: string;
  errors: {
    userId: string;
    firstName: string;
    lastName: string;
    error: string;
  }[];
};

type GetCalEventsErrorResponse = {
  error: string;
};

type GetCalEventsResponse =
  | GetCalEventsSuccessResponse
  | GetCalEventsErrorResponse
  | GetCalEventsEmptyResponse;

export const getGCalendarEvents = async (
  date: Date
): Promise<CalendarUser[]> => {
  const { todayISO: selectedDate } = utils.getLocalTimeframeISO(date);
  const response = await fetch(
    `/api/gcalendar/all-events?date=${selectedDate}`
  );

  const data: GetCalEventsResponse = await response.json();

  if (response.status === 204 && "message" in data) {
    toast.error(data.message);

    data.errors.forEach((user) => {
      toast.error(`Failed to fetch calendar events for ${user.firstName}`, {
        description: user.error,
      });
    });
    return [];
  }

  if (response.status === 500 && "error" in data) {
    toast.error(data.error);
    return [];
  }

  let filteredData: CalendarUser[] = [];
  if (response.status === 200 && "events" in data) {
    // Filter out events that are not of type 'default' and do not match the selected date
    if (data.events.length !== 0) {
      filteredData = data.events.map((user: FetchedCalendarUser) => {
        const filteredEvents = user.events.filter((event) => {
          const eventDate = new Date(event.start.dateTime).getDate();
          const selectedDate = date.getDate();
          return (
            event.eventType !== "birthday" &&
            event.eventType !== "workingLocation" &&
            eventDate === selectedDate
          );
        });

        const { numberOfEventOverlaps, eventsOrganized } =
          calculateOverlaps(filteredEvents);

        return {
          ...user,
          numberOfEventOverlaps,
          events: eventsOrganized,
        };
      });
    }

    data?.errors.forEach((user) => {
      toast.error(`Failed to fetch calendar events for ${user.firstName}`, {
        description: user.error,
      });
    });

    return filteredData;
  }

  return filteredData;
};

/**
 * Formats Date as 'pretty' string, removing minutes for round hours
 * @param {string} date - date to format
 * @returns {string} - formatted date
 * examples:
 * date: 2021-09-30T10:00:00Z -> 10 AM
 * date: 2021-09-30T10:30:00Z -> 10:30 AM
 */
const prettyHour = (date: string): string => {
  const dateObj = new Date(date);
  let timeString = dateObj.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (timeString.endsWith(":00 AM") || timeString.endsWith(":00 PM")) {
    timeString = timeString.replace(":00", "");
  }

  return timeString;
};

export const prettyTimeRange = (startRaw: string, endRaw: string) => {
  const start = prettyHour(startRaw);
  const end = prettyHour(endRaw);
  if (start.slice(-2) === end.slice(-2)) {
    return `${start.slice(0, -3)}-${end.slice(0, -3)} ${end.slice(-2)}`;
  }
  return `${start} - ${end}`;
};

/** Local midnight of the day being rendered.
 * `dateToRender` is the selected day's local calendar date as `YYYY-MM-DD`
 * (`dateKey`). We build local midnight from its parts rather than parsing it as
 * an instant: the timeframe strings elsewhere encode local midnight *relabeled*
 * as `Z`, so `new Date(...)` would land `timezoneOffset` hours off (e.g. a
 * UTC-3 browser reads "2026-07-01T00:00:00Z" as Jun 30 21:00 local). Comparing
 * local calendar days this way is correct across timezones and month/year
 * boundaries — e.g. a Jun 30 shift rendered on Jul 1.
 * `slice(0, 10)` tolerates a full ISO/range string being passed by mistake.
 */
const startOfRenderedDay = (dateToRender: string) => {
  const [year, month, day] = dateToRender.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const calculateGridColumnStart = (
  start: string,
  dateToRender: string
) => {
  const startAsDate = new Date(start);
  if (startAsDate < startOfRenderedDay(dateToRender)) return 1; // Shift started on a previous day → begins at midnight
  const startHour = startAsDate.getHours();
  const startMinutes = startAsDate.getMinutes();
  return startHour * 4 + Math.floor(startMinutes / 15) + 1; // Assuming each column represents 15 minutes
};

/** How many 15-minute columns the shift occupies within the rendered day.
 * Both ends are clamped to the day, so a shift crossing either midnight shows
 * only its visible portion. Clamping the end also keeps the span inside the
 * grid's 96 columns: overrunning it spawned zero-width implicit tracks, and a
 * zero-length overlap produced `span 0`, which CSS rejects — the declaration was
 * dropped and the bar fell back to `auto`, rendering as a stray sliver.
 */
export const calculateGridColumnSpan = (
  start: string,
  end: string,
  dateToRender: string
) => {
  const startAsDate = new Date(start);
  const endAdDate = new Date(end);
  const dayStart = startOfRenderedDay(dateToRender);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const effectiveStart = startAsDate < dayStart ? dayStart : startAsDate;
  const effectiveEnd = endAdDate > dayEnd ? dayEnd : endAdDate;
  const durationInMinutes =
    (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
  return Math.max(1, Math.ceil(durationInMinutes / 15)); // Assuming each column represents 15 minutes
};

/** Formats Google Calendar event start and end times as 'pretty' string
 * @param {string} start - start time of the event
 * @param {string} end - end time of the event
 * @returns {string} - formatted time range
 * examples:
 * startDate: 2021-09-30T10:00:00-04:00 -> Thu, Sep 30, 10:00 AM
 * endDate: 2021-09-30T12:00:00-04:00 -> 12:00 PM
 * result: Thu, Sep 30, 10:00 AM to 12:00 PM
 */
export const prettyGCalTime = (start: string, end: string) => {
  const startAsDate = new Date(start);
  const endAsDate = new Date(end);
  const firstPart = startAsDate.toLocaleDateString("en-us", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const secondPart = endAsDate.toLocaleTimeString("en-us", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${firstPart} to ${secondPart}`;
};

// export const calculateOverlapAmount = (events: GCalendarEventList) => {
//   // Store unique overlap pairs to avoid counting same overlap twice
//   const overlapSet = new Set<string>();

//   events.forEach((event1, i) => {
//     const start1 = new Date(event1.start.dateTime).getTime();
//     const end1 = new Date(event1.end.dateTime).getTime();

//     const event2 = events[i + 1];
//     if (event2) {
//       const start2 = new Date(event2.start.dateTime).getTime();
//       const end2 = new Date(event2.end.dateTime).getTime();

//       if (start1 < end2 && start2 < end1) {
//         // Create unique identifier for this overlap pair
//         const overlapId = [event1.id, event2.id].sort().join('-');
//         overlapSet.add(overlapId);
//       }
//     }
//   });

//   // Return total number of unique overlaps
//   return overlapSet.size + 1;
// };

export const calculateOverlaps = (events: GCalendarEventList) => {
  // Store unique overlap pairs to avoid counting same overlap twice
  const eventRows: GCalendarEvent[][] = [];

  const eventsWithGridNo = events.map((event, i) => {
    const currEvent = { ...event };

    if (i === 0) {
      currEvent.gridRowNumber = 1;
      eventRows[0] = [currEvent];
      return currEvent;
    }

    const startCurr = new Date(currEvent.start.dateTime).getTime();
    const endCurr = new Date(currEvent.end.dateTime).getTime();

    eventRows.every((row, j) => {
      const lastEvent = row[row.length - 1];
      const startLast = new Date(lastEvent.start.dateTime).getTime();
      const endLast = new Date(lastEvent.end.dateTime).getTime();

      if (startLast < endCurr && startCurr < endLast) {
        if (eventRows[j + 1]) return true;
        currEvent.gridRowNumber = j + 2;
        eventRows[j + 1] = [currEvent];
        return false;
      }

      currEvent.gridRowNumber = j + 1;
      eventRows[j].push(currEvent);
      return false;
    });

    return currEvent;
  });

  // Return total number of unique overlaps
  return {
    numberOfEventOverlaps: eventRows.length,
    eventsOrganized: eventsWithGridNo,
  };
};

export const calculateShiftOverlapAmount = (shifts: Shift[]) => {
  const overlapSet = new Set<string>();

  if (shifts?.length < 2 || !shifts) {
    return 1;
  }

  shifts.forEach((shift1, i) => {
    const start1 = new Date(shift1.dtstart).getTime();
    const end1 = new Date(shift1.dtend).getTime();

    const shift2 = shifts[i + 1];
    if (shift2) {
      const start2 = new Date(shift2.dtstart).getTime();
      const end2 = new Date(shift2.dtend).getTime();

      if (start1 < end2 && start2 < end1) {
        const overlapId = [shift1.id, shift2.id].sort().join("-");
        overlapSet.add(overlapId);
      }
    }
  });

  return overlapSet.size + 1; // Add 1 for base height
};
