import { CoverageMeter } from "@/types/coverageTypes";

/**
 * Coverage targets are stored in UTC — `targets[utcDay][utcHalfHourSlot]`, 7 × 48,
 * Sunday-first. Agendo is used across timezones, so a target has to be an absolute
 * weekly instant: "3 agents at 09:00" set by an admin in UTC−03:00 is the same moment
 * as 14:00 for a viewer in UTC+02:00, and both should see it on their own clock.
 *
 * Storage is *half-hourly* even though the editor is hourly, because whole-hour UTC
 * buckets cannot represent an hour in a half-hour zone: in UTC+05:30, local 09:00 is
 * UTC 03:30 and local 09:30 is UTC 04:00, so an hourly grid silently shifts the whole
 * target window by 30 minutes. Half-hour slots make the mapping exact for every :00
 * and :30 offset, and they line up with the schedule grid's own 48 slots. (:45 zones
 * — Chatham, Kathmandu — are still off by 15 minutes; 15-minute storage would be the
 * next step if that ever matters.)
 *
 * This module is the only place that knows about the convention. The schedule page
 * reads a target for a slot instant; the settings grid edits a local *hourly* grid and
 * converts on load/save.
 */

export const DAYS_PER_WEEK = 7;
/** Columns in the editor — local hours. */
export const HOURS_PER_DAY = 24;
/** Columns in storage — UTC half hours. */
export const SLOTS_PER_DAY = 48;
export const MAX_TARGET = 8;

/** Day labels for the settings grid, Sunday-first to match the stored day index. */
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Sunday and Saturday — shaded in the settings grid. */
export const isWeekend = (day: number) => day === 0 || day === 6;

const grid = (width: number): number[][] =>
  Array.from({ length: DAYS_PER_WEEK }, () =>
    Array.from({ length: width }, () => 0),
  );

/** A blank stored (UTC, half-hourly) grid. */
export const emptyTargets = (): number[][] => grid(SLOTS_PER_DAY);

/** A blank editor (local, hourly) grid. */
export const emptyLocalTargets = (): number[][] => grid(HOURS_PER_DAY);

/** Coerce anything the API hands back into a well-formed 7 × 48 grid. */
export const normalizeTargets = (targets: unknown): number[][] => {
  const out = emptyTargets();
  if (!Array.isArray(targets)) return out;
  for (let day = 0; day < DAYS_PER_WEEK; day++) {
    const row = targets[day];
    if (!Array.isArray(row)) continue;
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const value = Number(row[slot]);
      if (Number.isFinite(value)) {
        out[day][slot] = Math.min(MAX_TARGET, Math.max(0, Math.round(value)));
      }
    }
  }
  return out;
};

/** Half-hour slot index (0..47) of an instant, in UTC. */
const utcSlot = (instant: Date) =>
  instant.getUTCHours() * 2 + (instant.getUTCMinutes() >= 30 ? 1 : 0);

/**
 * The target in force at an absolute instant.
 *
 * Resolved from the instant itself rather than from arithmetic on a day/hour label,
 * which is what makes this DST-correct: a local day's 48 half-hour slots can straddle
 * two UTC days, and this simply follows them across.
 */
export const targetAt = (meter: CoverageMeter, instant: Date): number =>
  meter.targets?.[instant.getUTCDay()]?.[utcSlot(instant)] ?? 0;

/** Local midnight on the Sunday of the week containing `reference`. */
const startOfLocalWeek = (reference: Date): Date => {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

/**
 * Walk the 336 half hours of a reference week, handing each one its local (day, hour)
 * and the matching UTC (day, slot). Both conversions below are the same walk, read in
 * opposite directions.
 *
 * The reference week is the one containing today. Across a DST boundary a local hour
 * can be skipped or repeated, so a cell or two in that specific week may shift by an
 * hour on a round trip; every other week is an exact bijection.
 */
const eachHalfHour = (
  visit: (
    localDay: number,
    localHour: number,
    utcDay: number,
    slot: number,
  ) => void,
  reference = new Date(),
) => {
  const weekStart = startOfLocalWeek(reference);
  for (let day = 0; day < DAYS_PER_WEEK; day++) {
    for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
      for (const minute of [0, 30]) {
        const instant = new Date(weekStart);
        instant.setDate(weekStart.getDate() + day);
        instant.setHours(hour, minute, 0, 0);
        visit(day, hour, instant.getUTCDay(), utcSlot(instant));
      }
    }
  }
};

/** Stored UTC grid → the hourly grid the editor shows, in the viewer's local time. */
export const utcTargetsToLocal = (targets: number[][]): number[][] => {
  const local = emptyLocalTargets();
  // Both half hours of a local hour carry the same value; if they ever disagree
  // (hand-edited data), show the larger so a target is never under-reported.
  eachHalfHour((day, hour, utcDay, slot) => {
    local[day][hour] = Math.max(
      local[day][hour],
      targets?.[utcDay]?.[slot] ?? 0,
    );
  });
  return local;
};

/** Editor's local hourly grid → the UTC half-hourly grid that gets persisted. */
export const localTargetsToUtc = (local: number[][]): number[][] => {
  const targets = emptyTargets();
  eachHalfHour((day, hour, utcDay, slot) => {
    targets[utcDay][slot] = local?.[day]?.[hour] ?? 0;
  });
  return targets;
};

/** e.g. `UTC−03:00`. Shown under the settings grid so the zone is never implicit. */
export const localZoneLabel = (reference = new Date()): string => {
  // getTimezoneOffset is minutes *behind* UTC, so the sign is inverted.
  const offsetMinutes = -reference.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "−" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
};

/** `168 agent-hours per week · peak 3 at once` for the grid footer. */
export const summarizeTargets = (local: number[][]) => {
  let total = 0;
  let peak = 0;
  for (const row of local) {
    for (const value of row) {
      total += value;
      if (value > peak) peak = value;
    }
  }
  return { total, peak };
};
