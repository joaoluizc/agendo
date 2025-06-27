import utils from "../../utils/utils.ts";
// import { User } from '../../types/slingTypes.ts';
import { Shift, SortedCalendar } from "../../types/shiftTypes.ts";
import {
  CalendarUser,
  FetchedCalendarUser,
  GCalendarEvent,
  GCalendarEventList,
} from "@/types/gCalendarTypes.ts";
import { toast } from "sonner";

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

/** Fetches shifts for a given date and sets the state
 * @param {Date} date - date selected by the user
 * @param {Function} setIsLoading - function to set loading state
 * @param {Function} setSortedCalendar - function to set the state with sorted shifts
 * @returns {Promise<User[]>}
 */
export const getShifts = async (date: Date): Promise<SortedCalendar> => {
  const { startOfDayISO, endOfDayISO } = utils.getLocalTimeframeISO(date);

  const endpoint = `/api/shift/range?startTime=${startOfDayISO}&endTime=${endOfDayISO}&group=user`;
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

  const data: SortedCalendar = await response.json();
  // const sortedData = sortShifts(data);

  return data;
};

/** Fetches Google Calendar events for a given date and sets the state
 * @param {Function} setgCalendarEvents - function to set the state with Google Calendar events
 * @param {Date} date - date selected by the user
 * @returns {Promise<CalendarUser[]>}
 */
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

/** Formats Date as 'pretty' string, removing minutes for round hours
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

export const calculateGridColumnStart = (
  start: string,
  dateToRender: string
) => {
  const startAsDate = new Date(start);
  const dateToRenderAsDate = new Date(dateToRender);
  console.log("calculateGridColumnStart:", {
    start,
    dateToRender,
    startAsDate,
    dateToRenderAsDate,
    startDay: startAsDate.getDate(),
    renderDay: dateToRenderAsDate.getDate(),
    startHour: startAsDate.getHours(),
    startMinutes: startAsDate.getMinutes(),
  });
  if (startAsDate.getDate() < dateToRenderAsDate.getDate()) return 0; // Shift starts on previous day
  const startHour = startAsDate.getHours();
  const startMinutes = startAsDate.getMinutes();
  const result = startHour * 2 + Math.floor(startMinutes / 30) + 1; // Assuming each column represents 30 minutes
  console.log("Grid column start result:", result);
  return result;
};

export const calculateGridColumnSpan = (
  start: string,
  end: string,
  dateToRender: string
) => {
  const startAsDate = new Date(start);
  const endAdDate = new Date(end);
  const dateRenderedAsDate = new Date(dateToRender);
  if (startAsDate.getDate() < dateRenderedAsDate.getDate())
    return endAdDate.getHours() * 2;
  const durationInMinutes =
    (endAdDate.getTime() - startAsDate.getTime()) / (1000 * 60);
  return Math.ceil(durationInMinutes / 30); // Assuming each column represents 30 minutes
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
    const start1 = new Date(shift1.startTime).getTime();
    const end1 = new Date(shift1.endTime).getTime();

    const shift2 = shifts[i + 1];
    if (shift2) {
      const start2 = new Date(shift2.startTime).getTime();
      const end2 = new Date(shift2.endTime).getTime();

      if (start1 < end2 && start2 < end1) {
        // Create unique identifier for this overlap pair
        const overlapId = [shift1._id, shift2._id].sort().join("-");
        overlapSet.add(overlapId);
      }
    }
  });

  return overlapSet.size + 1; // Add 1 for base height
};
