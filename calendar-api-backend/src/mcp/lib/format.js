/**
 * Turning agendo's data into text an LLM relays accurately.
 *
 * Two rules drive everything here, and both exist because of how this output is
 * consumed: a model will repeat what it is given, confidently, without the caveats a
 * human would infer from a screen.
 *
 * **1. No bare times.** Every rendered time carries its zone. `User.timezone` was
 * audited on 2026-10-05: all 18 production users hold the schema default `"UTC"`,
 * because the field was never written — the web UI reads the browser's zone instead,
 * and an MCP client has no browser to ask. A bare "14:00" that is silently six hours
 * out is worse than "14:00 UTC", which is at least checkable. When Phase 5 populates
 * the field this code needs no change: it already renders in whatever the caller has.
 *
 * **2. No silent truncation.** A capped list says how many were dropped. "Here are 20
 * shifts" reads as "that is all of them" unless told otherwise, and a model will
 * summarise it that way.
 */

/** Rows returned before a list is capped. Roughly a fortnight of one person's shifts. */
export const DEFAULT_ROW_CAP = 60;

/**
 * An IANA zone Intl will accept, falling back to UTC.
 *
 * A bad value in Mongo would otherwise throw a RangeError from deep inside a tool and
 * surface as an opaque failure. Falling back is safe precisely because rule 1 means the
 * zone is always printed — the caller can see they got UTC.
 */
export function safeTimeZone(timeZone) {
  const candidate = timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

/** A zone's short label at a given instant: `UTC`, `GMT-3`, `PST`. */
function zoneLabel(date, timeZone) {
  try {
    const part = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName");
    return part?.value || timeZone;
  } catch {
    return timeZone;
  }
}

/** `14:30` in the given zone. Never used without a zone label beside it. */
export function timeOnly(date, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** `Mon 6 Oct 2026` in the given zone. */
export function dayLabel(date, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** `YYYY-MM-DD` in the given zone — the key days are grouped by. */
export function dayKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

/**
 * `09:00–17:30 UTC`, or `09:00–01:30 UTC (+1d)` when it runs past midnight.
 *
 * The `+1d` marker matters: a shift reading `22:00–06:00` with no marker looks like an
 * eight-hour span backwards in time, and a model asked "how long is it" may say so.
 */
export function timeRange(start, end, timeZone) {
  const label = zoneLabel(start, timeZone);
  const crosses = dayKey(start, timeZone) !== dayKey(end, timeZone);
  return `${timeOnly(start, timeZone)}–${timeOnly(end, timeZone)} ${label}${
    crosses ? " (+1d)" : ""
  }`;
}

/** `7h30m`, `45m`. */
export function duration(start, end) {
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h${m}m` : `${h}h`;
}

/**
 * Cap a list, and say so.
 *
 * Returns the kept rows plus a `note` to append — never a bare slice, because the
 * caller cannot tell a complete list from a truncated one by looking at it.
 */
export function cap(items, limit = DEFAULT_ROW_CAP) {
  if (items.length <= limit) return { items, note: null };
  return {
    items: items.slice(0, limit),
    note: `… ${items.length - limit} more not shown (showing the first ${limit} of ${items.length}). Narrow the date range to see the rest.`,
  };
}

/** Wrap text lines into the MCP tool-result shape. */
export function textResult(lines) {
  const text = Array.isArray(lines) ? lines.filter(Boolean).join("\n") : lines;
  return { content: [{ type: "text", text }] };
}

/**
 * Parse a `YYYY-MM-DD` day as a UTC midnight instant.
 *
 * Deliberately strict and deliberately UTC. `new Date("2026-10-06")` is already UTC
 * midnight, but `new Date("2026-10-06T00:00")` is *local* midnight — the kind of
 * inconsistency that produces a schedule shifted by a day only for some callers. Taking
 * only the date form removes the choice.
 */
export function parseUtcDate(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error(
      `${fieldName} must be a date as YYYY-MM-DD (got ${JSON.stringify(value)})`,
    );
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is not a real date: ${value}`);
  }
  return date;
}

/** Today at UTC midnight. */
export function todayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** `date` plus `days`, keeping the UTC-midnight anchor. */
export function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

/**
 * Slot 18 -> `09:00`, slot 48 -> `24:00`.
 *
 * 48 is a valid *end* bound: a run ending at midnight has to read as ending after it
 * began. Mirrors the frontend's `formatSlotTime` so a gap reported here reads the same
 * as the one drawn on the schedule page.
 */
export function slotTime(slot) {
  const hour = String(Math.floor(slot / 2)).padStart(2, "0");
  return `${hour}:${slot % 2 === 0 ? "00" : "30"}`;
}

export default {
  DEFAULT_ROW_CAP,
  safeTimeZone,
  timeOnly,
  dayLabel,
  dayKey,
  timeRange,
  duration,
  cap,
  textResult,
  parseUtcDate,
  todayUtc,
  addDays,
  slotTime,
};
