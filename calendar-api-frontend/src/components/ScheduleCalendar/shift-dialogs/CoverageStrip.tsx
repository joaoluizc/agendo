import { cn } from "@/lib/utils";
import { DAY_HOURS, HourRange, StripSeries, formatHour } from "./shiftPlanning";

type CoverageStripProps = {
  series: StripSeries;
  range: HourRange;
  meterName: string;
  meterColor: string;
  /** False when the chosen position feeds no meter — the strip is then reference only. */
  counted: boolean;
  /** Right-aligned hint above the strip. */
  hint: string;
  /** Click an hour to move the slot there. Omit for a read-only strip. */
  onPickHour?: (hour: number) => void;
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
 * This is the whole point of the dialog rework: the coverage row on the grid could only
 * tell you about a gap after you had already created the shift.
 */
const CoverageStrip = ({
  series,
  range,
  meterName,
  meterColor,
  counted,
  hint,
  onPickHour,
  height = 44,
  showKey,
}: CoverageStripProps) => {
  const duration = range.end - range.start;
  const scale = (value: number) => Math.round((value / series.peak) * height);

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
        <div className="relative">
          <div className="flex items-end gap-px" style={{ height }}>
            {Array.from({ length: DAY_HOURS }, (_, hour) => {
              const base = series.base[hour];
              const delta = series.delta[hour];
              const target = series.targets[hour];
              const total = base + delta;
              const below = total < target;
              const baseHeight = scale(base);

              const cell = (
                <>
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-t-[2px] bg-muted-foreground"
                    style={{ height: baseHeight }}
                  />
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
                delta > 0 ? ` · ${delta} from this change` : ""
              }`;
              const className = cn(
                "relative h-full flex-1 rounded-[2px]",
                below && "bg-warn-bg"
              );

              return onPickHour ? (
                <button
                  key={hour}
                  type="button"
                  title={title}
                  aria-label={`Move the shift to ${formatHour(hour)}`}
                  className={className}
                  onClick={() => onPickHour(hour)}
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
              tracks the range without needing to know the cell width. */}
          <div
            className="pointer-events-none absolute inset-y-0 rounded border-[1.5px] border-foreground"
            style={{
              left: `${(range.start / DAY_HOURS) * 100}%`,
              width: `${(duration / DAY_HOURS) * 100}%`,
            }}
          />
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
            scheduled
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
