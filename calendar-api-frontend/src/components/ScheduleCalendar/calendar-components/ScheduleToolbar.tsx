import { ChevronLeft, ChevronRight, CalendarSearch } from "lucide-react";
import { Label } from "@radix-ui/react-label";
import { Input } from "@/components/ui/input";
import CreateShiftForm from "../CreateShiftBtn";
import DuplicateShifts from "../DuplicateShifts";
import ToggleBulkSelector from "./ToggleBulkSelector";
import { cn } from "@/lib/utils";

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
 * `Thu • Aug 27, 2026` — the picker's label, and the only place the day is shown.
 *
 * Month before day, matching every other date in the app (`prettyGCalTime`, the duplicate
 * dialog, the reports range). One `toLocaleDateString` call for the date part, so the
 * comma is en-US's own rather than hand-placed; only the weekday and the `•` are joined on.
 *
 * Everything here is fixed-width in characters — three-letter weekday, three-letter month,
 * four-digit year — so the label cannot outgrow the input, which is what stops the picker
 * resizing and shoving the toolbar around as the day changes.
 */
const weekdayAndDate = (date: Date) => {
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const monthDayYear = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${weekday} • ${monthDayYear}`;
};

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
  <div className="px-5 pb-3.5 pt-5">
    {/* The label keeps its own line, with every control on the line below — the layout it
        had before, minus the 22px date that used to sit on that second line.
        That date lived in a box padded out to the width of the longest possible date, so
        the stepper beside it would stop sliding on every arrow press; it held still but
        left an obvious gap next to short dates. The day is in the picker now — shown once
        rather than twice, and nothing right of it can move, because the picker is a
        fixed-width input. */}
    <h1 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      Schedule · Agendo
    </h1>

    {/* Every control here is 34px tall with 13px text and a 16px icon.
        16 rather than the 15 these once declared: the shared `Button` sets
        `[&_svg]:size-4`, and a CSS rule beats an SVG's width/height *attributes*, so any
        icon inside a Button rendered at 16 whatever `size` said. The chevrons and the
        calendar glyph are not inside Buttons — raw <button> and a Label — so they alone
        honoured the 15 and came out a pixel small. Matching the Button default means no
        control needs an override to stay in step. */}
    <div className="flex flex-wrap items-center gap-4">
      {/* Prev · Today · Next, glued into one bordered control. */}
      <div className="flex h-[34px] items-stretch overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          aria-label="Previous day"
          className="flex w-8 items-center justify-center hover:bg-muted"
          onClick={() => onSelectDate(addDays(selectedDate, -1))}
        >
          <ChevronLeft size={16} />
        </button>
        {/* Between the arrows, as the one fixed point you can always get back to. Marked
          when you are already on today so it reads as state rather than a dead button —
          still clickable, since it is harmless and disabling it looks broken. */}
        <button
          type="button"
          aria-current={isToday ? "date" : undefined}
          className={cn(
            "border-x border-border px-3 text-[13px] font-medium hover:bg-muted",
            isToday && "bg-muted text-foreground",
          )}
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
          <ChevronRight size={16} />
        </button>
      </div>

      {/* AirDatepicker attaches to #date — the id has to stay.
        Now the only place the selected day is shown, so it carries the weekday too:
        knowing it is a Thursday matters more than the date itself when you are looking at
        a week's coverage. Wide enough for the longest result ("Sun • Sep 30, 2026") plus
        the icon, and fixed, so nothing here shifts as the day changes. */}
      <Label htmlFor="date" className="relative flex">
        <Input
          id="date"
          className="h-[34px] w-[168px] cursor-pointer rounded-lg pr-7 text-[13px] font-medium tabular-nums"
          placeholder="Select a date"
          value={weekdayAndDate(selectedDate)}
          readOnly
        />
        <CalendarSearch className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </Label>

      <div className="ml-auto flex flex-wrap items-center gap-2.5">
        <DuplicateShifts selectedDate={selectedDate} onDuplicated={onReload} />
        <ToggleBulkSelector />
        <CreateShiftForm selectedDate={selectedDate} />
      </div>
    </div>
  </div>
);

export default ScheduleToolbar;
