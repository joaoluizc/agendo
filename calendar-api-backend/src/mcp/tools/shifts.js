import { z } from "zod";
import shiftService from "../../services/shiftService.js";
import { registerTool } from "../lib/registerTool.js";
import {
  loadRoster,
  findUsersByName,
  findPositionsByName,
  resolvePositionName,
  userDisplayName,
} from "../lib/roster.js";
import {
  safeTimeZone,
  dayLabel,
  timeRange,
  duration,
  textResult,
  parseUtcDate,
  parseUtcDateTime,
  addDays,
  cap,
} from "../lib/format.js";

/**
 * Write tools for schedule builders (Scheduling: edit) — deliberately confined to the
 * **draft** layer.
 *
 * A shift is a draft until someone publishes it in agendo, and publishing is the single act that
 * reaches an agent's real Google Calendar (see ShiftModel's class comment). These tools
 * create, change and remove drafts; they never publish, and they refuse to touch a shift
 * that is already published.
 *
 * That is a safety boundary, not an oversight, and it rests on where the orchestration
 * lives:
 *
 *  - `shiftService.publishShifts` only flips the status. Syncing the newly-published
 *    shifts to Google Calendar is the *controller's* job and must happen after it
 *    returns. A tool calling the service directly would leave shifts marked published
 *    with no calendar event behind them.
 *  - `shiftService.deleteShift` only removes the document. Removing the matching calendar
 *    event is likewise the controller's. Deleting a published shift here would orphan a
 *    real event on a real person's calendar.
 *
 * So the division is: **an LLM may draft a schedule; a human commits it.** That is also
 * what the plan wanted from a dry run — the draft layer already is one, and a durable,
 * reviewable one at that. Publishing from MCP needs the sync orchestration extracted
 * first, which is its own piece of work.
 *
 * Everything written here carries `source: "mcp"`, so a draft's provenance is visible in
 * the data rather than inferred.
 */

/** Where a shift written by these tools says it came from. */
const MCP_SOURCE = "mcp";

/** Drafts returned by a single selector lookup before it is treated as too broad. */
const SELECTOR_CAP = 25;

/** Resolve exactly one roster member, or explain why not. */
function resolveOneUser(name, users) {
  const matches = findUsersByName(name, users);
  if (!matches.length) {
    throw new Error(
      `no agendo user matches "${name}" (the roster has ${users.length} people)`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `"${name}" matches ${matches.length} people — be more specific: ` +
        matches.map((u) => userDisplayName(u)).join(", "),
    );
  }
  return matches[0];
}

/** Resolve exactly one position, or explain why not. */
function resolveOnePosition(name, positions) {
  const matches = findPositionsByName(name, positions);
  if (!matches.length) {
    throw new Error(
      `no position matches "${name}". Positions include: ` +
        positions
          .slice(0, 12)
          .map((p) => p.name)
          .join(", ") +
        (positions.length > 12 ? ", …" : ""),
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `"${name}" matches ${matches.length} positions — be more specific: ` +
        matches.map((p) => p.name).join(", "),
    );
  }
  return matches[0];
}

/**
 * Start and end as UTC instants.
 *
 * An end at or before the start is read as running past midnight and rolled to the next
 * day — a 22:00–02:00 shift is the normal shape of a night rota here, not a typo. The
 * rendered result always states both ends, so the interpretation is visible.
 */
function resolveShiftWindow(date, start, end) {
  const startAt = parseUtcDateTime(date, start, "start");
  let endAt = parseUtcDateTime(date, end, "end");
  if (endAt <= startAt) endAt = addDays(endAt, 1);
  return { startAt, endAt };
}

/** Drafts only — the single place these tools decide what they may touch. */
function isDraft(shift) {
  return shift.status === "draft";
}

/**
 * Find the draft shifts a selector points at.
 *
 * Published shifts are located too, but only so the refusal can say *why* nothing
 * matched. "No draft found" when a published shift is sitting right there would send an
 * admin hunting for a typo that is not there.
 */
async function selectDrafts({ agent, date, start, position }, roster) {
  const user = resolveOneUser(agent, roster.users);
  const dayStart = parseUtcDate(date, "date");
  const dayEnd = addDays(dayStart, 1);

  const all = await shiftService.findShiftsByRange(dayStart, dayEnd, {
    includeDrafts: true,
  });

  let mine = all.filter((shift) => shift.userId === user.clerkId);

  if (start) {
    const at = parseUtcDateTime(date, start, "start");
    mine = mine.filter((shift) => shift.startTime.getTime() === at.getTime());
  }
  if (position) {
    const wanted = resolveOnePosition(position, roster.positions);
    mine = mine.filter(
      (shift) => String(shift.positionId) === String(wanted._id),
    );
  }

  const drafts = mine.filter(isDraft).sort((a, b) => a.startTime - b.startTime);
  const published = mine.filter((shift) => !isDraft(shift));
  return { user, drafts, published, dayStart };
}

/** One line describing a shift, for confirmations and candidate lists. */
function describeShift(shift, positionsById, timeZone) {
  return (
    `${dayLabel(shift.startTime, timeZone)}  ` +
    `${timeRange(shift.startTime, shift.endTime, timeZone)}  ` +
    `${resolvePositionName(shift.positionId, positionsById)}  ` +
    `(${duration(shift.startTime, shift.endTime)})`
  );
}

export function registerShiftWriteTools(server, caller) {
  const timeZone = safeTimeZone(caller.mongoUser?.timezone);

  const selectorShape = {
    agent: z.string().describe("The agent whose shift this is, by name."),
    date: z
      .string()
      .describe("The UTC day the shift starts on, YYYY-MM-DD."),
    start: z
      .string()
      .optional()
      .describe(
        "The shift's start time, HH:MM in UTC. Needed when the agent has more than one draft that day.",
      ),
    position: z
      .string()
      .optional()
      .describe("The position name, to narrow further."),
  };

  registerTool(server, caller, {
    name: "create_shift",
    requires: "scheduling:edit",
    title: "Draft a shift",
    description:
      "Create a draft shift for one or more agents. Drafts are plans: they do not appear " +
      "on the schedule's published view, are not synced to anyone's Google Calendar, and " +
      "are not counted as coverage. Someone with Scheduling: edit publishes them in agendo's UI, which is the " +
      "deliberate step that reaches real calendars. Times are UTC.",
    inputSchema: {
      agents: z
        .array(z.string())
        .min(1)
        .describe("Agent names. One draft is created per agent."),
      date: z.string().describe("The UTC day the shift starts on, YYYY-MM-DD."),
      start: z.string().describe("Start time, HH:MM in UTC."),
      end: z
        .string()
        .describe(
          "End time, HH:MM in UTC. An end at or before the start means it runs past midnight.",
        ),
      position: z.string().describe("The position name, e.g. 'Chats' or 'QA'."),
      notes: z
        .string()
        .optional()
        .describe("Free text shown to whoever reviews the draft."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const roster = await loadRoster();
      const position = resolveOnePosition(args.position, roster.positions);
      const { startAt, endAt } = resolveShiftWindow(
        args.date,
        args.start,
        args.end,
      );
      const users = args.agents.map((name) =>
        resolveOneUser(name, roster.users),
      );

      const { created, errors } = await shiftService.createShifts(
        users.map((user) => ({
          userId: user.clerkId,
          startTime: startAt,
          endTime: endAt,
          positionId: position._id,
          createdBy: ctx.clerkId,
          status: "draft",
          source: MCP_SOURCE,
          notes: args.notes,
        })),
      );

      const lines = [
        `Drafted ${created.length} shift${created.length === 1 ? "" : "s"} — ` +
          `${position.name}, ${dayLabel(startAt, timeZone)}, ` +
          `${timeRange(startAt, endAt, timeZone)} (${duration(startAt, endAt)}):`,
        "",
        ...users
          .slice(0, created.length)
          .map((user) => `  • ${userDisplayName(user)}`),
      ];
      if (errors?.length) {
        lines.push("", `${errors.length} failed:`);
        for (const err of errors.slice(0, 5)) {
          lines.push(`  • ${err.message || err}`);
        }
      }
      lines.push(
        "",
        "These are drafts. Nothing has reached anyone's Google Calendar — publish them in agendo to do that.",
      );
      return textResult(lines);
    },
  });

  registerTool(server, caller, {
    name: "list_draft_shifts",
    requires: "scheduling:edit",
    title: "Draft shifts for a day",
    description:
      "The unpublished draft shifts on a given UTC day, optionally for one agent. The " +
      "other schedule tools deliberately show only published shifts, so this is how to " +
      "review what has been drafted but not yet committed.",
    inputSchema: {
      date: z.string().describe("The UTC day to list, YYYY-MM-DD."),
      agent: z
        .string()
        .optional()
        .describe("Limit to one agent, by name. Omit for everyone."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (args) => {
      const roster = await loadRoster();
      const dayStart = parseUtcDate(args.date, "date");
      const all = await shiftService.findShiftsByRange(
        dayStart,
        addDays(dayStart, 1),
        { includeDrafts: true },
      );

      let drafts = all.filter(isDraft);
      let who = "everyone";
      if (args.agent) {
        const user = resolveOneUser(args.agent, roster.users);
        drafts = drafts.filter((shift) => shift.userId === user.clerkId);
        who = userDisplayName(user);
      }
      drafts.sort((a, b) => a.startTime - b.startTime);

      if (!drafts.length) {
        return textResult(
          `No draft shifts on ${dayLabel(dayStart, timeZone)} for ${who}.`,
        );
      }

      const { items, note } = cap(drafts);
      const byUser = new Map();
      for (const shift of items) {
        if (!byUser.has(shift.userId)) byUser.set(shift.userId, []);
        byUser.get(shift.userId).push(shift);
      }

      const lines = [
        `${drafts.length} draft shift${drafts.length === 1 ? "" : "s"} on ${dayLabel(dayStart, timeZone)} (${who}) — not published, not on any calendar:`,
      ];
      for (const [clerkId, theirs] of byUser) {
        const user = roster.usersByClerkId.get(clerkId);
        lines.push("", userDisplayName(user) || `unknown agent (${clerkId})`);
        for (const shift of theirs) {
          lines.push(
            `  ${timeRange(shift.startTime, shift.endTime, timeZone)}  ` +
              `${resolvePositionName(shift.positionId, roster.positionsById)}` +
              (shift.source && shift.source !== "ui"
                ? `  [${shift.source}]`
                : "") +
              (shift.notes ? `  — ${shift.notes}` : ""),
          );
        }
      }
      if (note) lines.push("", note);
      return textResult(lines);
    },
  });

  registerTool(server, caller, {
    name: "update_shift",
    requires: "scheduling:edit",
    title: "Change a draft shift",
    description:
      "Change the times or position of an existing DRAFT shift, identified by agent and " +
      "day. Published shifts cannot be changed here — edit those in agendo, where the " +
      "Google Calendar event is kept in step. Give `start` or `position` to narrow when " +
      "the agent has several drafts that day.",
    inputSchema: {
      ...selectorShape,
      new_start: z.string().optional().describe("New start time, HH:MM UTC."),
      new_end: z.string().optional().describe("New end time, HH:MM UTC."),
      new_position: z.string().optional().describe("New position name."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async (args) => {
      if (!args.new_start && !args.new_end && !args.new_position) {
        throw new Error(
          "nothing to change — give new_start, new_end and/or new_position",
        );
      }

      const roster = await loadRoster();
      const { drafts, published } = await selectDrafts(args, roster);

      if (!drafts.length) {
        return textResult(
          published.length
            ? `That matches ${published.length} PUBLISHED shift${published.length === 1 ? "" : "s"}, which this tool will not change — ` +
                `editing a published shift has to keep its Google Calendar event in step, so do it in agendo:\n` +
                published
                  .map(
                    (s) =>
                      `  ${describeShift(s, roster.positionsById, timeZone)}`,
                  )
                  .join("\n")
            : `No draft shift matches that.`,
        );
      }
      if (drafts.length > 1) {
        return textResult([
          `That matches ${drafts.length} drafts — add \`start\` (and \`position\` if needed) to pick one:`,
          ...drafts
            .slice(0, SELECTOR_CAP)
            .map(
              (s) => `  • ${describeShift(s, roster.positionsById, timeZone)}`,
            ),
        ]);
      }

      const [shift] = drafts;
      const before = describeShift(shift, roster.positionsById, timeZone);

      const startTime = args.new_start
        ? parseUtcDateTime(args.date, args.new_start, "new_start")
        : shift.startTime;
      let endTime = args.new_end
        ? parseUtcDateTime(args.date, args.new_end, "new_end")
        : shift.endTime;
      if (endTime <= startTime) endTime = addDays(endTime, 1);

      const positionId = args.new_position
        ? resolveOnePosition(args.new_position, roster.positions)._id
        : shift.positionId;

      // `status` is deliberately not passed: shiftService.updateShift leaves it alone
      // when undefined, and an edit must never publish as a side effect.
      const updated = await shiftService.updateShift(shift._id, {
        startTime,
        endTime,
        userId: shift.userId,
        positionId,
        isSynced: shift.isSynced,
        syncedEvent: shift.syncedEvent,
      });

      return textResult([
        "Draft updated.",
        `  before: ${before}`,
        `  after:  ${describeShift(updated, roster.positionsById, timeZone)}`,
        "",
        "Still a draft — publish it in agendo to put it on the calendar.",
      ]);
    },
  });

  registerTool(server, caller, {
    name: "delete_shift",
    requires: "scheduling:edit",
    title: "Delete draft shifts",
    description:
      "Delete DRAFT shifts for an agent on a day. Published shifts are never deleted " +
      "here — removing one has to remove its Google Calendar event too, which only " +
      "agendo does. Without `start` or `position` this deletes every draft that agent " +
      "has that day, and says exactly which ones first.",
    inputSchema: selectorShape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    handler: async (args) => {
      const roster = await loadRoster();
      const { user, drafts, published } = await selectDrafts(args, roster);

      if (!drafts.length) {
        return textResult(
          published.length
            ? `That matches ${published.length} PUBLISHED shift${published.length === 1 ? "" : "s"} and no drafts. ` +
                `This tool does not delete published shifts — their calendar events have to go with them, so delete those in agendo.`
            : `No draft shift matches that — nothing deleted.`,
        );
      }

      const describing = drafts.map(
        (s) => `  • ${describeShift(s, roster.positionsById, timeZone)}`,
      );
      await shiftService.deleteShifts(drafts.map((shift) => shift._id));

      const lines = [
        `Deleted ${drafts.length} draft shift${drafts.length === 1 ? "" : "s"} for ${userDisplayName(user)}:`,
        ...describing,
      ];
      if (published.length) {
        lines.push(
          "",
          `${published.length} published shift${published.length === 1 ? "" : "s"} on that day were left untouched.`,
        );
      }
      return textResult(lines);
    },
  });
}

export default { registerShiftWriteTools };
