import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DAY_HOURS,
  HOUR_STEP,
  HourRange,
  StripSeries,
  clampRange,
  formatHour,
} from "./shiftPlanning";

type CoverageStripProps = {
  series: StripSeries;
  range: HourRange;
  meterName: string;
  meterColor: string;
  /** False when the chosen position feeds no meter — the strip is then reference only. */
  counted: boolean;
  /** Right-aligned hint above the strip. */
  hint: string;
  /**
   * Move or resize the slot. Omit for a read-only strip.
   *
   * One callback rather than one for the hour cells and another for the bar: clicking an
   * hour and dragging the bar are the same operation — move, keeping the length — and two
   * props would let two dialogs drift on what a click means.
   */
  onRangeChange?: (range: HourRange) => void;
  /**
   * Highest end hour, as hours from the anchor day's midnight. Above 24 for an overnight
   * shift, exactly as `clampRange` and the steppers take it.
   */
  maxEnd?: number;
  /** Bar height in px. */
  height?: number;
  /** The legend under the strip, when the delta needs explaining. */
  showKey?: boolean;
};

/**
 * The coverage meter from Settings, shrunk to fit a dialog.
 *
 * Grey bars are what is already scheduled, the meter-coloured cap is what saving would
 * add, the thin rule is that hour's target, and an hour that still falls short is
 * tinted. The outline marks the slot being filled.
 *
 * The grey splits in two: solid for shifts already published, faded and dashed on top for
 * the ones still in draft. Both are "scheduled" as far as the target is concerned — the
 * strip is about whether the plan covers the hour — but a bar held up entirely by drafts
 * is a plan nobody has committed to, and that difference has to be readable.
 *
 * This is the whole point of the dialog rework: the coverage row on the grid could only
 * tell you about a gap after you had already created the shift.
 *
 * Given `onRangeChange` the outline is also the control: drag its body to move the slot,
 * drag either edge to resize it, or click an hour to jump there. Same 15-minute steps and
 * same 15-minute floor as the grid, so the strip, the steppers and a resize on the grid
 * cannot disagree about what a legal slot is.
 */
const CoverageStrip = ({
  series,
  range,
  meterName,
  meterColor,
  counted,
  hint,
  onRangeChange,
  maxEnd = DAY_HOURS,
  height = 44,
  showKey,
}: CoverageStripProps) => {
  const duration = range.end - range.start;
  const scale = (value: number) => Math.round((value / series.peak) * height);
  const interactive = Boolean(onRangeChange);

  /** The box the bars sit in, and the one the outline is positioned as a percentage of. */
  const stripRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"move" | "start" | "end" | null>(
    null
  );

  /**
   * The slot moved to a new start, keeping its length.
   *
   * The **start** is clamped to `[0, maxEnd - duration]`; the range is not. Handing
   * `clampRange` a start plus the duration instead silently shortens a slot pushed against
   * the end of the day — a 4-hour slot moved to 23:00 came back as 23:00–24:00 rather than
   * stopping at 20:00–24:00, which is what clicking the last hours used to do.
   */
  const moveTo = (start: number): HourRange => {
    const anchored = Math.max(0, Math.min(maxEnd - duration, start));
    return clampRange(anchored, anchored + duration, maxEnd);
  };

  /**
   * Drag the outline: its body to move, either edge to resize.
   *
   * Delta-based like `Shift.beginResize`, so the bar follows the pointer's travel instead of
   * jumping its start under the cursor, and listeners live on `window` closing over a local
   * `latest` rather than over state. The strip stays fully controlled — every step goes out
   * through `onRangeChange` and comes back as a new `range`.
   */
  const beginDrag =
    (mode: "move" | "start" | "end") =>
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!onRangeChange) return;
      // Mouse only; the hour cells stay the touch path.
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const strip = stripRef.current;
      if (!strip) return;

      const originX = event.clientX;
      const base = { start: range.start, end: range.end };
      let latest: HourRange = base;

      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      setDragging(mode);

      const onMove = (moveEvent: PointerEvent) => {
        const pxPerHour = strip.getBoundingClientRect().width / DAY_HOURS;
        if (!pxPerHour) return;
        const delta =
          Math.round((moveEvent.clientX - originX) / pxPerHour / HOUR_STEP) *
          HOUR_STEP;

        let next: HourRange;
        if (mode === "move") {
          next = moveTo(base.start + delta);
        } else if (mode === "start") {
          next = clampRange(
            Math.max(0, Math.min(base.end - HOUR_STEP, base.start + delta)),
            base.end,
            maxEnd
          );
        } else {
          next = clampRange(
            base.start,
            Math.min(maxEnd, Math.max(base.start + HOUR_STEP, base.end + delta)),
            maxEnd
          );
        }

        // Guarded on the value changing: the dialogs rebuild every agent's status, the
        // coverage series and the agent order from this, so an unguarded write would do all
        // of that per pixel instead of per quarter hour.
        if (next.start === latest.start && next.end === latest.end) return;
        latest = next;
        onRangeChange(next);
      };

      const finish = () => {
        if (handle.hasPointerCapture(event.pointerId)) {
          handle.releasePointerCapture(event.pointerId);
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        setDragging(null);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="truncate text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
          {counted ? meterName : `${meterName} (reference)`}
        </div>
        <div className="whitespace-nowrap text-[10.5px] text-muted-foreground">
          {hint}
        </div>
      </div>

      <div className="rounded-[9px] border border-border bg-band px-2 pb-[5px] pt-2">
        <div
          ref={stripRef}
          className={cn(
            "relative",
            // Only the read-only strip clips: an overnight slot's outline runs past 100%
            // and would otherwise paint outside the card. Clipping an interactive strip
            // would cut the edge handles in half at 00:00 and at the end of the day.
            !interactive && "overflow-hidden",
            dragging === "move" && "cursor-grabbing",
            dragging &&
              dragging !== "move" &&
              "cursor-ew-resize"
          )}
        >
          <div className="flex items-end gap-px" style={{ height }}>
            {Array.from({ length: DAY_HOURS }, (_, hour) => {
              const base = series.base[hour];
              const draftBase = series.draftBase[hour];
              const delta = series.delta[hour];
              const target = series.targets[hour];
              const total = base + delta;
              const below = total < target;
              const baseHeight = scale(base);
              // Scale the committed part and take the draft part as the remainder, so the
              // two segments always add up to exactly the grey bar's height.
              const publishedHeight = scale(base - draftBase);
              const draftHeight = baseHeight - publishedHeight;

              const cell = (
                <>
                  <span
                    className={cn(
                      "absolute inset-x-0 bottom-0 bg-muted-foreground",
                      draftHeight === 0 && "rounded-t-[2px]"
                    )}
                    style={{ height: publishedHeight }}
                  />
                  {/* Dotted hatch, matching the grid's coverage row — see the comment
                      there for why this is a pattern rather than a translucent fill. */}
                  {draftHeight > 0 && (
                    <span
                      className="absolute inset-x-0 rounded-t-[2px] border-t-2 border-dotted border-muted-foreground"
                      style={{
                        height: draftHeight,
                        bottom: publishedHeight,
                        backgroundImage:
                          "repeating-linear-gradient(45deg, hsl(var(--muted-foreground)) 0 2px, transparent 2px 5px)",
                      }}
                    />
                  )}
                  {delta > 0 && (
                    <span
                      className="absolute inset-x-0 rounded-t-[2px]"
                      style={{
                        height: scale(delta),
                        bottom: baseHeight,
                        backgroundColor: meterColor,
                      }}
                    />
                  )}
                  {target > 0 && (
                    <span
                      className="absolute inset-x-0 h-[2px] bg-muted-foreground/55"
                      style={{ bottom: Math.max(0, scale(target) - 1) }}
                    />
                  )}
                </>
              );

              const title = `${formatHour(hour)} · ${total} scheduled · target ${target}${
                draftBase > 0 ? ` · ${draftBase} unpublished` : ""
              }${delta > 0 ? ` · ${delta} from this change` : ""}`;
              const className = cn(
                "relative h-full flex-1 rounded-[2px]",
                below && "bg-warn-bg"
              );

              return onRangeChange ? (
                <button
                  key={hour}
                  type="button"
                  title={title}
                  aria-label={`Move the shift to ${formatHour(hour)}`}
                  className={cn(className, "cursor-pointer")}
                  onClick={() => onRangeChange(moveTo(hour))}
                >
                  {cell}
                </button>
              ) : (
                <div key={hour} title={title} className={className}>
                  {cell}
                </div>
              );
            })}
          </div>

          {/* The slot being filled. Percentages of the same box the bars sit in, so it
              tracks the range without needing to know the cell width — and so the gesture,
              measured against that same box, moves the outline exactly as far as the
              pointer travels. */}
          <div
            className={cn(
              "absolute inset-y-0 rounded border-[1.5px] border-foreground",
              !interactive && "pointer-events-none"
            )}
            style={{
              left: `${(range.start / DAY_HOURS) * 100}%`,
              width: `${(duration / DAY_HOURS) * 100}%`,
            }}
          >
            {interactive && (
              <>
                <div
                  role="presentation"
                  title="Drag to move"
                  onPointerDown={beginDrag("move")}
                  className={cn(
                    "absolute inset-0 touch-none",
                    dragging === "move" ? "cursor-grabbing" : "cursor-grab"
                  )}
                />
                {/* Straddling the edges rather than sitting inside them: at the 15-minute
                    minimum the outline is a few pixels wide, and handles tucked inside it
                    would be unhittable. The two then cover a short slot completely, so it
                    resizes but does not body-drag — the hour cells and the steppers are
                    still there to move it. */}
                <div
                  role="presentation"
                  title="Drag to resize"
                  onPointerDown={beginDrag("start")}
                  className="absolute inset-y-0 -left-1 w-[9px] cursor-ew-resize touch-none"
                />
                <div
                  role="presentation"
                  title="Drag to resize"
                  onPointerDown={beginDrag("end")}
                  className="absolute inset-y-0 -right-1 w-[9px] cursor-ew-resize touch-none"
                />
              </>
            )}
          </div>
        </div>

        <div className="mt-1 flex">
          {Array.from({ length: DAY_HOURS }, (_, hour) => (
            <div
              key={hour}
              className="min-w-0 flex-1 text-[9px] font-semibold tabular-nums text-muted-foreground"
            >
              {hour % 6 === 0 ? String(hour).padStart(2, "0") : ""}
            </div>
          ))}
        </div>
      </div>

      {showKey && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px] bg-muted-foreground" />
            published
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-[2px] border-t border-dotted border-muted-foreground"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, hsl(var(--muted-foreground)) 0 2px, transparent 2px 5px)",
              }}
            />
            draft
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: meterColor }}
            />
            you are adding
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[2px] w-2.5 bg-muted-foreground" />
            target
          </span>
        </div>
      )}
    </div>
  );
};

export default CoverageStrip;
