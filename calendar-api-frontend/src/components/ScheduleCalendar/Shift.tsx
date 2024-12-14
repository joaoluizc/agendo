import { useUserSettings } from "@/providers/useUserSettings";
import {
  calculateGridColumnSpan,
  calculateGridColumnStart,
  prettyTimeRange,
} from "./scheduleUtils";
import type { Shift } from "@/types/shiftTypes";
import { Dialog, DialogTrigger } from "../ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useMemo, useCallback } from "react";
import { EditShiftDialog } from "./EditShiftDIalog";

type ShiftProps = {
  shift: Shift;
  selectedDate: Date;
  reloadScheduleCalendar: () => void;
};

export function Shift(props: ShiftProps) {
  const { shift, selectedDate, reloadScheduleCalendar } = props;
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

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <Dialog open={isOpen} onOpenChange={onOpenChange} modal={false}>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <div
                className={`p-1 m-[0.2rem] z-10 overflow-hidden whitespace-nowrap truncate rounded text-white`}
                style={{
                  gridColumnStart: start,
                  gridColumnEnd: `span ${span}`,
                  backgroundColor: `color-mix(in srgb, ${currPosition?.color} 95%, hsl(var(--shiftmix)) 20%)`,
                  fontSize: "0.6875rem",
                  cursor: userType === "admin" ? "pointer" : "default",
                }}
              >
                <div className="font-bold truncate">
                  {prettyTimeRange(shift.startTime, shift.endTime)}
                </div>
                <div className="truncate">{currPosition?.name}</div>
              </div>
            </DialogTrigger>
          </TooltipTrigger>
          {userType === "admin" && (
            <EditShiftDialog
              shift={shift}
              setIsOpen={setIsOpen}
              handleFunctionCreated={handleFunctionCreated}
              reloadScheduleCalendar={reloadScheduleCalendar}
            />
          )}
        </Dialog>
        <TooltipContent
          style={{
            backgroundColor: `color-mix(in srgb, ${currPosition?.color} 95%, hsl(var(--shiftmix)) 20%)`,
            color: "white",
          }}
        >
          <div className="p-2">
            <div className="font-bold">
              {prettyTimeRange(shift.startTime, shift.endTime)}
            </div>
            <div>{currPosition?.name}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
