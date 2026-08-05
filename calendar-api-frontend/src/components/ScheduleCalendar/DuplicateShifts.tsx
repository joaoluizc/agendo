import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserSettings } from "@/providers/useUserSettings";
import DuplicateDayDialog from "./shift-dialogs/DuplicateDayDialog";

type DuplicateShiftsProps = {
  selectedDate: Date;
  /** Refetch the day on screen, for when a copy lands on it. */
  onDuplicated: () => void;
};

const DuplicateShifts = ({
  selectedDate,
  onDuplicated,
}: DuplicateShiftsProps) => {
  const { type: userType } = useUserSettings();
  const [open, setOpen] = useState(false);

  if (userType !== "admin") return null;

  return (
    <>
      <Button
        variant="outline"
        className="flex h-[34px] items-center gap-[7px] whitespace-nowrap rounded-lg px-3 text-[13px]"
        onClick={() => setOpen(true)}
      >
        <Copy size={15} /> Duplicate day
      </Button>
      {open && (
        <DuplicateDayDialog
          open
          onOpenChange={setOpen}
          selectedDate={selectedDate}
          onDuplicated={onDuplicated}
        />
      )}
    </>
  );
};

export default DuplicateShifts;
