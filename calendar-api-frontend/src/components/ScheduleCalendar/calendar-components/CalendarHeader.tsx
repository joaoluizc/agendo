import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type CalendarHeaderProps = {
  /** Shown in the sticky left cell, e.g. `16 agents`. */
  agentCount: number;
  /** Highlight the current hour only when the grid is actually showing today. */
  isToday: boolean;
};

/**
 * The hour ruler: row one of the grid. Each hour spans two of the 48 half-hour
 * columns. The left cell is sticky so it stays put while the timeline scrolls — the
 * whole grid now shares one horizontal scroll container instead of one per row.
 */
const CalendarHeader = ({ agentCount, isToday }: CalendarHeaderProps) => {
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());

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
      style={{ gridTemplateColumns: "252px repeat(48, minmax(26px, 1fr))" }}
    >
      <div className="sticky left-0 z-[3] flex items-center border-r border-border bg-card px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {agentCount} {agentCount === 1 ? "agent" : "agents"}
      </div>

      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className={cn(
            "border-l border-border-subtle pb-[9px] pt-2.5 text-center text-[11px] font-semibold tabular-nums",
            isToday && currentHour === hour
              ? "bg-me-tint text-foreground"
              : "text-muted-foreground"
          )}
          style={{ gridColumn: "span 2" }}
        >
          {String(hour).padStart(2, "0")}
        </div>
      ))}
    </div>
  );
};

export default CalendarHeader;
