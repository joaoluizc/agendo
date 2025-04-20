import { Switch } from "@/components/ui/switch";
import { useSchedule } from "@/providers/useSchedule";
// import BulkCopyBtn from "./BulkCopyBtn";
import BulkDeleteBtn from "./BulkDeleteBtn";
import BulkDeselectBtn from "./BulkDeselectBtn";

function ToggleBulkSelector() {
  const { isBulkSelectorActive, setIsBulkSelectorActive } = useSchedule();

  const toggleBulkSelector = () => {
    setIsBulkSelectorActive(!isBulkSelectorActive);
  };

  return (
    <div
      className={`flex space-x-3 ml-auto p-2 rounded-md border border-border px-4 ${
        isBulkSelectorActive ? "pl-1" : ""
      }`}
    >
      {isBulkSelectorActive && (
        <div id="bulk-selector-active-buttons" className="h-5">
          {/* <BulkCopyBtn /> */}
          <BulkDeselectBtn />
          <BulkDeleteBtn />
        </div>
      )}
      <div className="flex items-center space-x-2">
        <Switch
          id="bulk-selector-toggle"
          checked={isBulkSelectorActive}
          onCheckedChange={toggleBulkSelector}
        />
        <p className="text-sm">Bulk Select</p>
      </div>
    </div>
  );
}

export default ToggleBulkSelector;
