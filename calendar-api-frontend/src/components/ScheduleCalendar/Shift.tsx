import { useUserSettings } from "@/providers/useUserSettings";
import {
  calculateGridColumnSpan,
  calculateGridColumnStart,
  prettyTimeRange,
} from "./scheduleUtils";
import type { Shift } from "@/types/shiftTypes";
import { Dialog, DialogTrigger } from "../ui/dialog";
import { useState, useMemo, useEffect } from "react";
import { EditShiftDialog } from "./EditShiftDIalog";
import { useSchedule } from "@/providers/useSchedule";

type ShiftProps = {
  shift: Shift;
  selectedDate: Date;
  reloadScheduleCalendar: () => void;
};

export function Shift(props: ShiftProps) {
  const { shift, selectedDate, reloadScheduleCalendar } = props;
  const {
    setShiftInDrag,
    isBulkSelectorActive,
    bulkSelectedShifts,
    setBulkSelectedShifts,
  } = useSchedule();
  const { allPositions, type: userType } = useUserSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [isSelected, setIsSelected] = useState(false);

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

  useEffect(() => {
    if (bulkSelectedShifts) {
      const isAlreadySelected = bulkSelectedShifts.some(
        (selectedShift) => selectedShift._id === shift._id
      );
      setIsSelected(isAlreadySelected);
    } else {
      setIsSelected(false);
    }
  }, [bulkSelectedShifts]);

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

  const handleDragStart = () => {
    if (userType === "admin") {
      setShiftInDrag({
        isBeingDragged: true,
        data: shift,
      });
    }
  };

  const toggleSelected = () => {
    if (userType !== "admin") return;

    setIsSelected((prev) => !prev);

    if (!bulkSelectedShifts) return;

    const isAlreadySelected = bulkSelectedShifts.some(
      (selectedShift) => selectedShift._id === shift._id
    );

    const updatedShifts = isAlreadySelected
      ? bulkSelectedShifts.filter(
          (selectedShift) => selectedShift._id !== shift._id
        )
      : [...(bulkSelectedShifts || []), shift];
    setBulkSelectedShifts(updatedShifts);
  };

  const shiftStyleBulkActive = useMemo(
    () => ({
      gridColumnStart: start,
      gridColumnEnd: `span ${span}`,
      backgroundColor: `color-mix(in srgb, ${currPosition?.color} 95%, hsl(var(--shiftmix)) 20%)`,
      fontSize: "0.6875rem",
      cursor: userType === "admin" ? "pointer" : "default",
      border: isSelected ? "2px solid white " : "none",
    }),
    [start, span, currPosition, userType, isSelected]
  );

  return isBulkSelectorActive ? (
    <div
      onClick={() => toggleSelected()}
      className={`p-1 m-[0.2rem] z-10 overflow-hidden whitespace-nowrap truncate rounded text-white h-11 flex flex-col justify-between`}
      onMouseEnter={(e) => {
        if (userType === "admin") {
          e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${currPosition?.color} 80%, hsl(0, 0%, 100%) 20%)`;
        }
      }}
      onMouseLeave={(e) => {
        if (userType === "admin") {
          e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${currPosition?.color} 95%, hsl(var(--shiftmix)) 20%)`;
        }
      }}
      style={shiftStyleBulkActive}
    >
      <div>
        <div className="font-bold truncate">
          {prettyTimeRange(shift.startTime, shift.endTime)}
        </div>
        <div className="truncate">{currPosition?.name}</div>
      </div>
    </div>
  ) : (
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
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
            reloadScheduleCalendar={reloadScheduleCalendar}
          />
        )}
      </Dialog>
    </div>
  );
}
