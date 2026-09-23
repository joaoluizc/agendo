import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const { focusedPositionIds } = useSchedule();
  const [open, setOpen] = useState(false);

  if (userType !== "admin") return null;

  return (
    <>
      {/* Same weight as every other control in the toolbar. The filled `default` variant
          already carries the emphasis — a near-white block on a near-black page is 19:1
          against the background where the outline buttons are 1:1 — so the extra
          font-semibold was doing nothing except making this the one label out of step. */}
      <Button
        className="flex h-[34px] items-center gap-[7px] whitespace-nowrap rounded-lg px-3 text-[13px]"
        onClick={() => setOpen(true)}
      >
        <Plus size={16} /> New shift
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
