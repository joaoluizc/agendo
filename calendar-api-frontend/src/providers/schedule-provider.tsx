import { CalendarUser } from "@/types/gCalendarTypes";
import {
  PendingShiftChange,
  Shift,
  ShiftInDrag,
  SortedCalendar,
} from "@/types/shiftTypes";
import { createContext, useCallback, useMemo, useRef, useState } from "react";

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
   * The selection as ids, for membership tests.
   *
   * Every block on the grid asks "am I selected?", and answering that by scanning
   * `bulkSelectedShifts` made select-all quadratic: 90 blocks each walking a 90-item array
   * on every change. Derived here once per selection change instead.
   */
  selectedShiftIds: Set<string>;
  /**
   * The day's shifts for the agents the grid actually draws (the location filter applied).
   * Published by `ScheduleCalendar` so the toolbar's select-all picks exactly what is on
   * screen — never a hidden agent's shifts.
   */
  visibleShifts: SortedCalendar;
  /**
   * Positions of the coverage meter the admin clicked, or null when none is focused.
   * Shifts outside it are dimmed, not hidden — see `CoverageRow`.
   */
  focusedPositionIds: Set<string> | null;
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
  setVisibleShifts: (value: SortedCalendar) => void;
  setFocusedPositionIds: (value: Set<string> | null) => void;
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
  /**
   * Refetch the day on screen without blanking the grid. For anything that changed shifts
   * behind the grid's back — a batched publish where one chunk failed, say — and needs the
   * server's word on what actually happened.
   */
  reloadSchedule: () => void;
  /** `ScheduleCalendar` registers the function `reloadSchedule` calls. */
  registerReload: (reload: () => void) => void;
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
  const [visibleShifts, setVisibleShifts] = useState<SortedCalendar>({});
  const [focusedPositionIds, setFocusedPositionIds] = useState<Set<string> | null>(
    null
  );
  const [pendingChange, setPendingChange] = useState<PendingShiftChange | null>(
    null
  );
  const [dropTarget, setDropTarget] = useState<{
    userId: string;
    hour: number;
  } | null>(null);
  const [shiftInDrag, setShiftInDrag] = useState<ShiftInDrag>({
    isBeingDragged: false,
    data: null,
  });

  const selectedShiftIds = useMemo(
    () => new Set(bulkSelectedShifts.map((shift) => shift._id)),
    [bulkSelectedShifts]
  );

  // Stable, so the memoised blocks that take it do not all re-render on every change.
  const exitBulkSelect = useCallback(() => {
    setBulkSelectedShifts([]);
    setIsBulkSelectorActive(false);
  }, []);

  // A ref, not state: the function changes every render of `ScheduleCalendar`, and
  // storing it as state would re-render the whole schedule each time it was registered.
  const reloadRef = useRef<() => void>(() => {});
  const reloadSchedule = useCallback(() => reloadRef.current(), []);
  const registerReload = useCallback((reload: () => void) => {
    reloadRef.current = reload;
  }, []);

  // Memoised: this object used to be rebuilt on every render, which re-rendered every
  // consumer — each of the day's shift blocks included — whether or not anything it read
  // had changed.
  const value = useMemo(
    () => ({
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
      selectedShiftIds,
      visibleShifts,
      setVisibleShifts,
      focusedPositionIds,
      setFocusedPositionIds,
      pendingChange,
      setPendingChange,
      dropTarget,
      setDropTarget,
      exitBulkSelect,
      reloadSchedule,
      registerReload,
    }),
    [
      shifts,
      events,
      scheduleIsLoading,
      shiftInDrag,
      isBulkSelectorActive,
      bulkSelectedShifts,
      selectedShiftIds,
      visibleShifts,
      focusedPositionIds,
      pendingChange,
      dropTarget,
      exitBulkSelect,
      reloadSchedule,
      registerReload,
    ]
  );

  return (
    <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
  );
}
