import { useMemo } from "react";
import { CoverageMeter } from "@/types/coverageTypes";
import { SortedCalendar } from "@/types/shiftTypes";
import { UserSafeInfo } from "@/types/userTypes";
import {
  CoverageAgent,
  GRID_COLUMNS,
  SLOTS_PER_DAY,
  buildCoverageSeries,
  shortName,
} from "../scheduleUtils";
import { cn } from "@/lib/utils";
import { useTimeFormat } from "@/utils/timeFormat";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type CoverageRowProps = {
  meter: CoverageMeter;
  roster: UserSafeInfo[];
  shifts: SortedCalendar;
  selectedDate: Date;
  /** Draw the per-hour target ticks. */
  showTargets: boolean;
  /** This meter is the one the grid is focused on. */
  focused: boolean;
  /** Another meter is focused, so this row steps back. */
  dimmed: boolean;
  /** Focus this meter's shifts on the grid, or clear the focus if it already is. */
  onToggleFocus: () => void;
};

/** Names past this many collapse into "+N more", so a busy slot's card stays readable. */
const MAX_NAMES = 12;

/** The hover card for one half hour: the numbers, then who they are. */
const SlotDetails = ({
  slot,
  count,
  draftCount,
  target,
  agents,
}: {
  slot: number;
  count: number;
  draftCount: number;
  target: number;
  agents: CoverageAgent[];
}) => {
  const { clock } = useTimeFormat();
  const short = target - count;
  const shown = agents.slice(0, MAX_NAMES);
  const hidden = agents.length - shown.length;
  return (
    <div className="flex max-w-[260px] flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold tabular-nums">
          {clock.hourRange({ start: slot / 2, end: (slot + 1) / 2 })}
        </span>
        <span className="text-muted-foreground">target {target}</span>
      </div>
      <div className={cn(short > 0 && "text-warn")}>
        {count === 0 ? "Nobody scheduled" : `${count} scheduled`}
        {draftCount > 0 && (
          <span className="text-muted-foreground">
            {" "}
            ({draftCount} unpublished)
          </span>
        )}
        {short > 0 && ` · ${short} short`}
      </div>
      {shown.length > 0 && (
        <div className="leading-snug">
          {shown.map(({ user, draftOnly }, index) => (
            <span
              key={user.id}
              className={cn(draftOnly && "text-muted-foreground")}
            >
              {shortName(user.firstName, user.lastName)}
              {draftOnly && " (draft)"}
              {index < shown.length - 1 || hidden > 0 ? ", " : ""}
            </span>
          ))}
          {hidden > 0 && (
            <span className="text-muted-foreground">+{hidden} more</span>
          )}
        </div>
      )}
    </div>
  );
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
 *
 * Each bar is stacked: a solid base for shifts already published, and a translucent cap
 * for the coverage that only exists while drafts are unpublished. Both count toward the
 * target, because the question is whether the *plan* covers the day — but a bar that is
 * mostly cap is a day nobody has committed to yet, and that has to be visible at a
 * glance.
 */
const CoverageRow = ({
  meter,
  roster,
  shifts,
  selectedDate,
  showTargets,
  focused,
  dimmed,
  onToggleFocus,
}: CoverageRowProps) => {
  const { clock } = useTimeFormat();
  const series = useMemo(
    () => buildCoverageSeries(meter, roster, shifts, selectedDate, clock),
    [meter, roster, shifts, selectedDate, clock],
  );

  const isShort = series.summary.includes("short");

  return (
    <TooltipProvider delayDuration={150} disableHoverableContent>
      <div
        className={cn(
          "grid border-b border-border-subtle bg-band transition-opacity",
          dimmed && "opacity-50",
        )}
        style={{ gridTemplateColumns: GRID_COLUMNS }}
      >
        {/* The name is the focus control: click it to see where this meter's shifts sit on
          the grid, with everything else dimmed. A button rather than a clickable div so
          it is reachable and announced as a toggle. */}
        <button
          type="button"
          aria-pressed={focused}
          onClick={onToggleFocus}
          title={
            focused
              ? `Showing ${meter.name} shifts — click to show everything`
              : `Highlight ${meter.name} shifts on the grid`
          }
          className={cn(
            "sticky left-0 z-[3] flex flex-col justify-center border-r border-border px-3.5 text-left outline-none",
            "hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            focused
              ? "bg-muted shadow-[inset_3px_0_0_0_var(--meter-color)]"
              : "bg-band",
          )}
          style={
            {
              height: ROW_HEIGHT,
              "--meter-color": meter.color,
            } as React.CSSProperties
          }
        >
          <div className="flex items-center gap-[7px]">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: meter.color }}
            />
            <span
              className={cn(
                "truncate text-[11.5px] font-semibold",
                focused && "underline decoration-2 underline-offset-2",
              )}
              style={focused ? { textDecorationColor: meter.color } : undefined}
            >
              {meter.name}
            </span>
          </div>
          <div
            className={cn(
              "ml-[15px] truncate text-[10.5px]",
              isShort ? "text-warn" : "text-muted-foreground",
            )}
          >
            {series.summary}
          </div>
        </button>

        {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => {
          const count = series.counts[slot];
          const draftCount = series.draftCounts[slot];
          const target = series.targets[slot];
          const below = count < target;

          // Scale each segment off the same peak, then take the cap as the difference, so
          // the two never round to a total taller or shorter than the whole bar.
          const barHeight = Math.round((count / series.peak) * TRACK_HEIGHT);
          const publishedHeight = Math.round(
            ((count - draftCount) / series.peak) * TRACK_HEIGHT,
          );
          const draftHeight = barHeight - publishedHeight;
          const tickBottom =
            Math.round((target / series.peak) * TRACK_HEIGHT) - 1;

          /**
           * The bar is always the meter's own colour — published solid, draft striped.
           *
           * A shortfall is not signalled by recolouring the bar. It has two signals already:
           * the cell takes a warn tint behind the bar, and the head count above it turns
           * warn. Tinting the bar too was tried and dropped — it made each meter's two states
           * read as two different meters, which is the opposite of what the colour is for.
           */
          const fill = meter.color;

          return (
            <Tooltip key={slot}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex flex-col justify-end px-[1.5px] py-1",
                    below && "bg-warn-bg",
                  )}
                >
                  <div
                    className={cn(
                      "text-center text-[9px] font-bold leading-none tabular-nums",
                      below ? "text-warn" : "text-muted-foreground",
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
                      className="absolute bottom-0 left-0 right-0"
                      style={{
                        height: publishedHeight,
                        backgroundColor: fill,
                      }}
                    />
                    {/* The unpublished cap: a dotted hatch, capped by a dotted rule showing
                  where coverage would reach once these drafts are published.

                  Hatched rather than faded on purpose. A translucent fill of `fill` is
                  drawn over a cell whose background is already `warn-bg` when the slot is
                  short — the same hue behind the same hue, which washes out exactly in
                  the case that matters most. Full-opacity strokes with gaps read on any
                  backdrop, in either theme. */}
                    {draftHeight > 0 && (
                      <div
                        className="absolute left-0 right-0 rounded-t-[2px] border-t-2 border-dotted"
                        style={{
                          bottom: publishedHeight,
                          height: draftHeight,
                          backgroundImage: `repeating-linear-gradient(45deg, ${fill} 0 2px, transparent 2px 5px)`,
                          borderTopColor: fill,
                        }}
                      />
                    )}
                    {showTargets && target > 0 && (
                      <div
                        className="absolute left-0 right-0 h-[2px] bg-muted-foreground/50"
                        style={{ bottom: Math.max(0, tickBottom) }}
                      />
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="border border-border bg-popover text-[11.5px] text-popover-foreground shadow-md"
              >
                <SlotDetails
                  slot={slot}
                  count={count}
                  draftCount={draftCount}
                  target={target}
                  agents={series.agents[slot]}
                />
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};

export default CoverageRow;
