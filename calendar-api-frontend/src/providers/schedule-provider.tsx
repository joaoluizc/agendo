import { CalendarUser } from "@/types/gCalendarTypes";
import {
  PendingShiftChange,
  Shift,
  ShiftInDrag,
  SortedCalendar,
} from "@/types/shiftTypes";
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
  /**
   * A grid gesture awaiting its publish-or-draft answer.
   *
   * Lives here rather than in the component that produced it because two very different
   * places raise one — a resize handle on `Shift`, and a drop on `EmptySlot`, of which
   * there are 384 on a full roster. One prompt, rendered once by `ScheduleCalendar`.
   */
  pendingChange: PendingShiftChange | null;
  /**
   * Where a dragged shift would land: whose row, and which hour.
   *
   * Only the target is kept, not a preview shape — each `AgentRow` works out its own ghost
   * from this plus the dragged shift's duration. HTML5 drag-and-drop gives the browser's
   * translucent snapshot of the block under the cursor, which says nothing about where the
   * drop will actually go, so the row draws that itself.
   */
  dropTarget: { userId: string; hour: number } | null;
  setShifts: (value: SortedCalendar) => void;
  setEvents: (value: CalendarUser[]) => void;
  setScheduleIsLoading: (value: boolean) => void;
  setShiftInDrag: (value: ShiftInDrag) => void;
  setIsBulkSelectorActive: (value: boolean) => void;
  setBulkSelectedShifts: (value: Shift[]) => void;
  setPendingChange: (value: PendingShiftChange | null) => void;
  setDropTarget: (value: { userId: string; hour: number } | null) => void;
  /**
   * Leave bulk-select mode and drop the selection.
   *
   * Every bulk action ends here — delete, publish, unpublish — so finishing one puts you
   * back in the normal grid rather than in select mode holding a selection that has already
   * been acted on. One function rather than two setters at each call site, so the three
   * buttons cannot drift apart on it.
   */
  exitBulkSelect: () => void;
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
  const [pendingChange, setPendingChange] = useState<PendingShiftChange | null>(
    null
  );
  const [dropTarget, setDropTarget] = useState<{
    userId: string;
    hour: number;
  } | null>(null);

  const exitBulkSelect = () => {
    setBulkSelectedShifts([]);
    setIsBulkSelectorActive(false);
  };
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
        pendingChange,
        setPendingChange,
        dropTarget,
        setDropTarget,
        exitBulkSelect,
      }}
    >
      {children}
    </ScheduleContext.Provider>
  );
}
