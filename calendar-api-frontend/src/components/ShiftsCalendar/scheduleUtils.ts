import utils from '../../utils/utils';
import { Shift, User } from '../../types/slingTypes';
import { CalendarUser } from '@/types/gCalendarTypes';


export const getShifts = async (
  date: Date,
  setIsLoading: (isLoading: boolean) => void,
  setSortedCalendar: (data: User[]) => void
): Promise<void> => {
  setIsLoading(true);
  console.log('start shift fetch');
  const selectedDate = utils.todayISO(date);
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
  let data: User[] = await response.json();
  // Sort shifts for each user by start time
  data = data.map((user: User) => ({
    ...user,
    shifts: user.shifts.sort(
      (a: Shift, b: Shift) => new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime()
    ).map((shift: Shift) => ({ ...shift, dateRequested: selectedDate })),
  })).sort((a: User, b: User) => new Date(a.shifts[0].dtstart).getTime() - new Date(b.shifts[0].dtstart).getTime());
  setSortedCalendar(data);
  setIsLoading(false);
  console.log(data);
}

export const getGCalendarEvents = async (setgCalendarEvents: (gCalendarEvents: CalendarUser[]) => void, date: Date) => {
  const response = await fetch("api/gcalendar/all-events");
  let data = await response.json();
  data = data
      .map((user: CalendarUser) => {
          return {
              ...user,
              events: user.events.filter((event: any) => event.eventType === "default")
                .filter((event: any) => {
                  return new Date(event.start.dateTime).getDate() === date.getDate()
                })
          }
      });
  console.log(data);
  setgCalendarEvents(data);
};

const formatDatePretty = (date: string) => {
  const dateObj = new Date(date);
  let timeString = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (timeString.endsWith(":00 AM") || timeString.endsWith(":00 PM")) {
    timeString = timeString.replace(":00", "");
  }

  return timeString;
}

export const startEndPretty = (startRaw: string, endRaw: string) => {
  const start = formatDatePretty(startRaw);
  const end = formatDatePretty(endRaw);
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

export const formatGCalTimePretty = (start: string, end: string) => {
  const startAsDate = new Date(start);
  const endAsDate = new Date(end);
  const firstPart = startAsDate.toLocaleDateString('en-us', { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})
  const secondPart = endAsDate.toLocaleTimeString('en-us', { hour:"numeric", minute:"2-digit"})
  return `${firstPart} to ${secondPart}`;
}