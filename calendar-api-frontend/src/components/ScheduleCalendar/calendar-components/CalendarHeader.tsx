import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTimeFormat } from "@/utils/timeFormat";
import { GRID_COLUMNS } from "../scheduleUtils";
import ZoneStrip from "./ZoneStrip";

type CalendarHeaderProps = {
  /** Shown in the sticky left cell, e.g. `16 agents`. */
  agentCount: number;
  /** Highlight the current hour only when the grid is actually showing today. */
  isToday: boolean;
  /** The day on screen — the hours are read against it for the timezone tooltip. */
  selectedDate: Date;
};

/**
 * The hour ruler: row one of the grid. Each hour spans two of the 48 half-hour
 * columns. The left cell is sticky so it stays put while the timeline scrolls — the
 * whole grid now shares one horizontal scroll container instead of one per row.
 *
 * Hovering an hour reads it back in each region's local time. The ruler itself stays in
 * the viewer's own time: the tooltip is for the moment you need to know what 14:00 means
 * to Manila, not a mode you work in.
 */
const CalendarHeader = ({
  agentCount,
  isToday,
  selectedDate,
}: CalendarHeaderProps) => {
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const { clock } = useTimeFormat();

  useEffect(() => {
    const timer = setInterval(
      () => setCurrentHour(new Date().getHours()),
      60_000
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="grid border-b border-border"
      style={{ gridTemplateColumns: GRID_COLUMNS }}
    >
      <div className="sticky left-0 z-[3] flex items-center border-r border-border bg-card px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {agentCount} {agentCount === 1 ? "agent" : "agents"}
      </div>

      {/* One provider for all 24, rather than one each. `skipDelayDuration` keeps the
          tooltip live while you sweep along the ruler, which is how you actually read
          it — comparing two or three hours in a row, not stopping at one. */}
      <TooltipProvider delayDuration={350} skipDelayDuration={150}>
        {Array.from({ length: 24 }, (_, hour) => {
          const instant = new Date(selectedDate);
          instant.setHours(hour, 0, 0, 0);
          return (
            <Tooltip key={hour}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "cursor-default whitespace-nowrap border-l border-border-subtle pb-[9px] pt-2.5 text-center",
                    "text-[11px] font-semibold tabular-nums transition-colors hover:bg-muted/60",
                    isToday && currentHour === hour
                      ? "bg-me-tint text-foreground"
                      : "text-muted-foreground"
                  )}
                  style={{ gridColumn: "span 2" }}
                >
                  {clock.headerHour(hour)}
                </div>
              </TooltipTrigger>
              <TooltipContent sideOffset={6} className="px-2.5 py-2">
                <ZoneStrip instant={instant} layout="list" />
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
};

export default CalendarHeader;
