import utils from '../../utils/utils.ts';
import { Shift, User } from '../../types/slingTypes.ts';
import { CalendarUser } from '@/types/gCalendarTypes.ts';
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

/** Sort shifts for each user by start time
 * @param {User[]} data - array of users with shifts
 * @param {string} selectedDate - date selected by the user
 * @returns {User[]} - array of users with sorted shifts
 * shifts are sorted by user and then by start time
*/
function sortShifts(data: User[], selectedDate: string): User[] {
  return data.map((user: User) => ({
    ...user,
    shifts: user.shifts.sort(
      (a: Shift, b: Shift) => new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime()
    ).map((shift: Shift) => ({ ...shift, dateRequested: selectedDate })),
  })).sort((a: User, b: User) => new Date(a.shifts[0].dtstart).getTime() - new Date(b.shifts[0].dtstart).getTime());
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
  const selectedDate = utils.getLocalTimeframeISO(date);
  console.log(`start shift fetch for ${date.toLocaleTimeString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
  console.log(selectedDate);
  const endpoint = `/api/sling/calendar?date=${selectedDate}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    credentials: 'include',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch shifts' + response.statusText);
  }
  const data: User[] = await response.json();
  const sortedData = sortShifts(data, selectedDate);

  console.log('successfully fetched shifts');
  setSortedCalendar(sortedData);
  setIsLoading(false);
  console.log(sortedData);
  return sortedData;
}

/** Fetches Google Calendar events for a given date and sets the state
 * @param {Function} setgCalendarEvents - function to set the state with Google Calendar events
 * @param {Date} date - date selected by the user
 * @returns {Promise<CalendarUser[]>}
*/
export const getGCalendarEvents = async (setgCalendarEvents: (gCalendarEvents: CalendarUser[]) => void, date: Date): Promise<CalendarUser[]> => {
  const selectedDate = utils.getLocalTimeframeISO(date)
  const response = await fetch(`api/gcalendar/all-events?date=${selectedDate}`);
  
  const data: GetCalEventsResponse = await response.json();

  if (response.status === 204 && 'message' in data) {
    setgCalendarEvents([]);
    toast.error(data.message);

    data.errors.forEach((user) => {
      toast.error(`Failed to fetch calendar events for ${user.firstName}`, {
      description: user.error,
      });
    });
    return [];
  }

  if (response.status === 500 && 'error' in data) {
    setgCalendarEvents([]);
    toast.error(data.error);
    return [];
  }

  let filteredData: CalendarUser[] = [];
  if (response.status === 200 && 'events' in data) {
    // Filter out events that are not of type 'default' and do not match the selected date
    if(data.events.length !== 0) {
      filteredData = data.events.map((user: CalendarUser) => {
        const filteredEvents = user.events.filter((event) => {
          const eventDate = new Date(event.start.dateTime).getDate();
          const selectedDate = date.getDate();
          return event.eventType !== "birthday" && event.eventType !== "workingLocation" && eventDate === selectedDate;
        });

        return {
          ...user,
          events: filteredEvents,
        };
      });
    }

    data?.errors.forEach((user) => {
      toast.error(`Failed to fetch calendar events for ${user.firstName}`, {
      description: user.error,
      });
    });

    setgCalendarEvents(filteredData);
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
  let timeString = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (timeString.endsWith(":00 AM") || timeString.endsWith(":00 PM")) {
    timeString = timeString.replace(":00", "");
  }

  return timeString;
}

export const prettyTimeRange = (startRaw: string, endRaw: string) => {
  const start = prettyHour(startRaw);
  const end = prettyHour(endRaw);
  if (start.slice(-2) === end.slice(-2)) {
    return `${start.slice(0, -3)}-${end.slice(0, -3)} ${end.slice(-2)}`;
  }
  return `${start} - ${end}`;
}

export const calculateGridColumnStart = (start: string, dateToRender: string) => {
  const startAsDate = new Date(start);
  const dateToRenderAsDate = new Date(dateToRender!.split('/')[1]);
  if (startAsDate.getDate() < dateToRenderAsDate.getDate()) return 0; // Shift starts on previous day
  const startHour = startAsDate.getHours();
  const startMinutes = startAsDate.getMinutes();
  return startHour * 2 + Math.floor(startMinutes / 30) + 1; // Assuming each column represents 30 minutes
};

export const calculateGridColumnSpan = (start: string, end: string, dateToRender: string) => {
  const startAsDate = new Date(start);
  const endAdDate = new Date(end);
  const dateRenderedAsDate = new Date(dateToRender!.split('/')[1]);
  if (startAsDate.getDate() < dateRenderedAsDate.getDate()) return endAdDate.getHours() * 2;
  const durationInMinutes = (endAdDate.getTime() - startAsDate.getTime()) / (1000 * 60);
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
  const firstPart = startAsDate.toLocaleDateString('en-us', { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  const secondPart = endAsDate.toLocaleTimeString('en-us', { hour: "numeric", minute: "2-digit" })
  return `${firstPart} to ${secondPart}`;
}