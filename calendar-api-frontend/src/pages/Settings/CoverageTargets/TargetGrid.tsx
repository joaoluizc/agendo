import { Button } from "@/components/ui/button";
import {
  DAY_LABELS,
  HOURS_PER_DAY,
  MAX_TARGET,
  isWeekend,
  localZoneLabel,
  summarizeTargets,
} from "@/utils/coverageTargets";
import { cn } from "@/lib/utils";

type TargetGridProps = {
  /** Targets in the admin's local time — the parent converts to/from UTC. */
  local: number[][];
  color: string;
  onChange: (local: number[][]) => void;
};

const MONDAY = 1;
const WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * The per-hour target editor: 7 rows × 24 hours, Sunday-first to match the stored
 * day index (and `User.workHours.dayOfWeek`) rather than the design mock's Mon-first
 * grid — one day convention across agendo is worth more than matching the mock here.
 *
 * Columns are the viewer's *local* hours. Storage is UTC, so an admin in another
 * timezone editing the same meter sees the same absolute targets on their own clock;
 * the caption under the grid names the zone so that is never implicit.
 */
const TargetGrid = ({ local, color, onChange }: TargetGridProps) => {
  const { total, peak } = summarizeTargets(local);

  const setCell = (day: number, hour: number, value: number) => {
    const next = local.map((row) => [...row]);
    next[day][hour] = Math.min(MAX_TARGET, Math.max(0, value));
    onChange(next);
  };

  const copyMondayToWeekdays = () => {
    const next = local.map((row) => [...row]);
    WEEKDAYS.forEach((day) => {
      next[day] = [...local[MONDAY]];
    });
    onChange(next);
  };

  const clear = () =>
    onChange(local.map((row) => row.map(() => 0)));

  /** Fill strength tracks the value against the meter's own peak. */
  const cellStyle = (value: number) => {
    if (value === 0) return undefined;
    const mix = 18 + (value / Math.max(1, peak)) * 62;
    return {
      backgroundColor: `color-mix(in srgb, ${color} ${mix}%, hsl(var(--card)))`,
      color: mix > 60 ? "#ffffff" : undefined,
    };
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[12.5px] font-semibold">
            Agents needed per hour
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            click to raise, right-click to lower
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-[26px] rounded-[7px] px-2.5 text-[11.5px]"
            onClick={copyMondayToWeekdays}
          >
            Copy Mon → weekdays
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-[26px] rounded-[7px] px-2.5 text-[11.5px]"
            onClick={clear}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[9px] border border-border">
        <div
          className="min-w-[724px]"
          style={{
            display: "grid",
            gridTemplateColumns: `52px repeat(${HOURS_PER_DAY}, minmax(28px, 1fr))`,
          }}
        >
          <div className="border-b border-border bg-card" />
          {Array.from({ length: HOURS_PER_DAY }, (_, hour) => (
            <div
              key={`head-${hour}`}
              className="border-b border-border py-[7px] text-center text-[10px] font-semibold tabular-nums text-muted-foreground"
            >
              {String(hour).padStart(2, "0")}
            </div>
          ))}

          {DAY_LABELS.map((label, day) => (
            <div key={label} className="contents">
              <div
                className={cn(
                  "flex items-center px-2.5 text-[11px] font-semibold",
                  day < 6 && "border-b border-border",
                  isWeekend(day) && "bg-band text-muted-foreground"
                )}
              >
                {label}
              </div>
              {Array.from({ length: HOURS_PER_DAY }, (_, hour) => {
                const value = local[day]?.[hour] ?? 0;
                return (
                  <button
                    key={`${label}-${hour}`}
                    type="button"
                    aria-label={`${label} ${String(hour).padStart(2, "0")}:00 — ${value} agents`}
                    title={`${label} ${String(hour).padStart(2, "0")}:00 — ${value} agents`}
                    className={cn(
                      "h-[28px] border-l border-border-subtle text-[11px] font-semibold tabular-nums",
                      day < 6 && "border-b border-border",
                      value === 0 &&
                        (isWeekend(day) ? "bg-band" : "bg-card") +
                          " text-muted-foreground/40"
                    )}
                    style={cellStyle(value)}
                    onClick={() => setCell(day, hour, value + 1)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCell(day, hour, value - 1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" || e.key === "+") {
                        e.preventDefault();
                        setCell(day, hour, value + 1);
                      } else if (e.key === "ArrowDown" || e.key === "-") {
                        e.preventDefault();
                        setCell(day, hour, value - 1);
                      } else if (/^[0-8]$/.test(e.key)) {
                        e.preventDefault();
                        setCell(day, hour, Number(e.key));
                      }
                    }}
                  >
                    {value === 0 ? "·" : value}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="text-[11.5px] text-muted-foreground">
        {total} agent-hours per week · peak {peak} at once · times shown in your
        local zone ({localZoneLabel()})
      </div>
    </div>
  );
};

export default TargetGrid;
