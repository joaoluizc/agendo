import { Shift, SortedCalendar } from "@/types/shiftTypes";
import { Position } from "@/types/positionTypes";
import { UserSafeInfo } from "@/types/userTypes";
import { CoverageMeter } from "@/types/coverageTypes";
import { targetAt } from "@/utils/coverageTargets";
import {
  PositionDisplay,
  dayBounds,
  isUnavailablePosition,
  positionDisplay,
  startOfLocalDay,
} from "../scheduleUtils";

/**
 * The model the three shift dialogs share.
 *
 * Everything here talks in **fractional local hours on the selected day**, 0..24, in
 * half-hour steps — the same axis `dayBounds` puts the grid on, so a dialog and the
 * row behind it can never disagree about where a shift sits. ISO strings only appear
 * at the two edges: `rangeToIso` on the way to the API, `dayBounds` on the way back.
 *
 * The old dialogs parsed free text with chrono-node and found out about conflicts when
 * the API refused them. These functions exist so a dialog can answer "what is this
 * agent already doing during the slot I picked, and what happens if I save" before
 * anything is submitted.
 */

export const HOUR_STEP = 0.5;
export const DAY_HOURS = 24;

/** A candidate shift's span, in fractional local hours on the selected day. */
export type HourRange = { start: number; end: number };

/**
 * Keep a range inside the day and at least one half hour long.
 *
 * The end is clamped after the start so dragging the start past the end shortens the
 * shift instead of inverting it — the steppers rely on that to stay monotonic.
 */
export const clampRange = (start: number, end: number): HourRange => {
  const snappedStart = Math.min(
    DAY_HOURS - HOUR_STEP,
    Math.max(0, Math.round(start / HOUR_STEP) * HOUR_STEP)
  );
  const snappedEnd = Math.min(
    DAY_HOURS,
    Math.max(snappedStart + HOUR_STEP, Math.round(end / HOUR_STEP) * HOUR_STEP)
  );
  return { start: snappedStart, end: snappedEnd };
};

/**
 * `13` -> `13:00`, `13.5` -> `13:30`, `24` -> `24:00`.
 *
 * Hour 24 stays 24 rather than wrapping to 00: a shift labelled `22:00–00:00` reads as
 * ending before it started. Same reasoning as `formatSlotTime` in scheduleUtils.
 */
export const formatHour = (hour: number): string => {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const formatRange = (range: HourRange): string =>
  `${formatHour(range.start)}–${formatHour(range.end)}`;

/**
 * A typed time, as fractional hours — or `null` when it can't be read.
 *
 * Stepping a 9-hour shift into place is a lot of clicks, so the fields accept text too.
 * Deliberately forgiving about how a time is written and strict about the result:
 *
 *   `14` · `14:30` · `1430` · `930` · `2.30` · `2:30pm` · `9pm` · `24:00`
 *
 * Minutes snap to the nearest half hour, because that is the whole resolution of the
 * grid and of `Shift` placement — `9:45` becomes `10:00` rather than being rejected.
 * A bare `0` in the *end* field reads as midnight-at-the-end (hour 24), since `09:00`
 * to `00:00` is how people write an overnight close.
 *
 * Returning `null` rather than a sentinel is the point: the old dialogs wrote the literal
 * string "Invalid date" into the field and toasted, which lost what you had typed *and*
 * left the form holding an unusable value. Callers here just revert to the last good one.
 */
export const parseHourInput = (
  raw: string,
  options: { isEnd?: boolean } = {}
): number | null => {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  // `\d{1,2}` backtracks, so `930` reads as 9:30 while `1430` reads as 14:30.
  const match = /^(\d{1,2})[:.,h ]?(\d{2})?\s*(am|pm|a|p)?$/.exec(text);
  if (!match) return null;

  let hour = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const suffix = match[3];
  if (minutes > 59) return null;

  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    const isPm = suffix.startsWith("p");
    if (hour === 12) hour = isPm ? 12 : 0;
    else if (isPm) hour += 12;
  }

  let value = Math.round((hour + minutes / 60) * 2) / 2;
  if (options.isEnd && value === 0) value = DAY_HOURS;
  if (value < 0 || value > DAY_HOURS) return null;
  return value;
};

/** `0.5` -> `30m`, `1` -> `1h`, `1.5` -> `1h 30m`. */
export const formatDuration = (hours: number): string => {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (!whole) return `${minutes}m`;
  return minutes ? `${whole}h ${minutes}m` : `${whole}h`;
};

/** `7.5` -> `7.5`, `8` -> `8` — for the `7.5h scheduled` metas. */
export const formatHourTotal = (hours: number): string => {
  const rounded = Math.round(hours * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * An hour offset on the selected day, as an absolute instant.
 *
 * Built from local calendar parts rather than by adding milliseconds to midnight, so a
 * DST transition inside the day doesn't slide every later hour by one — and hour 24
 * rolls into the next day's midnight, which is exactly what a shift ending at midnight
 * means.
 */
export const hourToDate = (selectedDate: Date, hour: number): Date => {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  return new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
    whole,
    minutes,
    0,
    0
  );
};

export const rangeToIso = (selectedDate: Date, range: HourRange) => ({
  startTime: hourToDate(selectedDate, range.start).toISOString(),
  endTime: hourToDate(selectedDate, range.end).toISOString(),
});

/* -------------------------------------------------------------------------- */
/* The roster, as the dialogs see it                                          */
/* -------------------------------------------------------------------------- */

export type AgentShiftSpan = {
  shift: Shift;
  /** Fractional local hours on the selected day, clipped to 0..24. */
  start: number;
  end: number;
  positionId: string;
  position: PositionDisplay;
  isUnavailable: boolean;
};

export type AgentDay = {
  id: string;
  user: UserSafeInfo;
  firstName: string;
  name: string;
  initials: string;
  /** Sorted by start — the day strip and the conflict copy both read them in order. */
  spans: AgentShiftSpan[];
  /** Hours on the clock today, excluding time marked unavailable. */
  scheduledHours: number;
};

export const initialsOf = (user: {
  firstName?: string | null;
  lastName?: string | null;
}) => `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase();

/** Every agent with their day resolved onto the 0..24 axis. Memoise on the caller. */
export const buildRoster = (
  users: UserSafeInfo[],
  shifts: SortedCalendar,
  positionsById: Map<string, Position>,
  selectedDate: Date
): AgentDay[] =>
  users.map((user) => {
    const spans: AgentShiftSpan[] = (shifts[user.id] ?? [])
      .map((shift) => {
        const position = positionsById.get(String(shift.positionId));
        const bounds = dayBounds(shift.startTime, shift.endTime, selectedDate);
        return {
          shift,
          start: bounds.start,
          end: bounds.end,
          positionId: String(shift.positionId),
          position: positionDisplay(position),
          isUnavailable: isUnavailablePosition(position),
        };
      })
      .sort((a, b) => a.start - b.start);

    return {
      id: String(user.id),
      user,
      firstName: user.firstName ?? "",
      name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
      initials: initialsOf(user),
      spans,
      scheduledHours: spans.reduce(
        (total, span) =>
          span.isUnavailable ? total : total + Math.max(0, span.end - span.start),
        0
      ),
    };
  });

/* -------------------------------------------------------------------------- */
/* Conflicts                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What an agent is already doing during the slot being filled.
 *
 * - `same` — already on this very position for the whole slot, so there is nothing to
 *   add. The old dialog would happily create the duplicate.
 * - `unavailable` — the slot lands inside time they marked unavailable.
 * - `overlap` — something else is booked; the admin picks whether it stacks or goes.
 * - `clear` — free.
 */
export type ConflictKind = "clear" | "overlap" | "same" | "unavailable";

/** What to do about a conflict. `replace` deletes the overlapping shifts first. */
export type Resolution = "add" | "replace" | "skip";

export type AgentStatus = {
  kind: ConflictKind;
  overlaps: AgentShiftSpan[];
  /** The span that decided `kind` — what the badge and the conflict line talk about. */
  reference: AgentShiftSpan | null;
};

export const agentStatus = (
  agent: AgentDay,
  range: HourRange,
  positionId: string
): AgentStatus => {
  const overlaps = agent.spans.filter(
    (span) => span.start < range.end && span.end > range.start
  );

  const same = overlaps.find(
    (span) =>
      span.positionId === positionId &&
      span.start <= range.start &&
      span.end >= range.end
  );
  if (same) return { kind: "same", overlaps, reference: same };

  const unavailable = overlaps.find((span) => span.isUnavailable);
  if (unavailable)
    return { kind: "unavailable", overlaps, reference: unavailable };

  if (overlaps.length)
    return { kind: "overlap", overlaps, reference: overlaps[0] };

  return { kind: "clear", overlaps, reference: null };
};

/**
 * Nothing-to-do and marked-unavailable default to skipping, so selecting the whole
 * roster does the safe thing; a plain overlap defaults to stacking, which is what the
 * grid's lane packing is for.
 */
export const defaultResolution = (kind: ConflictKind): Resolution =>
  kind === "same" || kind === "unavailable" ? "skip" : "add";

export const resolutionOptions = (
  kind: ConflictKind
): { value: Resolution; label: string }[] => {
  if (kind === "unavailable")
    return [
      { value: "skip", label: "Skip" },
      { value: "add", label: "Schedule anyway" },
    ];
  if (kind === "overlap")
    return [
      { value: "add", label: "Keep both" },
      { value: "replace", label: "Replace" },
    ];
  // `same` has nothing to decide and `clear` has nothing to resolve.
  return [];
};

/* -------------------------------------------------------------------------- */
/* Coverage preview                                                           */
/* -------------------------------------------------------------------------- */

export type MeterContext = {
  meter: CoverageMeter;
  /** False when the chosen position isn't in this meter — shown as a reference only. */
  counted: boolean;
};

/**
 * The meter a position feeds, or the first meter as a read-only reference.
 *
 * A position can sit in more than one meter (Settings allows it deliberately); the
 * first match is the one the dialog previews, since showing every meter would crowd
 * out the agent list for a case that barely happens.
 */
export const meterForPosition = (
  meters: CoverageMeter[],
  positionId: string
): MeterContext | null => {
  if (meters.length === 0) return null;
  const owning = meters.find((meter) =>
    meter.positionIds.map(String).includes(String(positionId))
  );
  return owning
    ? { meter: owning, counted: true }
    : { meter: meters[0], counted: false };
};

export type StripSeries = {
  /** Head count per local hour before the pending change. */
  base: number[];
  /** Extra head count the pending change would add, stacked on top of `base`. */
  delta: number[];
  targets: number[];
  peak: number;
};

type StripInput = {
  meter: CoverageMeter;
  roster: AgentDay[];
  selectedDate: Date;
  /** The slot being filled. Only these hours can carry a delta. */
  range: HourRange;
  /** Agents the pending change puts on the meter. Empty when it doesn't count. */
  contributorIds: string[];
  /** Shifts that will be deleted if this is saved, so `base` doesn't over-report. */
  removedShiftIds?: Set<string>;
};

/**
 * The dialog strip: 24 hourly buckets of `base` + `delta` against target.
 *
 * Hourly rather than the grid's 48 half-hour slots because the strip is 300px wide —
 * 48 bars at that size are noise. Targets are stored half-hourly, so an hour takes the
 * larger of its two slots; under-reporting a target would show a gap as filled.
 *
 * An agent counts in an hour when a shift on one of the meter's positions covers the
 * whole hour, matching `buildCoverageSeries` — so the strip and the grid's coverage row
 * never disagree.
 */
export const buildStripSeries = ({
  meter,
  roster,
  selectedDate,
  range,
  contributorIds,
  removedShiftIds,
}: StripInput): StripSeries => {
  const meterPositions = new Set(meter.positionIds.map(String));
  const contributors = new Set(contributorIds.map(String));

  const countsAt = (agent: AgentDay, hour: number) =>
    agent.spans.some(
      (span) =>
        meterPositions.has(span.positionId) &&
        !removedShiftIds?.has(span.shift._id) &&
        span.start <= hour &&
        span.end >= hour + 1
    );

  const base: number[] = [];
  const delta: number[] = [];
  const targets: number[] = [];

  for (let hour = 0; hour < DAY_HOURS; hour++) {
    let covered = 0;
    let added = 0;

    for (const agent of roster) {
      const already = countsAt(agent, hour);
      if (already) covered++;

      // Only agents not already counted move the needle — otherwise replacing one
      // meter position with another would read as adding coverage that isn't new.
      const inRange = range.start <= hour && range.end >= hour + 1;
      if (!already && inRange && contributors.has(agent.id)) added++;
    }

    base.push(covered);
    delta.push(added);
    targets.push(
      Math.max(
        targetAt(meter, hourToDate(selectedDate, hour)),
        targetAt(meter, hourToDate(selectedDate, hour + 0.5))
      )
    );
  }

  return {
    base,
    delta,
    targets,
    peak: Math.max(
      1,
      ...base.map((value, hour) => value + delta[hour]),
      ...targets
    ),
  };
};

export type Shortfall = {
  hour: number;
  total: number;
  target: number;
  deficit: number;
};

/** The first hour inside the range that still misses target, if any. */
export const shortfallInRange = (
  series: StripSeries,
  range: HourRange
): Shortfall | null => {
  for (let hour = 0; hour < DAY_HOURS; hour++) {
    if (range.start > hour || range.end < hour + 1) continue;
    const total = series.base[hour] + series.delta[hour];
    if (total < series.targets[hour]) {
      return {
        hour,
        total,
        target: series.targets[hour],
        deficit: series.targets[hour] - total,
      };
    }
  }
  return null;
};

/** The first hour the range covers — what the single-hour readouts report on. */
export const leadHour = (range: HourRange) =>
  Math.min(DAY_HOURS - 1, Math.floor(range.start));

/* -------------------------------------------------------------------------- */
/* Shared block painting                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Perceived lightness, for deciding whether a saturated fill takes white or dark text.
 * Positions are admin-picked, so the palette can't be assumed.
 *
 * Kept in step with the same check in Shift.tsx — a preview that reads differently
 * from the block it previews defeats the point.
 */
const isLightColor = (hex: string) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return false;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.68;
};

/** The three-tone fill from the grid, reused for previews, badges and day strips. */
export const toneStyle = (
  position: PositionDisplay
): React.CSSProperties => {
  if (position.tone === "loud") {
    return {
      backgroundColor: position.color,
      color: isLightColor(position.color) ? "hsl(var(--foreground))" : "#ffffff",
    };
  }
  if (position.tone === "mid") {
    return {
      backgroundColor: `color-mix(in srgb, ${position.color} 16%, hsl(var(--card)))`,
      border: `1px solid color-mix(in srgb, ${position.color} 42%, transparent)`,
      color: "hsl(var(--foreground))",
    };
  }
  return {
    backgroundColor: "hsl(var(--muted))",
    border: "1px dashed hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
  };
};

/** Flat fill for the 16px day strip, where a 1px border would eat the segment. */
export const stripFill = (position: PositionDisplay) => {
  if (position.tone === "loud") return position.color;
  if (position.tone === "mid")
    return `color-mix(in srgb, ${position.color} 55%, transparent)`;
  return `color-mix(in srgb, ${position.color} 30%, transparent)`;
};

/** Local midnight of the day a dialog is working on. */
export const dayKey = (date: Date) => startOfLocalDay(date).getTime();
