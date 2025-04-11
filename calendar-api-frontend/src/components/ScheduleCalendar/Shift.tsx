import { useUserSettings } from "@/providers/useUserSettings";
import {
  calculateGridColumnSpan,
  calculateGridColumnStart,
  prettyTimeRange,
} from "./scheduleUtils";
import type { Shift } from "@/types/shiftTypes";
import { Dialog, DialogTrigger } from "../ui/dialog";
import { useState, useMemo, useCallback } from "react";
import { EditShiftDialog } from "./EditShiftDIalog";
import { useSchedule } from "@/providers/useSchedule";

type ShiftProps = {
  shift: Shift;
  selectedDate: Date;
  reloadScheduleCalendar: () => void;
};

export function Shift(props: ShiftProps) {
  const { shift, selectedDate, reloadScheduleCalendar } = props;
  const { shiftInDrag, setShiftInDrag } = useSchedule();
  const { allPositions, type: userType } = useUserSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [handleOpenChange, setHandleOpenChange] = useState<
    ((open: boolean) => void) | null
  >(null);

  // Memoize these calculations
  const start = useMemo(
    () => calculateGridColumnStart(shift.startTime, String(selectedDate)),
    [shift.startTime, selectedDate]
  );

  const span = useMemo(
    () =>
      calculateGridColumnSpan(
        shift.startTime,
        shift.endTime,
        String(selectedDate)
      ),
    [shift.startTime, shift.endTime, selectedDate]
  );

  // Memoize position finding
  const currPosition = useMemo(() => {
    const position = allPositions.find((pos) => shift.positionId === pos._id);
    return (
      position || {
        name: "Unknown",
        color: "#000000",
        _id: "0",
        positionId: "0",
        type: "break",
        sync: false,
      }
    );
  }, [allPositions, shift.positionId]);

  // Memoize callback function
  const handleFunctionCreated = useCallback((fn: (open: boolean) => void) => {
    setHandleOpenChange(() => fn);
  }, []);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (handleOpenChange) {
        handleOpenChange(open);
      }
      setIsOpen(open);
    },
    [handleOpenChange]
  );

  const handleDragStart = () => {
    if (userType === "admin") {
      setShiftInDrag({
        isBeingDragged: true,
        data: shift,
      });
    }
  };

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      className={`p-1 m-[0.2rem] z-10 overflow-hidden whitespace-nowrap truncate rounded text-white h-11 flex flex-col justify-between `}
      style={{
        gridColumnStart: start,
        gridColumnEnd: `span ${span}`,
        backgroundColor: `color-mix(in srgb, ${currPosition?.color} 95%, hsl(var(--shiftmix)) 20%)`,
        fontSize: "0.6875rem",
        cursor: userType === "admin" ? "pointer" : "default",
      }}
    >
      <Dialog open={isOpen} onOpenChange={onOpenChange} modal={false}>
        <DialogTrigger asChild>
          <div>
            <div className="font-bold truncate">
              {prettyTimeRange(shift.startTime, shift.endTime)}
            </div>
            <div className="truncate">{currPosition?.name}</div>
          </div>
        </DialogTrigger>
        {userType === "admin" && (
          <EditShiftDialog
            shift={shift}
            setIsOpen={setIsOpen}
            handleFunctionCreated={handleFunctionCreated}
            reloadScheduleCalendar={reloadScheduleCalendar}
          />
        )}
      </Dialog>
    </div>
  );
}
