import { ChevronLeft, ChevronRight, CalendarSearch } from "lucide-react";
import { Label } from "@radix-ui/react-label";
import { Input } from "@/components/ui/input";
import CreateShiftForm from "../CreateShiftBtn";
import DuplicateShifts from "../DuplicateShifts";
import ToggleBulkSelector from "./ToggleBulkSelector";

type ScheduleToolbarProps = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  isToday: boolean;
  /** Refetch the day on screen — used when a duplicate lands on it. */
  onReload: () => void;
};

/** A given Date, shifted by `delta` days and normalised to local midnight. */
const addDays = (date: Date, delta: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);

/**
 * The schedule's own toolbar.
 *
 * The date stepper is local rather than the shared `DateNavButtons` on purpose:
 * that component is also used by /app/sling-schedule, which this redesign leaves
 * alone. Same behaviour, different chrome.
 */
const ScheduleToolbar = ({
  selectedDate,
  onSelectDate,
  isToday,
  onReload,
}: ScheduleToolbarProps) => (
  <div className="flex flex-wrap items-end gap-4 px-5 pb-3.5 pt-5">
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Schedule · Agendo
      </div>
      <div className="flex items-center gap-2.5">
        <h1 className="whitespace-nowrap font-sf text-[22px] font-semibold tracking-[-0.01em]">
          {selectedDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h1>
        {isToday && (
          <span className="flex h-[22px] items-center rounded-md bg-muted px-2 text-[11px] font-semibold text-muted-foreground">
            Today
          </span>
        )}
      </div>
    </div>

    {/* Prev · Today · Next, glued into one bordered control. */}
    <div className="flex h-[34px] items-stretch overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        aria-label="Previous day"
        className="flex w-8 items-center justify-center hover:bg-muted"
        onClick={() => onSelectDate(addDays(selectedDate, -1))}
      >
        <ChevronLeft size={15} />
      </button>
      <button
        type="button"
        className="border-x border-border px-3 text-[13px] font-medium hover:bg-muted"
        onClick={() => onSelectDate(addDays(new Date(), 0))}
      >
        Today
      </button>
      <button
        type="button"
        aria-label="Next day"
        className="flex w-8 items-center justify-center hover:bg-muted"
        onClick={() => onSelectDate(addDays(selectedDate, 1))}
      >
        <ChevronRight size={15} />
      </button>
    </div>

    {/* AirDatepicker attaches to #date — the id has to stay. */}
    <Label htmlFor="date" className="relative flex">
      <Input
        id="date"
        className="h-[34px] w-[112px] cursor-pointer rounded-lg pr-7 text-[13px]"
        placeholder="Select a date"
        value={selectedDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
        readOnly
      />
      <CalendarSearch className="pointer-events-none absolute right-2 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" />
    </Label>

    <div className="ml-auto flex flex-wrap items-center gap-2.5">
      <DuplicateShifts selectedDate={selectedDate} onDuplicated={onReload} />
      <ToggleBulkSelector />
      <CreateShiftForm selectedDate={selectedDate} />
    </div>
  </div>
);

export default ScheduleToolbar;
