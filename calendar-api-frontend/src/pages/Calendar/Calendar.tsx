import { CalendarUser, initialCalendarUser } from "@/types/gCalendarTypes.ts";
import { useState } from "react";

const Calendar = () => {
  const [calendars, setCalendars] =
    useState<CalendarUser[]>(initialCalendarUser);

  const fetchEvents = async () => {
    const response = await fetch("api/gcalendar/all-events");
    let data = await response.json();
    data = data.map((user: CalendarUser) => {
      return {
        ...user,
        events: user.events.filter((event) => event.eventType === "default"),
      };
    });
    console.log(data);
    setCalendars(data);
  };

  return (
    <div>
      <button onClick={fetchEvents}>Fetch calendar</button>
      {calendars &&
        calendars.map((calendar, index) => (
          <div key={index} id={String(index)} className="pb-5">
            <h2>{calendar.email}</h2>
            <ul>
              {calendar.events.map((event, index) => (
                <li key={index}>
                  <h3>{event.summary}</h3>
                  <p>{event.start.dateTime}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
};

export default Calendar;
