import { useState } from "react";
import ZoneStrip from "../calendar-components/ZoneStrip";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAY_HOURS,
  HOUR_STEP,
  HourRange,
  clampRange,
  formatDuration,
  formatHour,
  parseHourInput,
} from "./shiftPlanning";

type HourFieldProps = {
  label: string;
  value: number;
  /** Narrower −/+ cells, for the edit dialog's tighter column. */
  compact?: boolean;
  /** The end field reads a bare `0` as midnight, so it needs to say which it is. */
  isEnd?: boolean;
  onStep: (delta: number) => void;
  onType: (hour: number) => void;
};

/**
 * One end of the range: steppable and typeable.
 *
 * The text lives in local draft state while focused so a half-typed `1` isn't parsed as
 * 01:00 and pushed back at you mid-keystroke. Committing happens on blur or Enter, and an
 * unreadable value silently reverts to the last good one — the field can't hold something
 * invalid, so nothing downstream has to defend against it.
 */
const HourField = ({
  label,
  value,
  compact,
  isEnd,
  onStep,
  onType,
}: HourFieldProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const cell = compact ? "w-7" : "w-[30px]";

  const commit = () => {
    if (draft !== null) {
      const parsed = parseHourInput(draft, { isEnd });
      if (parsed !== null) onType(parsed);
    }
    setDraft(null);
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10.5px] text-muted-foreground">{label}</div>
      <div className="flex h-9 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} half an hour earlier`}
          className={cn(
            "flex shrink-0 items-center justify-center text-muted-foreground hover:bg-muted",
            cell
          )}
          onClick={() => onStep(-HOUR_STEP)}
        >
          <Minus size={13} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${label} time`}
          className="min-w-0 flex-1 bg-transparent text-center text-[13.5px] font-semibold tabular-nums outline-none"
          value={draft ?? formatHour(value)}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            setDraft(formatHour(value));
            event.target.select();
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraft(null);
              event.currentTarget.blur();
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              // Step from the committed value and drop whatever was half-typed, so the
              // field never shows a number the range doesn't actually hold.
              event.preventDefault();
              setDraft(null);
              onStep(event.key === "ArrowUp" ? HOUR_STEP : -HOUR_STEP);
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} half an hour later`}
          className={cn(
            "flex shrink-0 items-center justify-center text-muted-foreground hover:bg-muted",
            cell
          )}
          onClick={() => onStep(HOUR_STEP)}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
};

type TimeRangeStepperProps = {
  range: HourRange;
  onChange: (range: HourRange) => void;
  /** Durations in hours offered as one-click presets. Omit to hide the row. */
  presets?: number[];
  compact?: boolean;
  /**
   * Highest end hour, as hours from the start day's midnight. Above 24 the end may run
   * past midnight — 25 being 01:00 the next day.
   *
   * Only the edit dialog raises this, and only for a shift that already crosses midnight,
   * so editing one stops truncating it. Left at the default everywhere else, which keeps a
   * range inside a single day.
   */
  maxEnd?: number;
  /**
   * Midnight of the day the range is measured from. Given, the start time is also shown
   * in each region's local time underneath.
   *
   * Optional so the stepper stays usable anywhere; the strip is only meaningful where the
   * range belongs to a real calendar day.
   */
  anchorDate?: Date;
};

/**
 * Start and end, in half-hour steps or typed directly.
 *
 * This replaces free-text fields parsed by chrono-node. Those accepted "tomorrow 9am" on
 * a dialog that can only edit one day, turned anything unparseable into the literal
 * string "Invalid date", and needed an imperative air-datepicker bound to a hard-coded
 * element id — which is why two of them could never coexist on a page. Typing is still
 * the fastest way to move a long shift, so it stays; what goes is accepting input the
 * shift model can't represent.
 */
/** The moment a range starting at `hours` past `anchor`'s midnight actually is. */
const startInstant = (anchor: Date, hours: number): Date => {
  const instant = new Date(anchor);
  instant.setHours(0, 0, 0, 0);
  instant.setMinutes(Math.round(hours * 60));
  return instant;
};

const TimeRangeStepper = ({
  range,
  onChange,
  presets,
  compact,
  maxEnd = DAY_HOURS,
  anchorDate,
}: TimeRangeStepperProps) => {
  const duration = range.end - range.start;
  /** The end may run past midnight, so a typed time can mean the next day. */
  const overnightAllowed = maxEnd > DAY_HOURS;
  const endsNextDay = range.end > DAY_HOURS;

  /**
   * Typing a start past the end carries the end along, keeping the duration — someone
   * moving a 4-hour shift from 09:00 to 14:00 means to move it, not to collapse it. The
   * −/+ buttons deliberately behave differently and stop half an hour short, so a single
   * nudge can never silently lengthen a shift.
   */
  const typeStart = (hour: number) =>
    onChange(
      clampRange(
        hour,
        hour >= range.end ? Math.min(maxEnd, hour + duration) : range.end,
        maxEnd
      )
    );

  /**
   * A typed end at or before the start reads as the next day when that is allowed — on a
   * 21:00 shift, "02:00" means 02:00 tomorrow, which is the only thing it can sensibly
   * mean. Otherwise it keeps the old behaviour of dragging the start back to fit, since
   * within a single day an end before the start is a mistake rather than a wrap.
   */
  const typeEnd = (hour: number) => {
    if (hour <= range.start) {
      if (overnightAllowed) {
        onChange(clampRange(range.start, hour + DAY_HOURS, maxEnd));
        return;
      }
      onChange(clampRange(Math.max(0, hour - duration), hour, maxEnd));
      return;
    }
    onChange(clampRange(range.start, hour, maxEnd));
  };

  return (
    <>
      <div className="flex gap-2">
        <HourField
          label="Start"
          value={range.start}
          compact={compact}
          onType={typeStart}
          onStep={(delta) =>
            onChange(
              clampRange(
                delta > 0
                  ? Math.min(range.end - HOUR_STEP, range.start + delta)
                  : range.start + delta,
                range.end,
                maxEnd
              )
            )
          }
        />
        {/* The label carries the day, so the number stays a plain clock time. */}
        <HourField
          label={endsNextDay ? "End · next day" : "End"}
          value={range.end}
          compact={compact}
          isEnd
          onType={typeEnd}
          onStep={(delta) =>
            onChange(
              clampRange(
                range.start,
                Math.max(range.start + HOUR_STEP, range.end + delta),
                maxEnd
              )
            )
          }
        />
      </div>

      {/* Under the start rather than between the two fields: the start is what you pick
          against someone else's working day — whether 15:00 is a reasonable hour for
          Manila — and the end follows from the duration. Always visible rather than on
          hover, because you want it while deciding, not after. */}
      {anchorDate && (
        <ZoneStrip instant={startInstant(anchorDate, range.start)} className="mt-0.5" />
      )}

      {presets && (
        <div className="flex gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={cn(
                "flex h-7 flex-1 items-center justify-center rounded-[7px] border text-[11.5px] font-semibold",
                duration === preset
                  ? "border-foreground bg-muted"
                  : "border-border hover:bg-muted"
              )}
              onClick={() =>
                onChange(
                  clampRange(
                    range.start,
                    Math.min(maxEnd, range.start + preset),
                    maxEnd
                  )
                )
              }
            >
              {formatDuration(preset)}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

export default TimeRangeStepper;
