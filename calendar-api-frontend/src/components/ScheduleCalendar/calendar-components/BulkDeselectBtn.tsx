import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSchedule } from "@/providers/useSchedule";
import { CopyX } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

function BulkDeselectBtn() {
  const { bulkSelectedShifts, setBulkSelectedShifts, isBulkSelectorActive } =
    useSchedule();

  const handleBulkDeselect = () => {
    if (bulkSelectedShifts.length === 0) return;
    setBulkSelectedShifts([]);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isBulkSelectorActive) {
        event.preventDefault();
        if (bulkSelectedShifts.length === 0) return;
        toast("Shifts deselected");
        handleBulkDeselect();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBulkSelectorActive]);

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger>
          <Button
            variant="ghost"
            className="h-5 w-fit"
            onClick={handleBulkDeselect}
          >
            <CopyX style={{ height: "0.9rem", width: "0.9rem" }} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col items-center justify-center gap-1">
            <p className="">Clear selection</p>
            <div className="text-zinc-400 border-solid border border-zinc-400 rounded-md w-fit h-fit px-1">
              esc
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default BulkDeselectBtn;
