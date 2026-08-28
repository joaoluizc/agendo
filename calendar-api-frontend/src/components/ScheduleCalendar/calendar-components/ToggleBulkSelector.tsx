import { Button } from "@/components/ui/button";
import { useSchedule } from "@/providers/useSchedule";
// import BulkCopyBtn from "./BulkCopyBtn";
import BulkDeleteBtn from "./BulkDeleteBtn";
import BulkDeselectBtn from "./BulkDeselectBtn";
import BulkStatusBtn from "./BulkStatusBtn";
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
  const { isBulkSelectorActive, setIsBulkSelectorActive, exitBulkSelect } =
    useSchedule();

  if (type !== "admin") return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isBulkSelectorActive ? "secondary" : "outline"}
        className="h-[34px] gap-[7px] whitespace-nowrap rounded-lg px-3 text-[13px]"
        // Leaving the mode drops the selection rather than keeping it. Once the checkboxes
        // are gone a retained selection is invisible and undeselectable — the exact state
        // that let a stale cross-day selection delete two days of shifts.
        onClick={() =>
          isBulkSelectorActive ? exitBulkSelect() : setIsBulkSelectorActive(true)
        }
      >
        <ListChecks size={16} />
        {isBulkSelectorActive ? "Done selecting" : "Select shifts"}
      </Button>

      {isBulkSelectorActive && (
        <div id="bulk-selector-active-buttons" className="flex items-center">
          {/* <BulkCopyBtn /> */}
          <BulkDeselectBtn />
          {/* Publish and unpublish sit before delete so the destructive action stays at the
              end of the row, away from the two that are routine. Each disables itself when
              the selection holds nothing of its kind. */}
          <BulkStatusBtn mode="publish" />
          <BulkStatusBtn mode="unpublish" />
          <BulkDeleteBtn />
        </div>
      )}
    </div>
  );
}

export default ToggleBulkSelector;
