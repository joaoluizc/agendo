import { z } from "zod";
import shiftService from "../../services/shiftService.js";
import { registerTool } from "../lib/registerTool.js";
import {
  loadRoster,
  findUsersByName,
  findPositionsByName,
  findLocationsByName,
  resolveUserLabel,
  resolvePositionName,
  userDisplayName,
} from "../lib/roster.js";
import {
  safeTimeZone,
  dayLabel,
  dayKey,
  timeRange,
  duration,
  textResult,
  cap,
} from "../lib/format.js";

/**
 * The general shift query. One tool, composable filters, three ways of answering.
 *
 * The task-shaped tools beside this one cover the frequent questions well, but they can
 * only answer the questions they were shaped for. A question nobody anticipated —
 * "how much unsynced development time did APAC have last month?" — either takes dozens
 * of calls or cannot be asked at all. A model given one flexible primitive composes it;
 * a model given ten narrow ones has to hope the right one exists.
 *
 * Three guards keep the flexibility from being its own problem:
 *
 *  - **Summary is the default.** 422 published shifts a week is ~100KB of raw rows; a
 *    `list` of an unfiltered month would eat a client's whole context. Totals are almost
 *    always the answer, and the caller can ask for rows when they are not.
 *  - **Ranges are capped**, tighter for `list` than for `summary`, since the cost of a
 *    wide summary is bounded by the number of agents and positions rather than shifts.
 *  - **Drafts are admin-only**, matching the rest of agendo. An unpublished shift is a
 *    plan, and plans about people's working hours are not team-readable by default.
 */

/** A `list` spanning more days than this is refused rather than truncated. */
const MAX_LIST_DAYS = 31;
/** A `summary` collapses to agents x positions, so a wider window stays cheap. */
const MAX_SUMMARY_DAYS = 366;
/** Rows in a `list` before it is capped. */
const LIST_CAP = 80;

/**
 * Accept a whole UTC day (`2026-10-06`) or an exact instant
 * (`2026-10-06T15:30:00Z`), so the same tool answers "this month" and "the next
 * 15 minutes".
 *
 * `end: true` turns a bare day into the *end* of that day, making `to` inclusive the way
 * a person means it: `from: 2026-10-06, to: 2026-10-06` is that whole day, not an empty
 * instant-to-itself window.
 */
function parseMoment(value, field, { end = false } = {}) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const day = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) {
      throw new Error(`${field} is not a real date: ${raw}`);
    }
    return end ? new Date(day.getTime() + 86400000) : day;
  }
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) {
    throw new Error(
      `${field} must be a UTC day (YYYY-MM-DD) or an ISO instant (2026-10-06T15:30:00Z); got ${JSON.stringify(value)}`,
    );
  }
  return at;
}

/**
 * Resolve one filter list of names into a set of matching ids.
 *
 * Returns `{ ids, labels, unmatched }` rather than throwing on a miss, so a query naming
 * five agents and misspelling one still answers for the four and says which failed —
 * more useful than refusing the whole thing.
 */
function resolveNames(names, candidates, finder, idOf, labelOf) {
  const ids = new Set();
  const labels = [];
  const unmatched = [];
  for (const name of names) {
    const matches = finder(name, candidates);
    if (!matches.length) {
      unmatched.push(name);
      continue;
    }
    for (const match of matches) {
      ids.add(String(idOf(match)));
      labels.push(labelOf(match));
    }
  }
  return { ids, labels, unmatched };
}

/** A shift with no `status` predates the field and is published. Never test `=== "published"`. */
function isDraft(shift) {
  return shift.status === "draft";
}

/** `isSynced` is absent on ~40 legacy documents; absent means not synced. */
function isSynced(shift) {
  return shift.isSynced === true;
}

export function registerFindTools(server, caller) {
  const timeZone = safeTimeZone(caller.mongoUser?.timezone);

  registerTool(server, caller, {
    name: "find_shifts",
    level: "user",
    title: "Query shifts",
    description:
      "The general shift query — use it for anything the narrower tools do not cover " +
      "exactly. Filters combine: agents, locations, positions, position types, an " +
      "arbitrary time window (15 minutes or 6 months), publication status, whether the " +
      "shift reached Google Calendar, and where it came from. " +
      "Returns totals by default ('summary'), grouped rows by position ('by_position'), " +
      "or the individual shifts ('list'). " +
      "Examples: unsynced published shifts this week; how much development time APAC had " +
      "last month; every draft from a given import; who is on between 14:00 and 14:15.",
    inputSchema: {
      from: z
        .string()
        .describe(
          "Window start: a UTC day (2026-10-06) or an ISO instant (2026-10-06T14:00:00Z).",
        ),
      to: z
        .string()
        .describe(
          "Window end. A bare day means the END of that day, so from=to covers that whole day.",
        ),
      agents: z
        .array(z.string())
        .optional()
        .describe('Agent names. Use "me" for the signed-in user. Omit for everyone.'),
      locations: z
        .array(z.string())
        .optional()
        .describe(
          "Location names (e.g. APAC, Israel, LATAM, Colorado). Narrows to the agents assigned there.",
        ),
      positions: z
        .array(z.string())
        .optional()
        .describe("Position names, e.g. ['Chats','Personal Queue']."),
      position_types: z
        .array(z.string())
        .optional()
        .describe(
          "Position categories: development, tickets, meeting, training, break, live channel. " +
            "A type covers several positions, so this is usually what 'development time' means.",
        ),
      status: z
        .enum(["published", "draft", "any"])
        .optional()
        .describe(
          "Default 'published'. Drafts are admin-only — an unpublished shift is a plan.",
        ),
      synced: z
        .boolean()
        .optional()
        .describe(
          "true = only shifts that reached Google Calendar; false = only those that did not. " +
            "Omit for both. Note most published shifts are not synced.",
        ),
      sources: z
        .array(z.string())
        .optional()
        .describe(
          "Where the shift came from: 'sling-import', 'ui', 'mcp', or a generator's name.",
        ),
      format: z
        .enum(["summary", "by_position", "list"])
        .optional()
        .describe(
          "'summary' (default) totals by agent and position; 'by_position' groups agents " +
            "under each position; 'list' returns individual shifts (narrow the window first).",
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (args, ctx) => {
      const format = args.format || "summary";
      const status = args.status || "published";

      if (status !== "published" && !ctx.isAdmin) {
        return textResult(
          `Draft shifts are admin-only — you are signed in as ${ctx.mongoUser.email} ` +
            `(role: ${ctx.mongoUser.type}). Drop the status filter to query published shifts.`,
        );
      }

      const from = parseMoment(args.from, "from");
      const to = parseMoment(args.to, "to", { end: true });
      if (to <= from) {
        throw new Error(`"to" (${args.to}) is not after "from" (${args.from})`);
      }
      const days = (to - from) / 86400000;
      const maxDays = format === "list" ? MAX_LIST_DAYS : MAX_SUMMARY_DAYS;
      if (days > maxDays) {
        throw new Error(
          `that window is ${Math.ceil(days)} days; the limit is ${maxDays} for format "${format}"` +
            (format === "list"
              ? ` — use format "summary" for a longer period`
              : ""),
        );
      }

      const roster = await loadRoster();
      const notes = [];
      const filters = [];

      // --- who ---
      let agentIds = null;
      if (args.agents?.length) {
        const names = args.agents.map((n) =>
          String(n).trim().toLowerCase() === "me"
            ? userDisplayName(ctx.mongoUser)
            : n,
        );
        const r = resolveNames(
          names,
          roster.users,
          findUsersByName,
          (u) => u.clerkId,
          (u) => userDisplayName(u),
        );
        if (r.unmatched.length) {
          notes.push(`No agent matched: ${r.unmatched.join(", ")}.`);
        }
        if (!r.ids.size) {
          return textResult(
            `None of those agent names matched anyone on the ${roster.users.length}-person roster.`,
          );
        }
        agentIds = r.ids;
        filters.push(`agents ${r.labels.join(", ")}`);
      }

      if (args.locations?.length) {
        const r = resolveNames(
          args.locations,
          roster.locations,
          findLocationsByName,
          (l) => l._id,
          (l) => l.name,
        );
        if (r.unmatched.length) {
          notes.push(
            `No location matched: ${r.unmatched.join(", ")}. Known: ${roster.locations.map((l) => l.name).join(", ")}.`,
          );
        }
        const fromLocations = new Set();
        for (const location of roster.locations) {
          if (!r.ids.has(String(location._id))) continue;
          for (const clerkId of location.assignedUsers || []) {
            fromLocations.add(String(clerkId));
          }
        }
        if (!fromLocations.size) {
          return textResult(
            `No agents are assigned to ${args.locations.join(", ")}.` +
              (notes.length ? `\n${notes.join("\n")}` : ""),
          );
        }
        // Intersect with any explicit agent filter rather than widening it.
        agentIds = agentIds
          ? new Set([...agentIds].filter((id) => fromLocations.has(id)))
          : fromLocations;
        filters.push(
          `location ${r.labels.join(", ")} (${fromLocations.size} agents)`,
        );
        if (!agentIds.size) {
          return textResult(
            `No agent is both named and assigned to those locations.`,
          );
        }
      }

      // --- what ---
      let positionIds = null;
      if (args.positions?.length) {
        const r = resolveNames(
          args.positions,
          roster.positions,
          findPositionsByName,
          (p) => p._id,
          (p) => p.name,
        );
        if (r.unmatched.length) {
          notes.push(`No position matched: ${r.unmatched.join(", ")}.`);
        }
        positionIds = r.ids;
        filters.push(`positions ${r.labels.join(", ")}`);
      }
      if (args.position_types?.length) {
        const wanted = args.position_types.map((t) =>
          String(t).trim().toLowerCase(),
        );
        const matched = roster.positions.filter((p) =>
          wanted.includes(String(p.type || "").toLowerCase()),
        );
        if (!matched.length) {
          const known = [
            ...new Set(roster.positions.map((p) => p.type).filter(Boolean)),
          ].sort();
          return textResult(
            `No position type matched ${args.position_types.join(", ")}. Known types: ${known.join(", ")}.`,
          );
        }
        const ids = new Set(matched.map((p) => String(p._id)));
        positionIds = positionIds
          ? new Set([...positionIds].filter((id) => ids.has(id)))
          : ids;
        filters.push(
          `type ${wanted.join("/")} (${matched.length} positions)`,
        );
      }
      if (positionIds && !positionIds.size) {
        return textResult(
          `No position satisfies all of those position filters together.`,
        );
      }

      // --- fetch and filter ---
      let shifts = await shiftService.findShiftsByRange(from, to, {
        includeDrafts: status !== "published",
      });

      if (status === "draft") shifts = shifts.filter(isDraft);
      if (agentIds) shifts = shifts.filter((s) => agentIds.has(s.userId));
      if (positionIds)
        shifts = shifts.filter((s) => positionIds.has(String(s.positionId)));
      if (args.synced !== undefined)
        shifts = shifts.filter((s) => isSynced(s) === args.synced);
      if (args.sources?.length) {
        const wanted = args.sources.map((s) => String(s).trim().toLowerCase());
        shifts = shifts.filter((s) =>
          wanted.includes(String(s.source || "").toLowerCase()),
        );
      }

      if (status !== "published") filters.push(`status ${status}`);
      if (args.synced !== undefined)
        filters.push(args.synced ? "on Google Calendar" : "not on Google Calendar");
      if (args.sources?.length) filters.push(`source ${args.sources.join("/")}`);

      // Whole-day windows read as dates; anything finer shows the clock, so a
      // fifteen-minute query does not render as a one-day one.
      const wholeDays =
        from.getTime() % 86400000 === 0 && to.getTime() % 86400000 === 0;
      const lastDay = new Date(to.getTime() - 1);
      const windowLabel = wholeDays
        ? dayKey(from, "UTC") === dayKey(lastDay, "UTC")
          ? dayLabel(from, timeZone)
          : `${dayLabel(from, timeZone)} – ${dayLabel(lastDay, timeZone)}`
        : `${dayLabel(from, timeZone)} ${timeRange(from, to, timeZone)}`;
      const heading =
        `Shifts, ${windowLabel}` + (filters.length ? ` — ${filters.join("; ")}` : "");

      if (!shifts.length) {
        return textResult([heading, "", "Nothing matches.", ...notes]);
      }

      // --- render ---
      const clip = (shift) => {
        const start = Math.max(shift.startTime.getTime(), from.getTime());
        const end = Math.min(shift.endTime.getTime(), to.getTime());
        return Math.max(0, (end - start) / 60000);
      };
      const hrs = (minutes) => Math.round((minutes / 60) * 10) / 10;

      if (format === "list") {
        shifts.sort((a, b) => a.startTime - b.startTime);
        const { items, note } = cap(shifts, LIST_CAP);
        const lines = [heading, ""];
        let lastDay = null;
        for (const shift of items) {
          const key = dayKey(shift.startTime, timeZone);
          if (key !== lastDay) {
            lines.push(dayLabel(shift.startTime, timeZone));
            lastDay = key;
          }
          lines.push(
            `  ${timeRange(shift.startTime, shift.endTime, timeZone)}  ` +
              `${resolveUserLabel(shift.userId, roster.usersByClerkId)}  ` +
              `${resolvePositionName(shift.positionId, roster.positionsById)}  ` +
              `(${duration(shift.startTime, shift.endTime)})` +
              `${isDraft(shift) ? "  [draft]" : ""}` +
              `${isSynced(shift) ? "  [synced]" : ""}`,
          );
        }
        lines.push("", `${shifts.length} shifts.`);
        if (note) lines.push(note);
        return textResult([...lines, ...notes]);
      }

      const byAgent = new Map();
      const byPosition = new Map();
      let total = 0;
      for (const shift of shifts) {
        const minutes = clip(shift);
        if (!minutes) continue;
        total += minutes;
        const a = byAgent.get(shift.userId) || { minutes: 0, count: 0 };
        a.minutes += minutes;
        a.count += 1;
        byAgent.set(shift.userId, a);
        const key = String(shift.positionId);
        const p = byPosition.get(key) || { minutes: 0, count: 0, agents: new Map() };
        p.minutes += minutes;
        p.count += 1;
        p.agents.set(shift.userId, (p.agents.get(shift.userId) || 0) + minutes);
        byPosition.set(key, p);
      }

      const lines = [
        heading,
        "",
        `${hrs(total)}h across ${shifts.length} shift${shifts.length === 1 ? "" : "s"}, ` +
          `${byAgent.size} agent${byAgent.size === 1 ? "" : "s"}, ` +
          `${byPosition.size} position${byPosition.size === 1 ? "" : "s"}.`,
      ];

      if (format === "by_position") {
        const ordered = [...byPosition.entries()].sort(
          (a, b) => b[1].minutes - a[1].minutes,
        );
        for (const [id, p] of ordered) {
          const position = roster.positionsById.get(id);
          lines.push(
            "",
            `${position?.name || `unknown position (${id})`}` +
              `${position?.type ? ` [${position.type}]` : ""} — ${hrs(p.minutes)}h`,
          );
          const people = [...p.agents.entries()].sort((a, b) => b[1] - a[1]);
          for (const [clerkId, minutes] of people.slice(0, 25)) {
            lines.push(
              `  ${hrs(minutes)}h  ${resolveUserLabel(clerkId, roster.usersByClerkId)}`,
            );
          }
          if (people.length > 25) {
            lines.push(`  … ${people.length - 25} more agents`);
          }
        }
        return textResult([...lines, "", ...notes]);
      }

      lines.push("", "By agent:");
      const agents = [...byAgent.entries()]
        .map(([clerkId, v]) => ({
          label: resolveUserLabel(clerkId, roster.usersByClerkId),
          hours: hrs(v.minutes),
          count: v.count,
        }))
        .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
      const ca = cap(agents, 40);
      for (const a of ca.items) {
        lines.push(
          `  ${a.hours}h  ${a.label}  (${a.count} shift${a.count === 1 ? "" : "s"})`,
        );
      }
      if (ca.note) lines.push(`  ${ca.note}`);

      lines.push("", "By position:");
      const positions = [...byPosition.entries()]
        .map(([id, v]) => {
          const position = roster.positionsById.get(id);
          return {
            label: position?.name || `unknown position (${id})`,
            type: position?.type || "",
            hours: hrs(v.minutes),
            count: v.count,
          };
        })
        .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
      const cp = cap(positions, 40);
      for (const p of cp.items) {
        lines.push(
          `  ${p.hours}h  ${p.label}${p.type ? ` [${p.type}]` : ""}  ` +
            `(${p.count} shift${p.count === 1 ? "" : "s"})`,
        );
      }
      if (cp.note) lines.push(`  ${cp.note}`);

      lines.push(
        "",
        "Hours are clipped to the window, so a shift crossing its edge counts only the part inside.",
      );
      return textResult([...lines, ...notes]);
    },
  });
}

export default { registerFindTools };
