import { Button } from "@/components/ui/button";
import { useSchedule } from "@/providers/useSchedule";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import deleteShiftRequest from "@/utils/deleteShiftRequest";
import useRemoveShiftFromSchedule from "@/hooks/useRemoveShiftFromSchedule";
import { Shift } from "@/types/shiftTypes";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function BulkDeleteBtn() {
  const { isBulkSelectorActive, bulkSelectedShifts, exitBulkSelect } =
    useSchedule();
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);

  /** The distinct calendar days the selection touches, for the confirmation. */
  const selectedDays = useMemo(() => {
    const days = new Set(
      bulkSelectedShifts.map((shift) =>
        new Date(shift.startTime).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      )
    );
    return [...days];
  }, [bulkSelectedShifts]);
  const removeShiftsFromSchedule = useRemoveShiftFromSchedule("bulk") as (
    shifts: Shift[]
  ) => void;

  const handleBulkDelete = async () => {
    if (!isBulkSelectorActive) return;
    if (bulkSelectedShifts.length === 0) {
      return;
    }

    type DeletionPromiseReturn = {
      successfullyDeletedShifts: Shift[];
      failedToDeleteShifts: Shift[];
    };
    // An async IIFE rather than `new Promise(async …)`: an async executor swallows a throw
    // from inside it, so the rejection path was one stray exception away from a toast that
    // spun forever. The partial-result payload on both paths is what `toast.promise`'s
    // handlers below read.
    const deletePromise: Promise<DeletionPromiseReturn> = (async () => {
      const successfullyDeletedShifts: Shift[] = [];
      const failedToDeleteShifts: Shift[] = [];

      for (const shift of bulkSelectedShifts) {
        const deleteSuccess = await deleteShiftRequest(shift._id);
        if (deleteSuccess) {
          successfullyDeletedShifts.push(shift);
        } else {
          failedToDeleteShifts.push(shift);
        }
      }

      if (failedToDeleteShifts.length > 0) {
        throw { successfullyDeletedShifts, failedToDeleteShifts };
      }
      return { successfullyDeletedShifts, failedToDeleteShifts };
    })();

    toast.promise(deletePromise, {
      loading: "Deleting shifts...",
      success: (result) => {
        removeShiftsFromSchedule(result.successfullyDeletedShifts);
        return `${result.successfullyDeletedShifts.length} shift(s) deleted successfully.`;
      },
      error: (result) => {
        if (result.successfullyDeletedShifts.length > 0) {
          removeShiftsFromSchedule(result.successfullyDeletedShifts);
        }
        console.log("Failed to delete shifts:", result.failedToDeleteShifts);
        return `Failed to delete ${result.failedToDeleteShifts.length} shift(s). ${result.successfullyDeletedShifts.length} shift(s) deleted successfully.`;
      },
    });
    // Acting on a selection ends the mode: staying in select mode holding shifts that have
    // just been deleted is how a stale selection survives to bite the next action.
    exitBulkSelect();
  };

  const handleTriggerClick = (state: boolean) => {
    setConfirmationDialogOpen(state);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Delete" && isBulkSelectorActive) {
      event.preventDefault(); // Prevent default delete action

      if (bulkSelectedShifts.length === 0) {
        // Show toast if no shifts are selected
        toast.error("Select at least one shift before deleting.");
        return;
      }

      console.log("Delete key pressed");
      setConfirmationDialogOpen(true); // Open the confirmation dialog directly
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBulkSelectorActive, bulkSelectedShifts]);

  return (
    <AlertDialog
      open={confirmationDialogOpen}
      onOpenChange={handleTriggerClick}
    >
      <AlertDialogTrigger>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger>
              {/* Disabled with an empty selection, like the other bulk buttons. Without it
                  the trigger opened a confirmation dialog for deleting nothing. */}
              <Button
                variant="ghost"
                className="h-5 w-fit"
                disabled={bulkSelectedShifts.length === 0}
              >
                <Trash2 style={{ height: "0.9rem", width: "0.9rem" }} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col items-center justify-center gap-1">
                <p className="">Delete selected shifts</p>
                <div className="text-zinc-400 border-solid border border-zinc-400 rounded-md w-fit h-fit px-1">
                  delete
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`Delete ${bulkSelectedShifts.length} shift${
              bulkSelectedShifts.length === 1 ? "" : "s"
            }?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* The count and the days are the backstop.
            The selection is cleared when the day changes (ScheduleCalendar), so it should
            never span days — but this dialog previously said only "the selected shifts",
            which is precisely why a stale cross-day selection deleted two days' worth
            without anyone being able to tell. If more than one day ever shows up here
            again, it is visible before the button is pressed rather than after. */}
        <div className="rounded-lg border border-border bg-band px-3.5 py-2.5 text-[12.5px]">
          {selectedDays.length > 1 ? (
            <span className="font-semibold text-warn">
              {`Across ${selectedDays.length} different days: ${selectedDays.join(
                ", "
              )}`}
            </span>
          ) : (
            <span className="font-semibold tabular-nums">
              {selectedDays[0] ?? "No shifts selected"}
            </span>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBulkDelete}
            className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
          >
            Delete Shifts
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default BulkDeleteBtn;
