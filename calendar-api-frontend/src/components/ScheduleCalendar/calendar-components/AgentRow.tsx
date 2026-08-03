import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { CalendarIcon, RepeatIcon } from "lucide-react";
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
  columnSpan,
  columnStart,
  dayBounds,
  packLanes,
  prettyGCalTime,
  scheduledHours,
} from "../scheduleUtils";
import { cn } from "@/lib/utils";

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
const SHIFT_LANE = 22;
const EVENT_LANE = 9;
const LANE_GAP = 2;
const LANE_PADDING = 5;

/**
 * Hour-line pitch for the lane background, as a fraction of the lane's own width.
 *
 * It has to be relative: the 48 half-hour columns are `minmax(26px, 1fr)`, so an hour
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
      style={{ gridTemplateColumns: "252px repeat(48, minmax(26px, 1fr))" }}
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
          <div className="truncate text-[12.5px] font-semibold leading-tight">
            {`${user.firstName} ${user.lastName}`}
          </div>
          <div className="truncate text-[10.5px] leading-tight text-muted-foreground">
            {totalHours > 0
              ? `${formatHours(totalHours)}h scheduled`
              : "unavailable"}
          </div>
        </div>
      </div>

      {/* The timeline. EmptySlot cells sit underneath as the click/drop target; the
          lane grid floats above with pointer-events off so gaps fall through. */}
      <div
        className="relative"
        style={{ gridColumn: "span 48", height: rowHeight }}
      >
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
            gridTemplateColumns: "repeat(48, minmax(26px, 1fr))",
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
