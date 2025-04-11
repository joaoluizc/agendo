import { CalendarUser } from "@/types/gCalendarTypes";
import { ShiftInDrag, SortedCalendar } from "@/types/shiftTypes";
import { createContext, useState } from "react";

type ScheduleProviderProps = {
  children: React.ReactNode;
};

type ScheduleProviderState = {
  shifts: SortedCalendar;
  events: CalendarUser[];
  scheduleIsLoading: boolean;
  shiftInDrag: ShiftInDrag;
  setShifts: (value: SortedCalendar) => void;
  setEvents: (value: CalendarUser[]) => void;
  setScheduleIsLoading: (value: boolean) => void;
  setShiftInDrag: (value: ShiftInDrag) => void;
};

export const ScheduleContext = createContext<ScheduleProviderState | undefined>(
  undefined
);

export function ScheduleProvider({ children }: ScheduleProviderProps) {
  const [shifts, setShifts] = useState<SortedCalendar>({});
  const [events, setEvents] = useState<CalendarUser[]>([]);
  const [scheduleIsLoading, setScheduleIsLoading] = useState(false);
  const [shiftInDrag, setShiftInDrag] = useState<ShiftInDrag>({
    isBeingDragged: false,
    data: null,
  });

  return (
    <ScheduleContext.Provider
      value={{
        shifts,
        setShifts,
        events,
        setEvents,
        scheduleIsLoading,
        setScheduleIsLoading,
        shiftInDrag,
        setShiftInDrag,
      }}
    >
      {children}
    </ScheduleContext.Provider>
  );
}
