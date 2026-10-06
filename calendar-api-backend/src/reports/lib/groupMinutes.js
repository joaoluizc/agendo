/**
 * The pure half of the hours report: classifying a shift into a report group and summing
 * its minutes per agent. No models, no Redis, no I/O — so `src/performance` can share the
 * exact same rules (and so can a `node --test` file, which could not import
 * reportsService.js: `database/redisClient.js` connects at module top level).
 *
 * reportsService.js does the loading and calls these; see src/reports/README.md.
 */

export const GROUP_NAMES = ["Tickets", "Chats"];
export const OTHER = "Other";

export function normalize(name) {
  return String(name || "").trim().toLowerCase();
}

/** groups ([{ name, positionNames }]) -> (positionName) => "Tickets" | "Chats" | "Other" */
export function classifierFrom(groups) {
  const map = new Map();
  for (const group of groups || []) {
    for (const name of group.positionNames || []) {
      map.set(normalize(name), group.name);
    }
  }
  return (name) => map.get(normalize(name)) || OTHER;
}

/**
 * Clamp a shift's interval to the report window and return the overlap in minutes (0 if
 * none). findShiftsByRange returns shifts that merely overlap the window uncut, so any
 * shift straddling a boundary must be clamped here before its duration is summed —
 * otherwise hours get overcounted for exactly the shifts that cross into/out of range.
 */
export function clampedMinutes(shiftStart, shiftEnd, rangeStart, rangeEnd) {
  const start = Math.max(new Date(shiftStart).getTime(), rangeStart.getTime());
  const end = Math.min(new Date(shiftEnd).getTime(), rangeEnd.getTime());
  if (!(end > start)) return 0;
  return (end - start) / 60000;
}

export function emptyMinutes() {
  return { Tickets: 0, Chats: 0, Other: 0 };
}

/**
 * Raw minutes per agent per report group over [rangeStart, rangeEnd]. No flooring and no
 * filtering — callers decide how to present them.
 *
 * A shift whose userId matches no `users` doc is skipped outright rather than reported
 * under its raw clerk id: `Shift` is one shared collection while `User` is env-split into
 * `dev-users`/`users` (see models/UserModel.js), so a local dev run against the same
 * cluster writes real rows into production `shifts` keyed by a dev-only clerk id. Those,
 * plus shifts left behind by deleted accounts, are the only way this lookup can miss — a
 * current agent always has a `users` doc — so dropping them keeps dev data out without
 * touching any active roster member's hours.
 *
 * `unresolvedPositionMinutes` counts the part of an agent's time whose positionId no
 * longer resolves to a Position. Those minutes are already inside Other; the count only
 * lets a caller warn that "Other" is hiding shifts it can't name.
 *
 * Returns { agents: Map<clerkId, { clerkId, name, minutes, unresolvedPositionMinutes }>,
 *           skippedUnmatched }, the Map in first-seen order.
 */
export function foldGroupMinutes(
  shifts,
  { rangeStart, rangeEnd, userByClerkId, positionNameById, classify },
) {
  const agents = new Map();
  let skippedUnmatched = 0;
  for (const shift of shifts) {
    const minutes = clampedMinutes(shift.startTime, shift.endTime, rangeStart, rangeEnd);
    if (minutes <= 0) continue;
    const user = userByClerkId.get(shift.userId);
    if (!user) {
      skippedUnmatched += 1;
      continue;
    }
    const positionName = shift.positionId ? positionNameById.get(String(shift.positionId)) : "";
    const group = classify(positionName);
    if (!agents.has(user.clerkId)) {
      agents.set(user.clerkId, {
        clerkId: user.clerkId,
        name: `${user.firstName} ${user.lastName}`.trim(),
        minutes: emptyMinutes(),
        unresolvedPositionMinutes: 0,
      });
    }
    const agent = agents.get(user.clerkId);
    agent.minutes[group] += minutes;
    if (shift.positionId && positionName === undefined) {
      agent.unresolvedPositionMinutes += minutes;
    }
  }
  return { agents, skippedUnmatched };
}
