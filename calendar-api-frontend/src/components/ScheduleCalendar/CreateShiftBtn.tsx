import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserSettings } from "@/providers/useUserSettings";
import CreateShiftDialog from "./shift-dialogs/CreateShiftDialog";

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
  const { type: userType } = useUserSettings();
  const [open, setOpen] = useState(false);

  if (userType !== "admin") return null;

  return (
    <>
      <Button
        className="flex h-[34px] items-center gap-[7px] whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold"
        onClick={() => setOpen(true)}
      >
        <Plus size={15} /> New shift
      </Button>
      {open && (
        <CreateShiftDialog
          open
          onOpenChange={setOpen}
          selectedDate={selectedDate}
        />
      )}
    </>
  );
};

export default NewShiftButton;
