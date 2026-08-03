import { Button } from "@/components/ui/button";
import { useSchedule } from "@/providers/useSchedule";
// import BulkCopyBtn from "./BulkCopyBtn";
import BulkDeleteBtn from "./BulkDeleteBtn";
import BulkDeselectBtn from "./BulkDeselectBtn";
import { useUserSettings } from "@/providers/useUserSettings";
import { ListChecks } from "lucide-react";

/**
 * Enters bulk-select mode, which reveals per-shift selection on the grid.
 *
 * Behaviour is unchanged from the old `Bulk Select` switch — it's a button now
 * because the toolbar is a row of buttons and a lone switch read as a setting rather
 * than a mode you step into and back out of.
 */
function ToggleBulkSelector() {
  const { type } = useUserSettings();
  const { isBulkSelectorActive, setIsBulkSelectorActive } = useSchedule();

  if (type !== "admin") return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isBulkSelectorActive ? "secondary" : "outline"}
        className="h-[34px] gap-[7px] whitespace-nowrap rounded-lg px-3 text-[13px]"
        onClick={() => setIsBulkSelectorActive(!isBulkSelectorActive)}
      >
        <ListChecks size={15} />
        {isBulkSelectorActive ? "Done selecting" : "Select shifts"}
      </Button>

      {isBulkSelectorActive && (
        <div id="bulk-selector-active-buttons" className="flex items-center">
          {/* <BulkCopyBtn /> */}
          <BulkDeselectBtn />
          <BulkDeleteBtn />
        </div>
      )}
    </div>
  );
}

export default ToggleBulkSelector;
