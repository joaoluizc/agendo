import { cn } from "@/lib/utils";
import { useTimeFormat } from "@/utils/timeFormat";
import { readZones } from "./HourZones";

type ZoneStripProps = {
  /** The moment to read. Both callers build it from a day plus an hour on that day. */
  instant: Date;
  /**
   * `grid` pairs them two-up for sitting under a form field; `list` stacks all four for
   * a tooltip, where vertical space is free and a single column is easier to compare.
   */
  layout?: "grid" | "list";
  className?: string;
};

/**
 * The same moment, in each region the team works from.
 *
 * One component for both places it appears — under the start time in the shift dialogs
 * and in the grid ruler's tooltip — so the two can't drift into disagreeing about a
 * timezone, a label, or whether to show minutes.
 *
 * Flags rather than names because the same four flags are already the location filter in
 * the toolbar: once you have learned that row, this one needs no reading. It is also what
 * lets four regions fit under a form field without a second column of text.
 */
const ZoneStrip = ({
  instant,
  layout = "grid",
  className,
}: ZoneStripProps) => {
  const { clock } = useTimeFormat();
  return (
    <div
      className={cn(
        layout === "grid"
          ? "grid w-fit grid-cols-2 gap-x-2 gap-y-1"
          : "flex flex-col gap-[3px]",
        className
      )}
    >
      {readZones(instant, clock).map(({ label, Flag, time, dayShift }) => {
        const dayNote =
          dayShift > 0 ? " (next day)" : dayShift < 0 ? " (previous day)" : "";
        return (
          <div
            key={label}
            className="flex items-center gap-1.5"
            // The region's name is not drawn, so it has to be reachable some other way —
            // this is what a hover and a screen reader both fall back to.
            title={`${label} ${time}${dayNote}`}
          >
            <Flag className="h-[11px] w-[16px] shrink-0 rounded-[2px] ring-1 ring-inset ring-foreground/25" />
            <span className="whitespace-nowrap text-[11.5px] font-medium leading-none tabular-nums">
              {time}
            </span>
            {/* Only when it differs. A bare 02:00 that is really tomorrow morning is the
                one reading here that could send someone to the wrong day. */}
            {dayShift !== 0 && (
              <span className="text-[10px] font-medium leading-none text-warn">
                {dayShift > 0 ? "+1d" : "−1d"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ZoneStrip;
