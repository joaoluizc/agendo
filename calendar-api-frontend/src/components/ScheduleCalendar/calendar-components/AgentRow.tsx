import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { CalendarIcon, Check, Minus, RepeatIcon } from "lucide-react";
import { Markup } from "interweave";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { UserSafeInfo } from "@/types/userTypes";
import { Shift as ShiftType } from "@/types/shiftTypes";
import { GCalEventWithGrid } from "@/types/gCalendarTypes";
import { Position } from "@/types/positionTypes";
import { Shift } from "../Shift";
import EmptySlot from "./EmptySlot";
import {
  GRID_COLUMNS,
  SLOT_COLUMNS,
  shortName,
  columnSpan,
  columnStart,
  dayBounds,
  packLanes,
  prettyGCalTime,
  scheduledHours,
} from "../scheduleUtils";
import { cn } from "@/lib/utils";
import { useSchedule } from "@/providers/useSchedule";
import { formatHour } from "../shift-dialogs/shiftPlanning";

type AgentRowProps = {
  user: UserSafeInfo;
  shifts: ShiftType[];
  events: GCalEventWithGrid[];
  positionsById: Map<string, Position>;
  selectedDate: Date;
  isVisitor: boolean;
  reloadScheduleCalendar: () => void;
};

/** Fixed geometry for variant B. */
/**
 * Shift lane height.
 *
 * Sized against the two-line block (time above position), which is the tallest thing a
 * lane holds. Keep the arithmetic in mind before tuning it: at `leading-tight` those lines
 * come to 10px × 1.25 + 10.5px × 1.25 ≈ 25.6px, so 26 fits with a hair to spare where 24
 * clipped both edges. ~28 is where it would gain a visible 1px margin top and bottom.
 *
 * Every row's height derives from this, so all of them grow together.
 */
const SHIFT_LANE = 26;
const EVENT_LANE = 9;
const LANE_GAP = 2;
const LANE_PADDING = 5;

/**
 * Hour-line pitch for the lane background, as a fraction of the lane's own width.
 *
 * It has to be relative: the 48 half-hour columns are `minmax(SLOT_MIN_PX, 1fr)`, so an hour
 * is only 52px when the track sits at its 1500px minimum and stretches past that on
 * any wider window. A fixed pixel pitch drifts further out of step with the hour ruler
 * every hour across the day.
 */
const HOUR_LINE_PITCH = "calc(100% / 24)";

const formatHours = (hours: number) => {
  const rounded = Math.round(hours * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * One agent's row: a sticky identity cell plus a lane-packed timeline.
 *
 * Shifts that overlap stack into separate lanes rather than painting over each
 * other, and the row's height falls out of the lane count — which is what replaces
 * the old ragged `rem` heights derived from an adjacent-pair overlap guess.
 */
const AgentRow = ({
  user,
  shifts,
  events,
  positionsById,
  selectedDate,
  isVisitor,
  reloadScheduleCalendar,
}: AgentRowProps) => {
  const {
    shiftInDrag,
    dropTarget,
    isBulkSelectorActive,
    bulkSelectedShifts,
    setBulkSelectedShifts,
  } = useSchedule();

  const shiftLanes = useMemo(() => {
    const spans = shifts.map((shift) => ({
      shift,
      ...dayBounds(shift.startTime, shift.endTime, selectedDate),
    }));
    return packLanes(spans);
  }, [shifts, selectedDate]);

  const eventLanes = useMemo(() => {
    const spans = events.map((event) => ({
      event,
      ...dayBounds(event.start.dateTime, event.end.dateTime, selectedDate),
    }));
    return packLanes(spans);
  }, [events, selectedDate]);

  const shiftLaneCount = shifts.length === 0 ? 1 : shiftLanes.laneCount;
  const eventLaneCount = events.length === 0 ? 0 : eventLanes.laneCount;

  const totalHours = useMemo(
    () => scheduledHours(shifts, positionsById, selectedDate),
    [shifts, positionsById, selectedDate]
  );

  /**
   * Select every shift in this row, in one click.
   *
   * A three-state toggle rather than a "select all" button, because the state is the useful
   * half: at a glance you can see which agents are fully in the selection, which are
   * partly in, and which are untouched — an action-only button tells you none of that. It
   * is hand-rolled rather than the shared `Checkbox` because that one always renders a
   * check and only styles `data-[state=checked]`, so a partial state would be
   * indistinguishable from a full one, and bending a primitive used across Settings for
   * this row's sake is the wrong trade.
   *
   * Scoped to the shifts on screen, which is all this row has — selecting a day at a time
   * is the point, and it keeps the selection from ever spanning days.
   */
  const rowShiftIds = useMemo(
    () => new Set(shifts.map((shift) => shift._id)),
    [shifts]
  );
  const selectedInRow = bulkSelectedShifts.filter((shift) =>
    rowShiftIds.has(shift._id)
  ).length;
  const allRowSelected = shifts.length > 0 && selectedInRow === shifts.length;
  const someRowSelected = selectedInRow > 0 && !allRowSelected;

  const toggleRowSelection = () => {
    if (allRowSelected) {
      setBulkSelectedShifts(
        bulkSelectedShifts.filter((shift) => !rowShiftIds.has(shift._id))
      );
      return;
    }
    const alreadySelected = new Set(
      bulkSelectedShifts.map((shift) => shift._id)
    );
    setBulkSelectedShifts([
      ...bulkSelectedShifts,
      ...shifts.filter((shift) => !alreadySelected.has(shift._id)),
    ]);
  };

  /**
   * Where a dragged shift would land in this row, if it would land here at all.
   *
   * Drawn from the drop target plus the dragged shift's own duration rather than stored
   * anywhere: the browser's drag image is a snapshot of the block under the cursor, which
   * shows what is moving and nothing about where it goes.
   *
   * `dropTarget.hour` is a fractional hour on 15-minute boundaries, produced by the same
   * function the drop itself uses — so what is previewed is exactly what lands.
   */
  const ghost = useMemo(() => {
    const dragged = shiftInDrag?.data;
    if (!dragged || dropTarget?.userId !== String(user.id)) return null;
    const hours =
      (new Date(dragged.endTime).getTime() -
        new Date(dragged.startTime).getTime()) /
      3_600_000;
    const start = dropTarget.hour;
    return {
      start,
      end: Math.min(24, start + hours),
      /**
       * The drop would run past midnight. The preview stops at the edge of the day, the
       * same way a real overnight block does, and loses its right corner to say so.
       */
      clipped: start + hours > 24,
      label: positionsById.get(String(dragged.positionId))?.name ?? "",
      /** Already sitting exactly here, so the drop would change nothing. */
      noop:
        String(dragged.userId) === String(user.id) &&
        dayBounds(dragged.startTime, dragged.endTime, selectedDate).start ===
          start,
    };
  }, [shiftInDrag?.data, dropTarget, user.id, positionsById, selectedDate]);

  const rowHeight =
    shiftLaneCount * SHIFT_LANE +
    eventLaneCount * EVENT_LANE +
    (shiftLaneCount + eventLaneCount - 1) * LANE_GAP +
    LANE_PADDING * 2;

  return (
    <div
      className={cn(
        "grid border-b border-border-subtle",
        isVisitor ? "bg-me-tint" : "bg-card"
      )}
      style={{ gridTemplateColumns: GRID_COLUMNS }}
    >
      <div
        className={cn(
          "sticky left-0 z-[3] flex items-center gap-[9px] border-r border-border px-3.5",
          isVisitor ? "bg-me-tint" : "bg-card"
        )}
        style={{ height: rowHeight }}
      >
        <Avatar className="shrink-0">
          <AvatarImage
            src={user.imageUrl}
            className="h-[22px] w-[22px] rounded-full"
          />
          <AvatarFallback className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-muted text-[10.5px] font-semibold text-foreground">
            {`${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          {/* First name plus a last initial. The label column gave up 84px so the day
              could fit a 1425px screen without scrolling sideways, and the name is what
              can afford it — "Alexandre B." identifies an agent on a team of 19 as well as
              the full name does. The title carries the whole name for the ambiguous case. */}
          <div
            className="truncate text-[11.5px] font-semibold leading-tight"
            title={`${user.firstName} ${user.lastName}`}
          >
            {shortName(user.firstName, user.lastName)}
          </div>
          <div className="truncate text-[10.5px] leading-tight text-muted-foreground">
            {totalHours > 0
              ? `${formatHours(totalHours)}h scheduled`
              : "unavailable"}
          </div>
        </div>

        {/* Sits at the trailing edge rather than before the avatar so entering select mode
            does not shove the name and hours sideways. Hidden on a row with nothing to
            select — an empty row has no "all" to check. */}
        {isBulkSelectorActive && shifts.length > 0 && (
          <button
            type="button"
            aria-pressed={allRowSelected}
            title={
              allRowSelected
                ? `Deselect ${shifts.length} shift${shifts.length === 1 ? "" : "s"}`
                : `Select all ${shifts.length} shift${shifts.length === 1 ? "" : "s"}`
            }
            aria-label={`${allRowSelected ? "Deselect" : "Select"} all shifts for ${user.firstName} ${user.lastName}`}
            onClick={toggleRowSelection}
            className={cn(
              "ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
              allRowSelected
                ? "border-primary bg-primary text-primary-foreground"
                : someRowSelected
                  ? "border-primary text-primary"
                  : "border-muted-foreground/50 text-transparent hover:border-primary"
            )}
          >
            {allRowSelected ? (
              <Check className="h-3.5 w-3.5" />
            ) : someRowSelected ? (
              <Minus className="h-3.5 w-3.5" />
            ) : null}
          </button>
        )}
      </div>

      {/* The timeline. EmptySlot cells sit underneath as the click/drop target; the
          lane grid floats above with pointer-events off so gaps fall through. */}
      <div
        className="relative"
        style={{ gridColumn: "span 48", height: rowHeight }}
      >
        {/* Drop preview. Positioned as a percentage of the timeline, which is exactly 24
            hours wide, so it needs no lane packing and cannot disagree with the ruler. It
            spans the row's full height on purpose — the question being answered is "which
            agent, and when", not "which lane". */}
        {ghost && (
          <div
            className={cn(
              "pointer-events-none absolute inset-y-[3px] z-[2] flex items-center overflow-hidden rounded-[6px] border-[1.5px] border-dashed px-1.5",
              ghost.noop
                ? "border-border bg-muted/30"
                : "border-foreground/70 bg-foreground/[0.09]",
              ghost.clipped && "rounded-r-none border-r-0"
            )}
            style={{
              left: `${(ghost.start / 24) * 100}%`,
              width: `${((ghost.end - ghost.start) / 24) * 100}%`,
            }}
          >
            <span className="truncate text-[10px] font-semibold tabular-nums">
              {formatHour(ghost.start)}
              {ghost.label ? ` · ${ghost.label}` : ""}
            </span>
          </div>
        )}

        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <EmptySlot
              key={`${user.id}-${hour}`}
              userId={String(user.id)}
              currentHour={hour}
              selectedDate={selectedDate}
            />
          ))}
        </div>

        <div
          className="pointer-events-none absolute inset-0 grid"
          style={{
            gridTemplateColumns: SLOT_COLUMNS,
            gridTemplateRows: `repeat(${shiftLaneCount}, ${SHIFT_LANE}px) repeat(${eventLaneCount}, ${EVENT_LANE}px)`,
            gap: `${LANE_GAP}px 0`,
            padding: `${LANE_PADDING}px 0`,
            backgroundImage: `repeating-linear-gradient(to right, hsl(var(--border-subtle)) 0 1px, transparent 1px ${HOUR_LINE_PITCH})`,
          }}
        >
          {shiftLanes.placed.map(({ item, lane }) => (
            <Shift
              key={item.shift._id}
              shift={item.shift}
              lane={lane}
              selectedDate={selectedDate}
              reloadScheduleCalendar={reloadScheduleCalendar}
            />
          ))}

          {eventLanes.placed.map(({ item, lane }) => {
            const event = item.event;
            return (
              <HoverCard key={event.id}>
                <HoverCardTrigger asChild>
                  <div
                    className="pointer-events-auto mx-[2px] flex items-center overflow-hidden truncate rounded-[4px] border border-border bg-muted px-1 text-[9.5px] font-medium leading-none text-muted-foreground"
                    title={event.summary}
                    style={{
                      gridColumnStart: columnStart(item.start),
                      gridColumnEnd: `span ${columnSpan(item)}`,
                      gridRowStart: shiftLaneCount + lane,
                    }}
                  >
                    <span className="truncate">{event.summary}</span>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="grid w-full max-w-md gap-6 p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex aspect-square w-12 items-center justify-center rounded-md bg-muted">
                      <CalendarIcon className="h-6 w-6" />
                    </div>
                    <div className="grid gap-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold">
                          {event.summary}
                        </h3>
                        {event.recurringEventId && (
                          <RepeatIcon className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarIcon className="h-4 w-4" />
                        <span>
                          {prettyGCalTime(
                            event.start.dateTime,
                            event.end.dateTime
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="max-h-28 truncate text-muted-foreground">
                    <Markup content={event.description} />
                  </p>
                  <div className="flex gap-4">
                    <Button asChild variant="link">
                      <a href={event.htmlLink} target="_blank" rel="noreferrer">
                        See more
                      </a>
                    </Button>
                    {event.hangoutLink && (
                      <Button>
                        <a
                          href={event.hangoutLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Join meeting
                        </a>
                      </Button>
                    )}
                  </div>
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AgentRow;
