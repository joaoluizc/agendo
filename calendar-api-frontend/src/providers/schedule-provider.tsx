import { CalendarUser } from "@/types/gCalendarTypes";
import { SortedCalendar } from "@/types/shiftTypes";
import { createContext, useState } from "react";

type ScheduleProviderProps = {
  children: React.ReactNode;
};

type ScheduleProviderState = {
  shifts: SortedCalendar;
  events: CalendarUser[];
  scheduleIsLoading: boolean;
  setShifts: (value: SortedCalendar) => void;
  setEvents: (value: CalendarUser[]) => void;
  setScheduleIsLoading: (value: boolean) => void;
};

export const ScheduleContext = createContext<ScheduleProviderState | undefined>(
  undefined
);

export function ScheduleProvider({ children }: ScheduleProviderProps) {
  const [shifts, setShifts] = useState<SortedCalendar>({});
  const [events, setEvents] = useState<CalendarUser[]>([]);
  const [scheduleIsLoading, setScheduleIsLoading] = useState(false);

  return (
    <ScheduleContext.Provider
      value={{
        shifts,
        setShifts,
        events,
        setEvents,
        scheduleIsLoading,
        setScheduleIsLoading,
      }}
    >
      {children}
    </ScheduleContext.Provider>
  );
}
