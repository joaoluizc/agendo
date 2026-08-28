import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import {
  startOfDay,
  endOfDay,
  addWeeks,
  subWeeks,
  startOfWeek,
  endOfWeek,
  addMonths,
  startOfMonth,
  endOfMonth,
  subMonths,
  addQuarters,
  startOfQuarter,
  endOfQuarter,
  subQuarters,
  format,
} from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DateRangeValue = { start: Date; end: Date };
export type PresetKey =
  | "currentQuarter"
  | "lastQuarter"
  | "currentMonth"
  | "lastMonth"
  | "lastWeek"
  | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "currentQuarter", label: "Current quarter" },
  { key: "lastQuarter", label: "Last quarter" },
  { key: "currentMonth", label: "Current month" },
  { key: "lastMonth", label: "Last month" },
  { key: "lastWeek", label: "Last week" },
  { key: "custom", label: "Custom" },
];

/** Non-custom presets resolve to a concrete range immediately; "custom" waits on the calendar. */
export function presetRange(key: PresetKey, now: Date): DateRangeValue | null {
  switch (key) {
    case "currentQuarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "lastQuarter": {
      const target = subQuarters(now, 1);
      return { start: startOfQuarter(target), end: endOfQuarter(target) };
    }
    case "currentMonth":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "lastMonth": {
      const target = subMonths(now, 1);
      return { start: startOfMonth(target), end: endOfMonth(target) };
    }
    case "lastWeek": {
      const target = subWeeks(now, 1);
      return { start: startOfWeek(target), end: endOfWeek(target) };
    }
    case "custom":
      return null;
  }
}

/**
 * Move a preset-based range by one of its own calendar-aligned "unit" — a whole week,
 * month, or quarter. Custom ranges have no defined unit — callers should keep the nav
 * buttons disabled for "custom" rather than calling this.
 */
export function shiftRange(preset: PresetKey, range: DateRangeValue, direction: 1 | -1): DateRangeValue {
  switch (preset) {
    case "currentQuarter":
    case "lastQuarter": {
      const target = addQuarters(range.start, direction);
      return { start: startOfQuarter(target), end: endOfQuarter(target) };
    }
    case "currentMonth":
    case "lastMonth": {
      const target = addMonths(range.start, direction);
      return { start: startOfMonth(target), end: endOfMonth(target) };
    }
    case "lastWeek": {
      const target = addWeeks(range.start, direction);
      return { start: startOfWeek(target), end: endOfWeek(target) };
    }
    case "custom":
      return range;
  }
}

type DateRangePickerProps = {
  value: DateRangeValue;
  preset: PresetKey;
  onChange: (value: DateRangeValue, preset: PresetKey) => void;
};

/**
 * Date-range picker: a column of preset buttons (Last 7d/30d/Month/Quarter/Current
 * Quarter) plus a Custom option that reveals a range Calendar. `preset` is controlled by
 * the parent (not just this component) so the parent's prev/next nav buttons know which
 * unit to shift by and can stay in sync when a preset is picked here.
 */
export default function DateRangePicker({ value, preset, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({ from: value.start, to: value.end });
  /** The next click starts a fresh range rather than editing the one on screen. */
  const [awaitingStart, setAwaitingStart] = useState(true);

  /** Show the range currently in effect, with the next click starting over. */
  const resetDraft = () => {
    setDraft({ from: value.start, to: value.end });
    setAwaitingStart(true);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) resetDraft();
  };

  const handlePreset = (key: PresetKey) => {
    if (key === "custom") {
      resetDraft();
      onChange(value, "custom");
      return;
    }
    const range = presetRange(key, new Date());
    if (range) {
      onChange(range, key);
      setOpen(false);
    }
  };

  /**
   * Click a start, then click an end.
   *
   * The first click has to be forced to start over, because react-day-picker *edits* a
   * complete range instead of replacing it: with `from` and `to` both set, a click after
   * `from` moves only `to`, so the start could not be changed at all without first
   * clicking a day earlier than the old start. And with both ends already set, the
   * commit-and-close below fired on that same first click — one click, popover shut,
   * start unchanged. `awaitingStart` fixes both halves.
   */
  const handleCustomSelect = (range: DateRange | undefined, triggerDate: Date) => {
    if (awaitingStart) {
      setDraft({ from: triggerDate, to: undefined });
      setAwaitingStart(false);
      return;
    }

    // Clicking the start day again clears the range outright in react-day-picker. Read
    // that as a single-day range instead — a legitimate thing to ask a report for, and
    // otherwise unreachable.
    const from = range?.from ?? triggerDate;
    const to = range?.to ?? from;

    setDraft({ from, to });
    setAwaitingStart(true);
    onChange({ start: startOfDay(from), end: endOfDay(to) }, "custom");
    setOpen(false);
  };

  const label = `${format(value.start, "MMM d, yyyy")} – ${format(value.end, "MMM d, yyyy")}`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 font-normal">
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[80] flex w-auto p-0">
        <div className="flex flex-col gap-1 border-r p-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePreset(p.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap hover:bg-muted",
                preset === p.key && "bg-muted font-medium",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* `defaultMonth` opens the calendar where the range in effect actually is, rather
            than always on the current month — a past custom range used to need blind
            back-navigation to find. */}
        {preset === "custom" && (
          <Calendar
            mode="range"
            autoFocus
            selected={draft}
            onSelect={handleCustomSelect}
            numberOfMonths={2}
            defaultMonth={value.start}
            classNames={{
              range_start:
                "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:rounded-l-md [&>button]:rounded-r-none rounded-l-md bg-primary/10",
              range_end:
                "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:rounded-r-md [&>button]:rounded-l-none rounded-r-md bg-primary/10",
              range_middle: "[&>button]:rounded-none bg-primary/10",
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
