import { CalendarUser } from "@/types/gCalendarTypes";
import { Shift, ShiftInDrag, SortedCalendar } from "@/types/shiftTypes";
import { createContext, useState } from "react";

type ScheduleProviderProps = {
  children: React.ReactNode;
};

type ScheduleProviderState = {
  shifts: SortedCalendar;
  events: CalendarUser[];
  scheduleIsLoading: boolean;
  shiftInDrag: ShiftInDrag;
  isBulkSelectorActive: boolean;
  bulkSelectedShifts: Shift[];
  setShifts: (value: SortedCalendar) => void;
  setEvents: (value: CalendarUser[]) => void;
  setScheduleIsLoading: (value: boolean) => void;
  setShiftInDrag: (value: ShiftInDrag) => void;
  setIsBulkSelectorActive: (value: boolean) => void;
  setBulkSelectedShifts: (value: Shift[]) => void;
};

export const ScheduleContext = createContext<ScheduleProviderState | undefined>(
  undefined
);

export function ScheduleProvider({ children }: ScheduleProviderProps) {
  const [shifts, setShifts] = useState<SortedCalendar>({});
  const [events, setEvents] = useState<CalendarUser[]>([]);
  const [scheduleIsLoading, setScheduleIsLoading] = useState(false);
  const [isBulkSelectorActive, setIsBulkSelectorActive] = useState(false);
  const [bulkSelectedShifts, setBulkSelectedShifts] = useState<Shift[]>([]);
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
        isBulkSelectorActive,
        setIsBulkSelectorActive,
        bulkSelectedShifts,
        setBulkSelectedShifts,
      }}
    >
      {children}
    </ScheduleContext.Provider>
  );
}
