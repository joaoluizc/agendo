import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import CreateShiftDialog from "./shift-dialogs/CreateShiftDialog";
import { focusedDefaultPosition } from "./scheduleUtils";

type NewShiftButtonProps = {
  selectedDate: Date;
};

/**
 * The toolbar's primary action.
 *
 * The dialog is mounted only while it is open — it derives every agent's conflicts and
 * the coverage series on render, and there is no reason to pay for that behind a closed
 * dialog.
 */
const NewShiftButton = ({ selectedDate }: NewShiftButtonProps) => {
  const { type: userType, allPositions } = useUserSettings();
  const { focusedPositionIds, isBulkSelectorActive } = useSchedule();
  const [open, setOpen] = useState(false);

  if (userType !== "admin") return null;

  return (
    <>
      {/* Same weight as every other control in the toolbar. The filled `default` variant
          already carries the emphasis — a near-white block on a near-black page is 19:1
          against the background where the outline buttons are 1:1 — so the extra
          font-semibold was doing nothing except making this the one label out of step. */}
      {/* Icon-only on a phone while selecting, so select mode's buttons and this one
          still share the toolbar's last line. The label stays for screen readers. */}
      <Button
        className={cn(
          "flex h-[34px] items-center gap-[7px] whitespace-nowrap rounded-lg px-3 text-[13px]",
          isBulkSelectorActive && "max-md:px-2.5"
        )}
        title="New shift"
        onClick={() => setOpen(true)}
      >
        <Plus size={16} />{" "}
        <span className={cn(isBulkSelectorActive && "max-md:sr-only")}>New shift</span>
      </Button>
      {open && (
        <CreateShiftDialog
          open
          onOpenChange={setOpen}
          selectedDate={selectedDate}
          // With a coverage meter focused, a new shift starts on that meter's position.
          initialPositionId={focusedDefaultPosition(
            allPositions,
            focusedPositionIds
          )}
        />
      )}
    </>
  );
};

export default NewShiftButton;
