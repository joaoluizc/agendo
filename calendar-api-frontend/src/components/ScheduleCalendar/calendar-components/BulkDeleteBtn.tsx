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
import { useEffect, useState } from "react";
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
  const { isBulkSelectorActive, bulkSelectedShifts, setBulkSelectedShifts } =
    useSchedule();
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
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
    const deletePromise: Promise<DeletionPromiseReturn> = new Promise(
      async (resolve, reject) => {
        let successfullyDeletedShifts: Shift[] = [];
        let failedToDeleteShifts: Shift[] = [];

        for (const shift of bulkSelectedShifts) {
          const deleteSuccess = await deleteShiftRequest(shift._id);
          if (deleteSuccess) {
            successfullyDeletedShifts.push(shift);
          } else {
            failedToDeleteShifts.push(shift);
          }
        }

        if (failedToDeleteShifts.length > 0) {
          reject({
            successfullyDeletedShifts,
            failedToDeleteShifts,
          });
        } else {
          resolve({
            successfullyDeletedShifts,
            failedToDeleteShifts,
          });
        }
      }
    );

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
    setBulkSelectedShifts([]);
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
              <Button variant="ghost" className="h-5 w-fit">
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
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            selected shifts.
          </AlertDialogDescription>
        </AlertDialogHeader>
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
