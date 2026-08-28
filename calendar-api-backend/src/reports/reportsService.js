import { User } from "../models/UserModel.js";
import Position from "../models/PositionModel.js";
import Location from "../models/LocationModel.js";
import shiftService from "../services/shiftService.js";
import slingController from "../controllers/slingController.js";
import redisClient from "../database/redisClient.js";
import { ReportGroup } from "./reportGroupModel.js";

const GROUP_NAMES = ["Tickets", "Chats"];
const OTHER = "Other";

// Seeded once on first use so the report works out of the box — see README.md.
const DEFAULT_GROUP_SEEDS = {
  Tickets: [
    "CB/Enterprise",
    "CB/General queue",
    "Personal Queue",
    "Enterprise, VMs, Urgent tickets",
    "General Queue",
    "CB/tickets",
    "LATAM queue",
    "tickets",
    "urgent tickets",
  ],
  Chats: ["Chats", "Customer Chat", "chat"],
};

function normalize(name) {
  return String(name || "").trim().toLowerCase();
}

// Memoised so concurrent first-requests in one process can't double-seed (mirrors
// jiraBacklog's taskService.seedStatusesIfEmpty); the unique index on `name` is the
// cross-process guard.
let seedPromise = null;
function seedGroupsIfEmpty() {
  if (!seedPromise) seedPromise = doSeedGroups();
  return seedPromise;
}
async function doSeedGroups() {
  const count = await ReportGroup.estimatedDocumentCount();
  if (count > 0) return;
  await ReportGroup.insertMany(
    GROUP_NAMES.map((name, order) => ({
      name,
      positionNames: DEFAULT_GROUP_SEEDS[name],
      order,
    })),
  );
  console.log("[reports] seeded default Tickets/Chats groups");
}

async function getGroups() {
  await seedGroupsIfEmpty();
  return ReportGroup.find().sort({ order: 1 }).lean();
}

// Whole-list replace (matches coverageMeterController.replaceMeters). A name can't count
// toward both groups, so if the payload has it in both, the later group in GROUP_NAMES
// order wins — cheaper than rejecting the save outright, and the frontend already
// prevents this case at the UI level.
async function replaceGroups(groups) {
  if (!Array.isArray(groups)) {
    throw new Error("groups must be an array");
  }
  const byName = new Map(groups.map((g) => [g?.name, g]));
  for (const name of GROUP_NAMES) {
    if (!byName.has(name)) {
      throw new Error(`missing group "${name}"`);
    }
  }

  const claimed = new Map(); // normalized name -> { name, display }
  for (const name of GROUP_NAMES) {
    const positionNames = Array.isArray(byName.get(name)?.positionNames)
      ? byName.get(name).positionNames
      : [];
    for (const raw of positionNames) {
      const norm = normalize(raw);
      if (!norm) continue;
      claimed.set(norm, { name, display: String(raw).trim() });
    }
  }

  const finalByGroup = { Tickets: [], Chats: [] };
  for (const { name, display } of claimed.values()) {
    finalByGroup[name].push(display);
  }

  await Promise.all(
    GROUP_NAMES.map((name, order) =>
      ReportGroup.updateOne(
        { name },
        { $set: { positionNames: finalByGroup[name], order } },
        { upsert: true },
      ),
    ),
  );

  return getGroups();
}

/** normalized position name -> "Tickets" | "Chats" | "Other" */
async function buildClassifier() {
  const groups = await getGroups();
  const map = new Map();
  for (const group of groups) {
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
function clampedMinutes(shiftStart, shiftEnd, rangeStart, rangeEnd) {
  const start = Math.max(new Date(shiftStart).getTime(), rangeStart.getTime());
  const end = Math.min(new Date(shiftEnd).getTime(), rangeEnd.getTime());
  if (!(end > start)) return 0;
  return (end - start) / 60000;
}

function emptyMinutes() {
  return { Tickets: 0, Chats: 0, Other: 0 };
}

/**
 * Midnight tonight, in the server's local time (same convention as utils.todayISO). The
 * report only ever covers time up to today: a range reaching past this is clamped to it,
 * so shifts booked for tomorrow and beyond can't inflate anyone's hours just because the
 * selected preset runs to the end of the quarter. Today stays whole — every preset the
 * frontend picker produces is day-aligned, so cutting off mid-day would make the numbers
 * shift hour by hour within a single day.
 */
function endOfToday() {
  const end = new Date();
  end.setHours(24, 0, 0, 0);
  return end;
}

/**
 * Hours worked per agent, per report group, over [start, end]. Merges agendo-native
 * shifts with Sling-sourced ones (best-effort — a Sling failure or empty response still
 * returns native-only results, since Sling is expected to go away eventually). Hours are
 * truncated to whole numbers, never rounded, per product decision; the Total column
 * floors the true summed minutes rather than summing the already-floored group cells, so
 * it can occasionally read 1h higher than its visible group cells add up to.
 *
 * Cached in Redis (see getHoursReport wrapper below) — this is the expensive part: a
 * Position/User table scan plus a live Sling API call, on every distinct range.
 */
async function computeHoursReport({ start, end, groupByLocation }) {
  const rangeStart = new Date(start);
  const rangeEnd = new Date(Math.min(new Date(end).getTime(), endOfToday().getTime()));
  // The whole range sits in the future — nothing has been worked yet, so there is no
  // report to build (and no reason to hit Mongo or Sling for it).
  if (!(rangeEnd > rangeStart)) return [];
  const effectiveEnd = rangeEnd.toISOString();
  const classify = await buildClassifier();

  const positions = await Position.find().select("name").lean();
  const positionNameById = new Map(positions.map((p) => [String(p._id), p.name]));

  const users = await User.find().select("clerkId email firstName lastName").lean();
  const userByClerkId = new Map(users.map((u) => [u.clerkId, u]));
  const userByEmail = new Map(
    users.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]),
  );

  const rowsByKey = new Map(); // key -> { key, label, minutes }
  function addMinutes(key, label, group, minutes) {
    if (minutes <= 0) return;
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, { key, label, minutes: emptyMinutes() });
    }
    rowsByKey.get(key).minutes[group] += minutes;
  }

  // Native shifts. A shift whose userId matches no `users` doc is skipped outright rather
  // than reported under its raw clerk id: `Shift` is one shared collection while `User`
  // is env-split into `dev-users`/`users` (see models/UserModel.js), so a local dev run
  // against the same cluster writes real rows into production `shifts` keyed by a
  // dev-only clerk id. Those, plus shifts left behind by deleted accounts, are the only
  // way this lookup can miss — a current agent always has a `users` doc — so dropping
  // them keeps dev data out without touching any active roster member's hours.
  const nativeShifts = await shiftService.findShiftsByRange(rangeStart, rangeEnd);
  let skippedUnmatched = 0;
  for (const shift of nativeShifts) {
    const minutes = clampedMinutes(shift.startTime, shift.endTime, rangeStart, rangeEnd);
    if (minutes <= 0) continue;
    const user = userByClerkId.get(shift.userId);
    if (!user) {
      skippedUnmatched += 1;
      continue;
    }
    const positionName = shift.positionId ? positionNameById.get(String(shift.positionId)) : "";
    const group = classify(positionName);
    addMinutes(user.clerkId, `${user.firstName} ${user.lastName}`.trim(), group, minutes);
  }
  if (skippedUnmatched > 0) {
    console.log(
      `[reports] skipped ${skippedUnmatched} shift(s) with no matching user, range ${start} - ${effectiveEnd}`,
    );
  }

  // Sling shifts — never let a Sling outage (or its eventual removal) fail the report.
  try {
    const slingBlocks = await slingController.getCalendar(`${start}/${effectiveEnd}`);
    for (const block of slingBlocks || []) {
      const email = block?.email ? String(block.email).toLowerCase() : "";
      const user = email ? userByEmail.get(email) : null;
      // Unmatched Sling agents (no agendo User with that email) still count, keyed by
      // their Sling identity, so the hours aren't silently dropped.
      const key = user ? user.clerkId : `sling:${email || block?.id}`;
      const label = user
        ? `${user.firstName} ${user.lastName}`.trim()
        : block?.name || block?.legalName || "Unknown";
      for (const shift of block?.shifts || []) {
        const minutes = clampedMinutes(shift.dtstart, shift.dtend, rangeStart, rangeEnd);
        if (minutes <= 0) continue;
        const group = classify(shift.position?.name);
        addMinutes(key, label, group, minutes);
      }
    }
  } catch (err) {
    console.error(
      `[reports] Sling fetch failed, continuing with native shifts only: ${err.message}`,
    );
  }

  let locationByClerkId = new Map();
  if (groupByLocation) {
    const locations = await Location.find().select("name assignedUsers").lean();
    for (const loc of locations) {
      for (const clerkId of loc.assignedUsers || []) {
        // First match wins — the model doesn't enforce a user belongs to only one location.
        if (!locationByClerkId.has(clerkId)) locationByClerkId.set(clerkId, loc.name);
      }
    }
  }

  const rows = [...rowsByKey.values()]
    // An agent with no Tickets/Chats time at all (only Other, or nothing) isn't
    // interesting for this report — drop them. Checked on the raw minutes, not the
    // floored display hours, so someone with real but sub-hour Tickets/Chats time
    // (would display as "0h") is still kept rather than silently dropped.
    .filter(({ minutes }) => minutes.Tickets > 0 || minutes.Chats > 0)
    .map(({ key, label, minutes }) => {
      const totalMinutes = minutes.Tickets + minutes.Chats + minutes.Other;
      return {
        id: key,
        name: label,
        locationName: groupByLocation ? locationByClerkId.get(key) || "Unassigned" : undefined,
        hours: {
          Tickets: Math.floor(minutes.Tickets / 60),
          Chats: Math.floor(minutes.Chats / 60),
          Other: Math.floor(minutes.Other / 60),
        },
        totalHours: Math.floor(totalMinutes / 60),
      };
    });

  rows.sort((a, b) => {
    if (groupByLocation) {
      const locCompare = (a.locationName || "").localeCompare(b.locationName || "");
      if (locCompare !== 0) return locCompare;
    }
    return a.name.localeCompare(b.name);
  });

  return rows;
}

const PAST_RANGE_TTL_SECONDS = 24 * 60 * 60; // a closed range's shifts don't change retroactively
const CURRENT_RANGE_TTL_SECONDS = 10 * 60; // still accumulating shifts — refresh often

/**
 * Cached wrapper around computeHoursReport. Keyed on the exact request (including
 * groupByLocation) — quarter/preset navigation always regenerates the same
 * boundary-aligned ISO strings for a given period, so revisiting one is a natural cache
 * hit with no extra normalization needed. Matches the house Redis convention
 * (userService.getUsersWithGoogleTokens, positionService.getPositionsToSyncForUsers):
 * colon-delimited key, JSON string value, EX for TTL. A Redis outage (get or set) just
 * degrades to computing fresh every time — never fails the report.
 */
async function getHoursReport({ start, end, groupByLocation, refresh = false }) {
  const cacheKey = `reports:hours:${start}:${end}:${groupByLocation}`;

  // `refresh` skips the read and lets the write below overwrite the entry. It is a
  // bypass rather than a delete, and shared rather than per-caller, because nothing
  // invalidates this cache on a shift mutation: publishing a day leaves the entry stale
  // for up to CURRENT_RANGE_TTL_SECONDS. Recomputing into the same key means the next
  // admin to ask gets the corrected numbers too — deleting the key, or writing to a
  // per-session one, would leave everyone else on the stale value while the person who
  // asked sees the truth, which is the more confusing of the two failures.
  if (!refresh) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Entries written before `computedAt` existed are a bare array. They stay in
        // Redis for up to PAST_RANGE_TTL_SECONDS after this ships, so read both shapes
        // rather than crashing on the old one; a null timestamp just means the UI shows
        // "unknown" until that entry expires.
        return Array.isArray(parsed)
          ? { rows: parsed, computedAt: null, fromCache: true }
          : { ...parsed, fromCache: true };
      }
    } catch (err) {
      console.warn(`[reports] cache read failed for ${cacheKey}: ${err.message}`);
    }
  }

  const rows = await computeHoursReport({ start, end, groupByLocation });
  // Stored alongside the rows so a cache hit reports when the figures were *computed*,
  // not when they were served — the whole point of showing it is to reveal staleness.
  const computedAt = new Date().toISOString();

  try {
    const isPast = new Date(end).getTime() < Date.now();
    const ttl = isPast ? PAST_RANGE_TTL_SECONDS : CURRENT_RANGE_TTL_SECONDS;
    await redisClient.set(cacheKey, JSON.stringify({ rows, computedAt }), { EX: ttl });
  } catch (err) {
    console.warn(`[reports] cache write failed for ${cacheKey}: ${err.message}`);
  }

  return { rows, computedAt, fromCache: false };
}

export default {
  getGroups,
  replaceGroups,
  getHoursReport,
};
