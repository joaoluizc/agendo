import utils from "../../utils/utils.ts";
// import { User } from '../../types/slingTypes.ts';
import { Shift, SortedCalendar } from "../../types/shiftTypes.ts";
import {
  CalendarUser,
  FetchedCalendarUser,
  GCalendarEvent,
  GCalendarEventList,
} from "@/types/gCalendarTypes.ts";
import { Position } from "@/types/positionTypes.ts";
import { CoverageMeter } from "@/types/coverageTypes.ts";
import { UserSafeInfo } from "@/types/userTypes.ts";
import { targetAt } from "@/utils/coverageTargets.ts";
import { toast } from "sonner";

type GetCalEventsSuccessResponse = {
  events: CalendarUser[];
  errors: {
    userId: string;
    firstName: string;
    lastName: string;
    error: string;
  }[];
};

type GetCalEventsEmptyResponse = {
  message: string;
  errors: {
    userId: string;
    firstName: string;
    lastName: string;
    error: string;
  }[];
};

type GetCalEventsErrorResponse = {
  error: string;
};

type GetCalEventsResponse =
  | GetCalEventsSuccessResponse
  | GetCalEventsErrorResponse
  | GetCalEventsEmptyResponse;

/** Fetches shifts for a given date and sets the state
 * @param {Date} date - date selected by the user
 * @param {Function} setIsLoading - function to set loading state
 * @param {Function} setSortedCalendar - function to set the state with sorted shifts
 * @returns {Promise<User[]>}
 */
export const getShifts = async (date: Date): Promise<SortedCalendar> => {
  const { startOfDayISO, endOfDayISO } = utils.getLocalTimeframeISO(date);

  const endpoint = `/api/shift/range?startTime=${startOfDayISO}&endTime=${endOfDayISO}&group=user`;
  const response = await fetch(endpoint, {
    method: "GET",
    credentials: "include",
    mode: "cors",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch shifts" + response.statusText);
  }

  const data: SortedCalendar = await response.json();
  // const sortedData = sortShifts(data);

  return data;
};

/** Fetches Google Calendar events for a given date and sets the state
 * @param {Function} setgCalendarEvents - function to set the state with Google Calendar events
 * @param {Date} date - date selected by the user
 * @returns {Promise<CalendarUser[]>}
 */
export const getGCalendarEvents = async (
  date: Date
): Promise<CalendarUser[]> => {
  const { todayISO: selectedDate } = utils.getLocalTimeframeISO(date);
  const response = await fetch(
    `/api/gcalendar/all-events?date=${selectedDate}`
  );

  const data: GetCalEventsResponse = await response.json();

  if (response.status === 204 && "message" in data) {
    toast.error(data.message);

    data.errors.forEach((user) => {
      toast.error(`Failed to fetch calendar events for ${user.firstName}`, {
        description: user.error,
      });
    });
    return [];
  }

  if (response.status === 500 && "error" in data) {
    toast.error(data.error);
    return [];
  }

  let filteredData: CalendarUser[] = [];
  if (response.status === 200 && "events" in data) {
    // Filter out events that are not of type 'default' and do not match the selected date
    if (data.events.length !== 0) {
      filteredData = data.events.map((user: FetchedCalendarUser) => {
        const filteredEvents = user.events.filter((event) => {
          const eventDate = new Date(event.start.dateTime).getDate();
          const selectedDate = date.getDate();
          return (
            event.eventType !== "birthday" &&
            event.eventType !== "workingLocation" &&
            eventDate === selectedDate
          );
        });

        const { numberOfEventOverlaps, eventsOrganized } = assignEventLanes(
          filteredEvents,
          date
        );

        return {
          ...user,
          numberOfEventOverlaps,
          events: eventsOrganized,
        };
      });
    }

    data?.errors.forEach((user) => {
      toast.error(`Failed to fetch calendar events for ${user.firstName}`, {
        description: user.error,
      });
    });

    return filteredData;
  }

  return filteredData;
};

/** Formats Date as 'pretty' string, removing minutes for round hours
 * @param {string} date - date to format
 * @returns {string} - formatted date
 * examples:
 * date: 2021-09-30T10:00:00Z -> 10 AM
 * date: 2021-09-30T10:30:00Z -> 10:30 AM
 */
const prettyHour = (date: string): string => {
  const dateObj = new Date(date);
  let timeString = dateObj.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (timeString.endsWith(":00 AM") || timeString.endsWith(":00 PM")) {
    timeString = timeString.replace(":00", "");
  }

  return timeString;
};

export const prettyTimeRange = (startRaw: string, endRaw: string) => {
  const start = prettyHour(startRaw);
  const end = prettyHour(endRaw);
  if (start.slice(-2) === end.slice(-2)) {
    return `${start.slice(0, -3)}-${end.slice(0, -3)} ${end.slice(-2)}`;
  }
  return `${start} - ${end}`;
};

/** Formats Google Calendar event start and end times as 'pretty' string
 * @param {string} start - start time of the event
 * @param {string} end - end time of the event
 * @returns {string} - formatted time range
 * examples:
 * startDate: 2021-09-30T10:00:00-04:00 -> Thu, Sep 30, 10:00 AM
 * endDate: 2021-09-30T12:00:00-04:00 -> 12:00 PM
 * result: Thu, Sep 30, 10:00 AM to 12:00 PM
 */
export const prettyGCalTime = (start: string, end: string) => {
  const startAsDate = new Date(start);
  const endAsDate = new Date(end);
  const firstPart = startAsDate.toLocaleDateString("en-us", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const secondPart = endAsDate.toLocaleTimeString("en-us", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${firstPart} to ${secondPart}`;
};

/* -------------------------------------------------------------------------- */
/* Grid math                                                                  */
/* -------------------------------------------------------------------------- */

/** The timeline is 48 half-hour columns wide, one per slot. */
export const SLOTS_PER_DAY = 48;

/** A span in fractional local hours since the selected day's midnight, 0..24. */
export type DaySpan = {
  start: number;
  end: number;
  /** True when the item actually began before this day (clipped at column 1). */
  clippedStart: boolean;
  /** True when it runs past midnight (clipped at column 48). */
  clippedEnd: boolean;
};

export const startOfLocalDay = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

/**
 * Clamp an absolute start/end onto the selected day's 0..24 hour axis.
 *
 * Overnight shifts are the reason this exists: a shift that began yesterday has to
 * render from column 1 rather than from whatever `getHours()` happens to return, and
 * one that runs past midnight has to stop at column 48. The `clipped*` flags let the
 * block drop the rounded corner on the side it continues from.
 */
export const dayBounds = (
  startIso: string,
  endIso: string,
  selectedDate: Date
): DaySpan => {
  const dayStart = startOfLocalDay(selectedDate).getTime();
  const startHours = (new Date(startIso).getTime() - dayStart) / 3_600_000;
  const endHours = (new Date(endIso).getTime() - dayStart) / 3_600_000;
  const clamp = (value: number) => Math.min(24, Math.max(0, value));

  return {
    start: clamp(startHours),
    end: clamp(endHours),
    clippedStart: startHours < 0,
    clippedEnd: endHours > 24,
  };
};

/** 1-based CSS grid column for an hour offset, on the 48-column half-hour track. */
export const columnStart = (hour: number) =>
  Math.min(SLOTS_PER_DAY, Math.floor(hour * 2) + 1);

/** Column span for a duration, never less than one half-hour cell. */
export const columnSpan = (span: DaySpan) => {
  const cells = Math.round((span.end - span.start) * 2);
  const start = columnStart(span.start);
  return Math.max(1, Math.min(cells, SLOTS_PER_DAY - start + 1));
};

export type LanePlacement<T> = { item: T; lane: number };

/**
 * Greedy first-fit lane packing: each item drops into the first lane where it
 * overlaps nothing, otherwise it opens a new one. Used for both shifts and Google
 * Calendar events.
 *
 * This replaces the old `calculateShiftOverlapAmount`, which only compared adjacent
 * pairs (so it missed a shift overlapping a non-neighbour) and only produced a count,
 * leaving blocks to paint over each other. Here every item gets an explicit lane, and
 * `laneCount` gives the row its exact height instead of a ragged `rem` estimate.
 */
export const packLanes = <T extends { start: number; end: number }>(
  items: T[]
): { laneCount: number; placed: LanePlacement<T>[] } => {
  const lanes: T[][] = [];

  const placed = items.map((item) => {
    for (let i = 0; i < lanes.length; i++) {
      const fits = lanes[i].every(
        (other) => other.end <= item.start || item.end <= other.start
      );
      if (fits) {
        lanes[i].push(item);
        return { item, lane: i + 1 };
      }
    }
    lanes.push([item]);
    return { item, lane: lanes.length };
  });

  return { laneCount: Math.max(1, lanes.length), placed };
};

/** Lane-pack a user's Google Calendar events, writing the lane onto `gridRowNumber`. */
const assignEventLanes = (events: GCalendarEventList, date: Date) => {
  const spans = events.map((event) => ({
    event,
    ...dayBounds(event.start.dateTime, event.end.dateTime, date),
  }));
  const { laneCount, placed } = packLanes(spans);

  return {
    numberOfEventOverlaps: events.length === 0 ? 0 : laneCount,
    eventsOrganized: placed.map(
      ({ item, lane }): GCalendarEvent => ({
        ...item.event,
        gridRowNumber: lane,
      })
    ),
  };
};

/* -------------------------------------------------------------------------- */
/* Coverage                                                                   */
/* -------------------------------------------------------------------------- */

export type CoverageSeries = {
  counts: number[];
  targets: number[];
  peak: number;
  summary: string;
  hasTarget: boolean;
};

/**
 * Slot 18 -> `09:00`, slot 19 -> `09:30`.
 *
 * Slot 48 is a valid *end* bound and renders as `24:00`, not `00:00` — a range that
 * runs to midnight has to read as ending after it started.
 */
export const formatSlotTime = (slot: number) => {
  const hour = String(Math.floor(slot / 2)).padStart(2, "0");
  const minute = slot % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
};

/**
 * The one-line verdict in a coverage row's sticky cell. Reports the widest stretch
 * that falls short (earliest wins a tie) and how deep the gap gets inside it, since
 * that is what an admin scanning the row actually needs to act on.
 */
const summarize = (counts: number[], targets: number[], hasTarget: boolean) => {
  if (!hasTarget) return "no target set";

  type ShortRun = { from: number; to: number; deficit: number };
  const runs: ShortRun[] = [];
  let open: ShortRun | null = null;

  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    if (counts[slot] < targets[slot]) {
      const deficit = targets[slot] - counts[slot];
      if (open) {
        open.to = slot + 1;
        open.deficit = Math.max(open.deficit, deficit);
      } else {
        open = { from: slot, to: slot + 1, deficit };
        runs.push(open);
      }
    } else {
      open = null;
    }
  }

  if (runs.length === 0) return "target met all day";

  // Widest gap wins; earliest breaks a tie, since that is the one to fix first.
  const worst = runs.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
  if (worst.from === 0 && worst.to === SLOTS_PER_DAY) {
    return `${worst.deficit} short all day`;
  }
  return `${worst.deficit} short between ${formatSlotTime(
    worst.from
  )} and ${formatSlotTime(worst.to)}`;
};

/**
 * Head-count per half hour for one meter, against that meter's target.
 *
 * An agent counts in a slot when they have a shift on one of the meter's positions
 * that fully covers the slot -- a shift ending at 09:15 does not cover 09:00-09:30.
 *
 * Targets are resolved from each slot's absolute instant rather than from a day/hour
 * label, so this stays correct when the local day straddles two UTC days (which it
 * does for most of the world) and across DST. See src/utils/coverageTargets.ts.
 */
export const buildCoverageSeries = (
  meter: CoverageMeter,
  roster: UserSafeInfo[],
  shifts: SortedCalendar,
  selectedDate: Date
): CoverageSeries => {
  const meterPositions = new Set(meter.positionIds.map(String));
  const dayStart = startOfLocalDay(selectedDate).getTime();

  const spansByUser = roster.map((user) =>
    (shifts[user.id] ?? [])
      .filter((shift) => meterPositions.has(String(shift.positionId)))
      .map((shift) => dayBounds(shift.startTime, shift.endTime, selectedDate))
  );

  const counts: number[] = [];
  const targets: number[] = [];

  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    const slotStart = slot / 2;
    const slotEnd = slotStart + 0.5;

    counts.push(
      spansByUser.filter((spans) =>
        spans.some((span) => span.start <= slotStart && span.end >= slotEnd)
      ).length
    );
    targets.push(targetAt(meter, new Date(dayStart + slot * 30 * 60_000)));
  }

  const peak = Math.max(1, ...counts, ...targets);
  const hasTarget = targets.some((target) => target > 0);

  return {
    counts,
    targets,
    peak,
    hasTarget,
    summary: summarize(counts, targets, hasTarget),
  };
};

/* -------------------------------------------------------------------------- */
/* Positions                                                                  */
/* -------------------------------------------------------------------------- */

/** How loudly a position's block is painted. See positionDisplay. */
export type PositionTone = "loud" | "mid" | "quiet";

export type PositionDisplay = {
  name: string;
  color: string;
  /** Short form that fits a 1-2 hour block. */
  label: string;
  /** Two-letter form for a 30-minute block. */
  code: string;
  tone: PositionTone;
};

const UNKNOWN_POSITION: PositionDisplay = {
  name: "Unknown",
  color: "#64748b",
  label: "Unknown",
  code: "??",
  tone: "quiet",
};

const isUnavailable = (name: string) => /unavailab/i.test(name);

/** Truncate on a word boundary where there is one. */
const shortLabel = (name: string) => {
  const trimmed = name.trim();
  if (trimmed.length <= 10) return trimmed;

  const cut = trimmed.slice(0, 10);
  const boundary = cut.lastIndexOf(" ");
  // Break on a space when there is a usable one; otherwise keep the full 10 chars
  // rather than clipping further ("Enterprise…" reads, "Enterpri…" does not).
  const base = boundary >= 5 ? cut.slice(0, boundary) : cut;
  return `${base.replace(/[\s,./-]+$/, "")}…`;
};

/** Initials for a multi-word name, otherwise the first two letters. */
const shortCode = (name: string) => {
  const words = name
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
};

/**
 * The three tones are the point of the redesign: channel work reads loud, supporting
 * work reads pale, and time an agent is not available recedes entirely -- so a glance
 * down the grid shows where the coverage is rather than eleven equally loud colors.
 *
 * Tone comes from the admin-picked `Position["type"]`, with a name check for
 * "unavailable" because it is conceptually a break but is not always typed as one.
 */
export const positionDisplay = (
  position: Position | undefined
): PositionDisplay => {
  if (!position) return UNKNOWN_POSITION;

  let tone: PositionTone;
  if (isUnavailable(position.name) || position.type === "break") {
    tone = "quiet";
  } else if (position.type === "live channel" || position.type === "tickets") {
    tone = "loud";
  } else {
    tone = "mid";
  }

  return {
    name: position.name,
    color: position.color,
    label: shortLabel(position.name),
    code: shortCode(position.name),
    tone,
  };
};

/** Hours an agent is scheduled today, excluding time marked unavailable. */
export const scheduledHours = (
  userShifts: Shift[] | undefined,
  positionsById: Map<string, Position>,
  selectedDate: Date
) =>
  (userShifts ?? []).reduce((total, shift) => {
    const position = positionsById.get(String(shift.positionId));
    if (position && isUnavailable(position.name)) return total;
    const span = dayBounds(shift.startTime, shift.endTime, selectedDate);
    return total + Math.max(0, span.end - span.start);
  }, 0);
