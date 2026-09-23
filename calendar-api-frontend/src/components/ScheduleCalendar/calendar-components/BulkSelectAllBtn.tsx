import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSchedule } from "@/providers/useSchedule";

/**
 * Select every shift on screen, whatever its status — the quick way to unpublish or
 * delete a whole day. It selects what the grid draws, so a location filter narrows it,
 * and each row's checkbox then takes one agent back out. Ctrl/Cmd+A does the same from
 * anywhere on the schedule (see `useSelectShortcuts`).
 */
function BulkSelectAllBtn() {
  const { visibleShifts, selectedShiftIds, selectAllVisible } = useSchedule();
  const total = Object.values(visibleShifts).reduce(
    (sum, shifts) => sum + shifts.length,
    0
  );
  const allSelected =
    total > 0 &&
    Object.values(visibleShifts).every((shifts) =>
      shifts.every((shift) => selectedShiftIds.has(shift._id))
    );

  const selectAll = () => {
    if (selectAllVisible() === 0) toast.error("No shifts on this day to select.");
  };

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            className="h-5 w-fit"
            disabled={total === 0 || allSelected}
            onClick={selectAll}
            aria-label="Select all shifts on this day"
          >
            <CheckCheck style={{ height: "0.9rem", width: "0.9rem" }} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col items-center justify-center gap-1">
            <p>Select all</p>
            <div className="flex items-center gap-1.5">
              <div className="h-fit w-fit rounded-md border border-solid border-zinc-400 px-1 text-zinc-400">
                ctrl A
              </div>
              <span className="text-zinc-400">
                {allSelected
                  ? "all selected"
                  : `${total} shift${total === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default BulkSelectAllBtn;
