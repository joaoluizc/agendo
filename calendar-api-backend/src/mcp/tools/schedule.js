import { z } from "zod";
import shiftService from "../../services/shiftService.js";
import coverageMeterService from "../../services/coverageMeterService.js";
import { registerTool } from "../lib/registerTool.js";
import {
  loadRoster,
  resolveUserLabel,
  resolvePositionName,
  findUsersByName,
  findPositionsByName,
  userDisplayName,
} from "../lib/roster.js";
import {
  safeTimeZone,
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
  timeOnly,
} from "../lib/format.js";

/** A schedule request spanning more than this is refused rather than truncated. */
const MAX_RANGE_DAYS = 31;
/** Days covered when a caller names no range. A working week either side of today. */
const DEFAULT_RANGE_DAYS = 7;

const SLOTS_PER_DAY = 48;

/**
 * Resolve the `from`/`to` arguments every schedule tool shares.
 *
 * Days are UTC. `Shift.startTime` is a UTC instant and `CoverageMeter.targets` is
 * explicitly UTC-anchored (see the model), so UTC is the only frame in which a day
 * boundary means one thing for everyone. The rendered *times* still follow the caller's
 * own zone — only the window is fixed.
 */
function resolveRange(args) {
  const from = args.from ? parseUtcDate(args.from, "from") : todayUtc();
  const to = args.to
    ? parseUtcDate(args.to, "to")
    : addDays(from, DEFAULT_RANGE_DAYS - 1);

  if (to < from) {
    throw new Error(`"to" (${args.to}) is before "from" (${args.from})`);
  }
  const days = Math.round((to - from) / 86400000) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new Error(
      `that range is ${days} days; ask for at most ${MAX_RANGE_DAYS} at a time`,
    );
  }
  // `to` is inclusive for the caller, so the query runs to the end of that day.
  return { from, toExclusive: addDays(to, 1), to, days };
}

/** Shifts for one Clerk id in a window, oldest first. */
async function shiftsForUser(clerkId, from, toExclusive) {
  const shifts = await shiftService.findShiftsByRange(from, toExclusive);
  return shifts
    .filter((shift) => shift.userId === clerkId)
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Render a person's shifts, grouped by the day each one starts.
 *
 * Days with nothing on them are stated as such rather than omitted. "Not working" is an
 * answer; a missing row is ambiguous between that and a tool that failed to look.
 *
 * A shift is included when it *overlaps* the requested days, not only when it starts
 * inside them — `shiftService.findShiftsByRange` is an overlap query and that is the
 * right behaviour here. Support runs night shifts that cross midnight UTC, so asking
 * about Tuesday and being told nothing about the 22:00 Monday shift still running at
 * 01:00 Tuesday would hide real coverage.
 *
 * The cost is that such a shift groups under a day outside the range the heading states.
 * Rather than drop it or silently contradict the heading, the day is labelled as
 * overlapping. Found by running the tool against real data: asking for Tue–Wed returned
 * a block headed "Mon, 5 Oct" with no explanation.
 */
function renderSchedule({ heading, shifts, from, to, timeZone, positionsById }) {
  const firstKey = dayKey(from, timeZone);
  const lastKey = dayKey(to, timeZone);
  const outsideRange = (key) => key < firstKey || key > lastKey;
  const lines = [heading, ""];

  if (!shifts.length) {
    lines.push(
      `No shifts between ${dayLabel(from, timeZone)} and ${dayLabel(to, timeZone)}.`,
    );
    return lines;
  }

  const { items, note } = cap(shifts);
  const byDay = new Map();
  for (const shift of items) {
    const key = dayKey(shift.startTime, timeZone);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(shift);
  }

  let totalMinutes = 0;
  let overlapping = 0;
  for (const [key, dayShifts] of byDay) {
    const spills = outsideRange(key);
    if (spills) overlapping += dayShifts.length;
    lines.push(
      dayLabel(dayShifts[0].startTime, timeZone) +
        (spills ? "  (outside the range asked for — runs into it)" : ""),
    );
    for (const shift of dayShifts) {
      totalMinutes += (shift.endTime - shift.startTime) / 60000;
      lines.push(
        `  ${timeRange(shift.startTime, shift.endTime, timeZone)}  ` +
          `${resolvePositionName(shift.positionId, positionsById)}  ` +
          `(${duration(shift.startTime, shift.endTime)})`,
      );
    }
  }

  lines.push("");
  lines.push(
    `${items.length} shift${items.length === 1 ? "" : "s"}, ` +
      `${Math.round((totalMinutes / 60) * 10) / 10}h total.`,
  );
  if (overlapping) {
    lines.push(
      `Includes ${overlapping} shift${overlapping === 1 ? "" : "s"} starting outside ` +
        `${dayLabel(from, timeZone)} – ${dayLabel(to, timeZone)} that run${overlapping === 1 ? "s" : ""} into it.`,
    );
  }
  if (note) lines.push(note);
  return lines;
}

/**
 * Hours in a window, grouped — the shape a manager's question actually has.
 *
 * "Does anyone have development time this week?" and "how many hours of Personal Queue
 * did Sarah have?" are both answerable from the per-person tools only by fetching every
 * day and adding it up, which is dozens of calls and arithmetic an LLM does confidently
 * and sometimes wrongly. This does the sum server-side, once.
 *
 * Hours are **clipped to the window**. A night shift running 22:00 Sunday to 02:00 Monday
 * contributes two hours to a week starting Monday, not four. Totalling whole overlapping
 * shifts would inflate every period that happens to begin or end mid-shift, and the error
 * is invisible in the output.
 */
function summariseShifts(shifts, from, toExclusive, roster) {
  const byAgent = new Map();
  const byPosition = new Map();
  let totalMinutes = 0;

  for (const shift of shifts) {
    const start = Math.max(shift.startTime.getTime(), from.getTime());
    const end = Math.min(shift.endTime.getTime(), toExclusive.getTime());
    const minutes = Math.max(0, (end - start) / 60000);
    if (!minutes) continue;
    totalMinutes += minutes;

    const agentKey = shift.userId;
    const agent = byAgent.get(agentKey) || { minutes: 0, count: 0 };
    agent.minutes += minutes;
    agent.count += 1;
    byAgent.set(agentKey, agent);

    const positionKey = String(shift.positionId);
    const position = byPosition.get(positionKey) || { minutes: 0, count: 0 };
    position.minutes += minutes;
    position.count += 1;
    byPosition.set(positionKey, position);
  }

  const hours = (minutes) => Math.round((minutes / 60) * 10) / 10;
  const agents = [...byAgent.entries()]
    .map(([clerkId, v]) => ({
      label: resolveUserLabel(clerkId, roster.usersByClerkId),
      hours: hours(v.minutes),
      count: v.count,
    }))
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
  const positions = [...byPosition.entries()]
    .map(([id, v]) => {
      const position = roster.positionsById.get(id);
      return {
        label: position?.name || `unknown position (${id})`,
        type: position?.type || "",
        hours: hours(v.minutes),
        count: v.count,
      };
    })
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));

  return { totalHours: hours(totalMinutes), agents, positions };
}

export function registerScheduleTools(server, caller) {
  const timeZone = safeTimeZone(caller.mongoUser?.timezone);

  registerTool(server, caller, {
    name: "get_my_schedule",
    level: "user",
    title: "My schedule",
    description:
      "The signed-in agent's own shifts over a date range: when they work, which position, " +
      "and for how long. Defaults to the next 7 days from today. Dates are UTC days; times " +
      "are shown in the caller's agendo timezone and always carry the zone.",
    inputSchema: {
      from: z
        .string()
        .optional()
        .describe("First day to include, YYYY-MM-DD (UTC). Defaults to today."),
      to: z
        .string()
        .optional()
        .describe(
          "Last day to include, inclusive, YYYY-MM-DD (UTC). Defaults to 6 days after `from`.",
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (args, ctx) => {
      const { from, to, toExclusive } = resolveRange(args);
      const { positionsById } = await loadRoster();
      const shifts = await shiftsForUser(ctx.clerkId, from, toExclusive);

      return textResult(
        renderSchedule({
          heading: `Schedule for ${userDisplayName(ctx.mongoUser)} (you), ${dayLabel(from, timeZone)} – ${dayLabel(to, timeZone)}`,
          shifts,
          from,
          to,
          timeZone,
          positionsById,
        }),
      );
    },
  });

  registerTool(server, caller, {
    name: "get_agent_schedule",
    level: "user",
    title: "A colleague's schedule",
    description:
      "Another support agent's shifts over a date range, found by name. The whole team's " +
      "schedule is visible to everyone in agendo, same as the schedule page. If the name " +
      "matches more than one person the tool lists the candidates instead of guessing.",
    inputSchema: {
      name: z
        .string()
        .describe(
          "The agent's name, or part of it — first, last or full. Case- and accent-insensitive.",
        ),
      from: z
        .string()
        .optional()
        .describe("First day to include, YYYY-MM-DD (UTC). Defaults to today."),
      to: z
        .string()
        .optional()
        .describe("Last day to include, inclusive, YYYY-MM-DD (UTC)."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (args, _ctx) => {
      const { from, to, toExclusive } = resolveRange(args);
      const { users, positionsById } = await loadRoster();
      const matches = findUsersByName(args.name, users);

      if (!matches.length) {
        return textResult(
          `No agendo user matches "${args.name}". ` +
            `The roster has ${users.length} people; try a first or last name.`,
        );
      }
      if (matches.length > 1) {
        return textResult([
          `"${args.name}" matches ${matches.length} people — ask again with a fuller name:`,
          ...matches.map((u) => `  • ${userDisplayName(u)} (${u.email})`),
        ]);
      }

      const [user] = matches;
      const shifts = await shiftsForUser(user.clerkId, from, toExclusive);
      return textResult(
        renderSchedule({
          heading: `Schedule for ${userDisplayName(user)}, ${dayLabel(from, timeZone)} – ${dayLabel(to, timeZone)}`,
          shifts,
          from,
          to,
          timeZone,
          positionsById,
        }),
      );
    },
  });

  registerTool(server, caller, {
    name: "get_coverage_at",
    level: "user",
    title: "Who is working right now",
    description:
      "Who is on shift at a given moment, grouped by position — the answer to " +
      '"who is covering tickets right now" or "who is on at 3pm Thursday". Defaults to now.',
    inputSchema: {
      at: z
        .string()
        .optional()
        .describe(
          "The moment to look at, as an ISO 8601 instant such as 2026-10-06T15:00:00Z. " +
            "Include the offset or Z; defaults to now.",
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (args) => {
      let at = new Date();
      if (args.at) {
        at = new Date(args.at);
        if (Number.isNaN(at.getTime())) {
          throw new Error(
            `"at" is not a valid ISO 8601 instant: ${JSON.stringify(args.at)}`,
          );
        }
      }

      const { usersByClerkId, positionsById } = await loadRoster();
      // A one-millisecond window: findShiftsByRange returns anything overlapping it.
      const shifts = (
        await shiftService.findShiftsByRange(at, new Date(at.getTime() + 1))
      ).filter((shift) => shift.startTime <= at && shift.endTime > at);

      const heading = `On shift at ${dayLabel(at, timeZone)}, ${timeOnly(at, timeZone)} (${timeZone})`;
      if (!shifts.length) {
        return textResult([heading, "", "Nobody is scheduled at that moment."]);
      }

      const byPosition = new Map();
      for (const shift of shifts) {
        const name = resolvePositionName(shift.positionId, positionsById);
        if (!byPosition.has(name)) byPosition.set(name, []);
        byPosition.get(name).push(shift);
      }

      const lines = [heading, ""];
      for (const [position, positionShifts] of [...byPosition].sort((a, b) =>
        a[0].localeCompare(b[0]),
      )) {
        lines.push(`${position} (${positionShifts.length})`);
        for (const shift of positionShifts.sort((a, b) =>
          a.startTime - b.startTime,
        )) {
          lines.push(
            `  ${resolveUserLabel(shift.userId, usersByClerkId)} — ` +
              `${timeRange(shift.startTime, shift.endTime, timeZone)}`,
          );
        }
      }
      lines.push("");
      lines.push(
        `${shifts.length} agent${shifts.length === 1 ? "" : "s"} across ${byPosition.size} position${byPosition.size === 1 ? "" : "s"}.`,
      );
      return textResult(lines);
    },
  });

  registerTool(server, caller, {
    name: "summarize_shifts",
    level: "user",
    title: "Hours over a period",
    description:
      "Total scheduled hours across a date range, broken down by agent and by position — " +
      "the tool for questions about a period rather than a moment. Answers 'does anyone " +
      "have development time this week?', 'how many hours of Personal Queue did Sarah " +
      "have?', 'who worked the most last week?'. Filter by agent, by position name, or by " +
      "position TYPE (development, tickets, meeting, training, break, live channel) — a " +
      "type covers several differently-named positions, so it is usually what a question " +
      "about 'development time' or 'meetings' means. Use this instead of calling the " +
      "per-day tools repeatedly.",
    inputSchema: {
      from: z
        .string()
        .optional()
        .describe("First day, YYYY-MM-DD (UTC). Defaults to today."),
      to: z
        .string()
        .optional()
        .describe("Last day, inclusive, YYYY-MM-DD (UTC). Defaults to 6 days after `from`."),
      agent: z
        .string()
        .optional()
        .describe("Limit to one agent, by name."),
      position: z
        .string()
        .optional()
        .describe("Limit to one position, by name (e.g. 'Personal Queue')."),
      position_type: z
        .string()
        .optional()
        .describe(
          "Limit to a whole category of positions, e.g. 'development' or 'tickets'.",
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (args) => {
      const { from, to, toExclusive } = resolveRange(args);
      const roster = await loadRoster();

      const filters = [];
      let agentClerkId = null;
      if (args.agent) {
        const matches = findUsersByName(args.agent, roster.users);
        if (!matches.length) {
          return textResult(
            `No agendo user matches "${args.agent}" (the roster has ${roster.users.length} people).`,
          );
        }
        if (matches.length > 1) {
          return textResult([
            `"${args.agent}" matches ${matches.length} people — ask again with a fuller name:`,
            ...matches.map((u) => `  • ${userDisplayName(u)}`),
          ]);
        }
        agentClerkId = matches[0].clerkId;
        filters.push(`agent ${userDisplayName(matches[0])}`);
      }

      // A position id set, so a name and a type filter narrow the same way.
      let allowedPositionIds = null;
      if (args.position) {
        const matches = findPositionsByName(args.position, roster.positions);
        if (!matches.length) {
          return textResult(`No position matches "${args.position}".`);
        }
        allowedPositionIds = new Set(matches.map((p) => String(p._id)));
        filters.push(
          `position ${matches.map((p) => p.name).join(" / ")}`,
        );
      }
      if (args.position_type) {
        const wanted = String(args.position_type).trim().toLowerCase();
        const matches = roster.positions.filter(
          (p) => String(p.type || "").toLowerCase() === wanted,
        );
        if (!matches.length) {
          const known = [
            ...new Set(roster.positions.map((p) => p.type).filter(Boolean)),
          ].sort();
          return textResult(
            `No position type called "${args.position_type}". Known types: ${known.join(", ")}.`,
          );
        }
        const ids = new Set(matches.map((p) => String(p._id)));
        allowedPositionIds = allowedPositionIds
          ? new Set([...allowedPositionIds].filter((id) => ids.has(id)))
          : ids;
        filters.push(
          `type ${wanted} (${matches.length} position${matches.length === 1 ? "" : "s"})`,
        );
      }

      const shifts = (
        await shiftService.findShiftsByRange(from, toExclusive)
      ).filter(
        (shift) =>
          (!agentClerkId || shift.userId === agentClerkId) &&
          (!allowedPositionIds ||
            allowedPositionIds.has(String(shift.positionId))),
      );

      const heading =
        `Scheduled hours, ${dayLabel(from, timeZone)} – ${dayLabel(to, timeZone)}` +
        (filters.length ? ` — ${filters.join(", ")}` : "");

      if (!shifts.length) {
        return textResult([heading, "", "No published shifts match."]);
      }

      const { totalHours, agents, positions } = summariseShifts(
        shifts,
        from,
        toExclusive,
        roster,
      );

      const lines = [
        heading,
        "",
        `${totalHours}h total across ${shifts.length} shift${shifts.length === 1 ? "" : "s"}, ` +
          `${agents.length} agent${agents.length === 1 ? "" : "s"}, ` +
          `${positions.length} position${positions.length === 1 ? "" : "s"}.`,
        "",
        "By agent:",
      ];
      const cappedAgents = cap(agents, 40);
      for (const a of cappedAgents.items) {
        lines.push(
          `  ${a.hours}h  ${a.label}  (${a.count} shift${a.count === 1 ? "" : "s"})`,
        );
      }
      if (cappedAgents.note) lines.push(`  ${cappedAgents.note}`);

      lines.push("", "By position:");
      const cappedPositions = cap(positions, 40);
      for (const p of cappedPositions.items) {
        lines.push(
          `  ${p.hours}h  ${p.label}${p.type ? ` [${p.type}]` : ""}  ` +
            `(${p.count} shift${p.count === 1 ? "" : "s"})`,
        );
      }
      if (cappedPositions.note) lines.push(`  ${cappedPositions.note}`);

      lines.push(
        "",
        "Published shifts only (drafts excluded). Hours are clipped to the range, so a shift " +
          "crossing its edge counts only the part inside.",
      );
      return textResult(lines);
    },
  });

  registerTool(server, caller, {
    name: "find_coverage_gaps",
    level: "admin",
    title: "Coverage gaps for a day",
    description:
      "Half-hour stretches of a day where scheduled headcount falls below a coverage " +
      "meter's target. Admin-only, matching the coverage rows on the schedule page, which " +
      "are admin-only there too. Targets are stored in UTC, so gaps are reported in UTC.",
    inputSchema: {
      date: z
        .string()
        .optional()
        .describe("The UTC day to check, YYYY-MM-DD. Defaults to today."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (args) => {
      const dayStart = args.date ? parseUtcDate(args.date, "date") : todayUtc();
      const dayEnd = addDays(dayStart, 1);
      const weekday = dayStart.getUTCDay(); // targets are Sunday-first, UTC.

      const [meters, { usersByClerkId }, shifts] = await Promise.all([
        coverageMeterService.getMeters(),
        loadRoster(),
        shiftService.findShiftsByRange(dayStart, dayEnd),
      ]);

      const heading =
        `Coverage for ${dayLabel(dayStart, "UTC")} (UTC — targets are stored in UTC, ` +
        `so this day is 00:00–24:00 UTC)`;

      if (!meters.length) {
        return textResult([
          heading,
          "",
          "No coverage meters are configured, so there is nothing to compare against.",
        ]);
      }

      const lines = [heading];

      for (const meter of meters) {
        const meterPositions = new Set(
          (meter.positionIds || []).map((id) => String(id)),
        );
        const targets = meter.targets?.[weekday] || [];

        // Spans in hours from midnight UTC, clipped to the day, grouped by agent —
        // mirroring the schedule page, which counts *people*, not shifts, and requires
        // a shift to cover a whole half-hour slot before it counts for that slot.
        const spansByUser = new Map();
        for (const shift of shifts) {
          if (!meterPositions.has(String(shift.positionId))) continue;
          const start = Math.max(0, (shift.startTime - dayStart) / 3600000);
          const end = Math.min(24, (shift.endTime - dayStart) / 3600000);
          if (end <= start) continue;
          if (!spansByUser.has(shift.userId)) spansByUser.set(shift.userId, []);
          spansByUser.get(shift.userId).push({ start, end });
        }

        const runs = [];
        let open = null;
        let anyTarget = false;

        for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
          const target = targets[slot] || 0;
          if (target > 0) anyTarget = true;
          const slotStart = slot / 2;
          const slotEnd = slotStart + 0.5;

          let count = 0;
          for (const spans of spansByUser.values()) {
            if (
              spans.some(
                (span) => span.start <= slotStart && span.end >= slotEnd,
              )
            )
              count += 1;
          }

          if (count < target) {
            const deficit = target - count;
            if (open) {
              open.to = slot + 1;
              open.deficit = Math.max(open.deficit, deficit);
              open.worst = Math.min(open.worst, count);
            } else {
              open = { from: slot, to: slot + 1, deficit, worst: count };
              runs.push(open);
            }
          } else {
            open = null;
          }
        }

        lines.push("");
        lines.push(`${meter.name} — ${meterPositions.size} position(s)`);
        if (!anyTarget) {
          lines.push("  no target set for this day");
        } else if (!runs.length) {
          lines.push("  target met all day");
        } else {
          for (const run of runs) {
            lines.push(
              `  ${slotTime(run.from)}–${slotTime(run.to)} UTC  ` +
                `short by up to ${run.deficit} (low of ${run.worst} scheduled)`,
            );
          }
        }
      }

      const seeded = [...spansByUserIdsIn(shifts)].filter(
        (id) => !usersByClerkId.has(id),
      );
      if (seeded.length) {
        lines.push("");
        lines.push(
          `Note: ${seeded.length} shift owner(s) on this day are not agendo users ` +
            `(seeded test data in the shared shifts collection); they are counted as scheduled.`,
        );
      }
      return textResult(lines);
    },
  });
}

/** Distinct `Shift.userId` values in a set of shifts. */
function spansByUserIdsIn(shifts) {
  return new Set(shifts.map((shift) => shift.userId));
}

export default { registerScheduleTools };
