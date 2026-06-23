import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

interface DateNavButtonsProps {
  /** Currently selected day. */
  selectedDate: Date;
  /** Called with the new day when the user navigates. */
  onSelectDate: (date: Date) => void;
}

/** A given Date, shifted by `delta` days and normalised to local midnight. */
const addDays = (date: Date, delta: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);

const localToday = (): Date => addDays(new Date(), 0);

/**
 * Day navigation controls that sit to the right of the schedule's date picker:
 * a glued previous/next day pair (looking like one two-option control) and a
 * separate "Today" button. Shared by the agendo and Sling schedule screens.
 */
const DateNavButtons = ({ selectedDate, onSelectDate }: DateNavButtonsProps) => {
  return (
    <div className="flex items-center gap-2">
      {/* Previous / next day — glued into a single control with one divider. */}
      <div className="inline-flex -space-x-px">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous day"
          className="rounded-r-none focus:z-10"
          onClick={() => onSelectDate(addDays(selectedDate, -1))}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next day"
          className="rounded-l-none focus:z-10"
          onClick={() => onSelectDate(addDays(selectedDate, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => onSelectDate(localToday())}
      >
        Today
      </Button>
    </div>
  );
};

export default DateNavButtons;
