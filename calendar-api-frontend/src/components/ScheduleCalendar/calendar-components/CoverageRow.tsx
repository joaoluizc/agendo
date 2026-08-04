import { useMemo } from "react";
import { CoverageMeter } from "@/types/coverageTypes";
import { SortedCalendar } from "@/types/shiftTypes";
import { UserSafeInfo } from "@/types/userTypes";
import {
  SLOTS_PER_DAY,
  buildCoverageSeries,
  formatSlotTime,
} from "../scheduleUtils";
import { cn } from "@/lib/utils";

type CoverageRowProps = {
  meter: CoverageMeter;
  roster: UserSafeInfo[];
  shifts: SortedCalendar;
  selectedDate: Date;
  /** Draw the per-hour target ticks. */
  showTargets: boolean;
};

const ROW_HEIGHT = 52;
const COUNT_HEIGHT = 13;
const CELL_PADDING_Y = 4;
const TRACK_HEIGHT = ROW_HEIGHT - COUNT_HEIGHT - CELL_PADDING_Y * 2;

/**
 * One histogram row per configured meter: how many agents are on the meter's
 * positions in each half hour, measured against that half hour's target.
 *
 * This is the answer to "is 14:00–16:00 covered?", which the old grid had no way of
 * showing. Admin-only — the caller decides whether to render it at all.
 */
const CoverageRow = ({
  meter,
  roster,
  shifts,
  selectedDate,
  showTargets,
}: CoverageRowProps) => {
  const series = useMemo(
    () => buildCoverageSeries(meter, roster, shifts, selectedDate),
    [meter, roster, shifts, selectedDate]
  );

  const isShort = series.summary.includes("short");

  return (
    <div
      className="grid border-b border-border-subtle bg-band"
      style={{ gridTemplateColumns: "252px repeat(48, minmax(26px, 1fr))" }}
    >
      <div
        className="sticky left-0 z-[3] flex flex-col justify-center border-r border-border bg-band px-3.5"
        style={{ height: ROW_HEIGHT }}
      >
        <div className="flex items-center gap-[7px]">
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: meter.color }}
          />
          <span className="truncate text-[11.5px] font-semibold">
            {meter.name}
          </span>
        </div>
        <div
          className={cn(
            "ml-[15px] truncate text-[10.5px]",
            isShort ? "text-warn" : "text-muted-foreground"
          )}
        >
          {series.summary}
        </div>
      </div>

      {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => {
        const count = series.counts[slot];
        const target = series.targets[slot];
        const below = count < target;

        const barHeight = Math.round((count / series.peak) * TRACK_HEIGHT);
        const tickBottom =
          Math.round((target / series.peak) * TRACK_HEIGHT) - 1;

        return (
          <div
            key={slot}
            className={cn(
              "flex flex-col justify-end px-[1.5px] py-1",
              below && "bg-warn-bg"
            )}
            title={`${formatSlotTime(slot)} · ${count} scheduled · target ${target}`}
          >
            <div
              className={cn(
                "text-center text-[9px] font-bold leading-none tabular-nums",
                below ? "text-warn" : "text-muted-foreground"
              )}
              style={{ height: COUNT_HEIGHT }}
            >
              {count > 0 ? count : ""}
            </div>
            <div
              className="relative rounded-[2px] border-b border-border-subtle"
              style={{ height: TRACK_HEIGHT }}
            >
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-[2px]"
                style={{
                  height: barHeight,
                  backgroundColor: below ? "hsl(var(--warn))" : meter.color,
                }}
              />
              {showTargets && target > 0 && (
                <div
                  className="absolute left-0 right-0 h-[2px] bg-muted-foreground/50"
                  style={{ bottom: Math.max(0, tickBottom) }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CoverageRow;
