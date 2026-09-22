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

  // Drafts are asked for explicitly, and the API only honours it for an admin — the
  // schedule is where unpublished shifts get reviewed, so it is the one read that wants
  // them. A non-admin simply gets the committed day back.
  const endpoint = `/api/shift/range?startTime=${startOfDayISO}&endTime=${endOfDayISO}&group=user&includeDrafts=1`;
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
/* Draft vs published                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Is this shift still a proposal?
 *
 * The whole app asks through here rather than comparing `status` inline, because the
 * interesting case is the one a direct comparison gets wrong: a shift written before the
 * draft lifecycle existed has **no** `status` at all, and it is real, published history.
 * Testing for `!== "published"` would turn every one of those into a draft — unsynced and
 * uncounted. Mirrors the backend's `$ne: "draft"` filter for the same reason.
 */
export const isDraft = (shift: Shift) => shift.status === "draft";

/** How many of a day's shifts are still unpublished. Drives the toolbar's commit prompt. */
export const countDrafts = (shifts: SortedCalendar) =>
  Object.values(shifts).reduce(
    (total, userShifts) => total + userShifts.filter(isDraft).length,
    0
  );

/** Every unpublished shift in a day, in no particular order. */
export const collectDrafts = (shifts: SortedCalendar): Shift[] =>
  Object.values(shifts).flatMap((userShifts) => userShifts.filter(isDraft));

/* -------------------------------------------------------------------------- */
/* Grid math                                                                  */
/* -------------------------------------------------------------------------- */

/** The timeline is 48 half-hour columns wide, one per slot. */
export const SLOTS_PER_DAY = 48;

/**
 * The grid's geometry, in one place because four components have to agree on it exactly —
 * the header ruler, the coverage rows, each agent row's label column and its lane grid.
 * They were four copies of the same literal; a change to one that missed another would
 * misalign every shift against the hour it sits under.
 *
 * Sized so the whole track fits a 1425px window without scrolling sideways. That window
 * leaves 1368px for the track once the card's margins, its border and a 15px scrollbar
 * are taken out — and 168 + 48 x 25 would spend exactly all of it, which a machine with
 * classic 17px scrollbars would overflow by 2px.
 *
 * So the slot floor is 24, not 25. It costs nothing visually: the floor only binds on a
 * narrower screen, and at 1425px `1fr` still stretches each column to the same 25px it
 * would otherwise have been. What it buys is ~48px of headroom for whatever the browser
 * takes that this arithmetic did not predict.
 */
export const LABEL_COLUMN_PX = 168;
export const SLOT_MIN_PX = 24;
export const TRACK_MIN_PX = LABEL_COLUMN_PX + SLOTS_PER_DAY * SLOT_MIN_PX;

/**
 * "Alexandre Back" -> "Alexandre B." for the grid's label column.
 *
 * Trimmed rather than truncated by CSS so the cut lands somewhere meaningful: an
 * ellipsis eats whichever characters happen not to fit, which on a narrow column can
 * leave two agents reading identically. A last initial always distinguishes them, and
 * costs less width than the ellipsis it replaces. A one-word name is left alone.
 */
export const shortName = (firstName?: string, lastName?: string): string => {
  const first = (firstName ?? "").trim();
  const initial = (lastName ?? "").trim().charAt(0);
  if (!first) return (lastName ?? "").trim();
  return initial ? `${first} ${initial}.` : first;
};
/** Half-hour columns alone — for the lane grid inside a row, which has no label cell. */
export const SLOT_COLUMNS = `repeat(${SLOTS_PER_DAY}, minmax(${SLOT_MIN_PX}px, 1fr))`;
/** The full row: sticky label column, then the day. */
export const GRID_COLUMNS = `${LABEL_COLUMN_PX}px ${SLOT_COLUMNS}`;

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

export type SpanPlacement = {
  /** 1-based grid column of the first half-hour cell the span touches. */
  gridColumnStart: number;
  /** How many half-hour cells the span touches. */
  cells: number;
  /** Percent of the spanned cells to leave empty on the left, 0..100. */
  insetLeftPct: number;
  /** Percent to leave empty on the right, 0..100. */
  insetRightPct: number;
};

/**
 * Place a span on the 48-column half-hour track *without* rounding it to that track.
 *
 * Shifts can start and end on quarter hours, which a half-hour grid cannot express:
 * `columnStart`/`columnSpan` would draw 09:15–09:45 as 09:00–09:30 — wrong at both ends
 * and wrong in length. Doubling the grid to 96 columns would fix the maths and halve the
 * column width, changing how the whole schedule looks for the sake of the occasional
 * short break.
 *
 * So the track stays exactly as it is, and the block is inset *within* the cells it
 * touches: claim every cell the span overlaps, then give back the unused fraction at each
 * end as a percentage. Cells are equal width, so the percentage lands the edge on the
 * real minute. The hour ruler, the coverage rows and the click targets are untouched.
 */
export const spanPlacement = (span: DaySpan): SpanPlacement => {
  const firstCell = Math.floor(span.start * 2);
  const lastCell = Math.ceil(span.end * 2);
  const cells = Math.max(1, Math.min(lastCell - firstCell, SLOTS_PER_DAY - firstCell));

  const windowStart = firstCell / 2;
  const windowHours = cells / 2;
  const clampPct = (value: number) => Math.max(0, Math.min(100, value));

  // A span that ends at or before it starts cannot be inset: the right inset alone works
  // out well past 100%, and a block given away entirely from one side has no width. It
  // stays in the DOM and in every count while painting nothing — so the day reports
  // shifts that cannot be seen, clicked, or deleted from the grid.
  //
  // ShiftModel rejects such a shift now, so this is about the ones already written. They
  // claim their whole cell instead, which is enough to find and remove one.
  if (span.end <= span.start) {
    return {
      gridColumnStart: Math.min(firstCell, SLOTS_PER_DAY - 1) + 1,
      cells: 1,
      insetLeftPct: 0,
      insetRightPct: 0,
    };
  }

  return {
    gridColumnStart: firstCell + 1,
    cells,
    insetLeftPct: clampPct(((span.start - windowStart) / windowHours) * 100),
    insetRightPct: clampPct(
      ((windowStart + windowHours - span.end) / windowHours) * 100
    ),
  };
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
  /** Head count per slot for the whole plan — drafts and published together. */
  counts: number[];
  /**
   * How much of `counts` only exists because of unpublished shifts, so the row can show
   * the proposed share of a bar apart from the committed one.
   */
  draftCounts: number[];
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

  // Two span sets per agent: the whole plan, and only the part already committed. Drafts
  // count toward coverage — with a new shift starting life as a draft, a day being built
  // is entirely draft, and a published-only row would read zero exactly when it is most
  // needed. The split is what keeps "covered" from being read as "committed".
  const spansByUser = roster.map((user) => {
    const onMeter = (shifts[user.id] ?? []).filter((shift) =>
      meterPositions.has(String(shift.positionId))
    );
    const toSpan = (shift: Shift) =>
      dayBounds(shift.startTime, shift.endTime, selectedDate);
    return {
      all: onMeter.map(toSpan),
      published: onMeter.filter((shift) => !isDraft(shift)).map(toSpan),
    };
  });

  const counts: number[] = [];
  const draftCounts: number[] = [];
  const targets: number[] = [];

  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    const slotStart = slot / 2;
    const slotEnd = slotStart + 0.5;
    const covers = (spans: DaySpan[]) =>
      spans.some((span) => span.start <= slotStart && span.end >= slotEnd);

    const planned = spansByUser.filter((agent) => covers(agent.all)).length;
    const committed = spansByUser.filter((agent) =>
      covers(agent.published)
    ).length;

    counts.push(planned);
    // The *extra* head count the drafts buy. An agent already covering this slot with a
    // published shift contributes nothing here, so replacing one draft with another never
    // reads as added coverage.
    draftCounts.push(planned - committed);
    targets.push(targetAt(meter, new Date(dayStart + slot * 30 * 60_000)));
  }

  const peak = Math.max(1, ...counts, ...targets);
  const hasTarget = targets.some((target) => target > 0);

  return {
    counts,
    draftCounts,
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
  /**
   * Hard 10-character form, broken on a word boundary — for blocks too narrow for the
   * name.
   *
   * Only for the narrow tiers. A wider block prints `name` and lets CSS ellipsise it,
   * since CSS is the only thing that knows the real pixel width; using this everywhere put
   * "Customer…" on a four-hour block with 200px to spare. See `Shift`'s `mode`.
   */
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

/**
 * Time the agent is not available, rather than merely not on a channel.
 *
 * The shift dialogs treat this as its own conflict kind — scheduling over someone's
 * "Unavailable" block is a different decision from stacking two pieces of work — and
 * `scheduledHours` already excludes it from an agent's total.
 */
export const isUnavailablePosition = (position: Position | undefined) =>
  !!position && isUnavailable(position.name);

/**
 * Not real work: breaks, meetings and unavailable time.
 *
 * The duplicate dialog offers to leave these behind, since copying a Tuesday onto a
 * Thursday usually means copying the coverage, not last Tuesday's 1:1.
 */
export const isOffDutyPosition = (position: Position | undefined) =>
  !!position &&
  (position.type === "break" ||
    position.type === "meeting" ||
    isUnavailable(position.name));

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

/**
 * Order positions for a picker: most recently used first, alphabetical within a day.
 *
 * `lastUsedAt` is truncated to a day by the backend, which is what makes this usable as an
 * ordering. A precise timestamp would reshuffle the list after every shift and move the
 * option you were reaching for; at day granularity the handful of positions in use today
 * sit at the top and hold still, and the alphabetical tiebreak keeps the rest predictable.
 *
 * Never-used positions sort last, together, alphabetically.
 */
export const byRecentUse = (a: Position, b: Position) => {
  const aDay = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
  const bDay = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
  if (aDay !== bDay) return bDay - aDay;
  return a.name.localeCompare(b.name);
};
