/**
 * Minutes worked per agent per channel for a quarter, from the right place:
 *   - a locked quarter: the snapshot taken when it was locked;
 *   - an open quarter: agendo's shifts, live (classified by the hours report's own report
 *     groups and unmatched-user guard — reportsService.computeGroupMinutes), cached briefly;
 *   - a quarter with hoursSource "import" (from before agendo had its shifts): imported
 *     hours only.
 * In the agendo modes an agent's imported hours override their shift minutes — the escape
 * hatch for people whose shifts never made it into agendo.
 */
import process from "process";
import reportsService from "../../reports/reportsService.js";
import redisClient from "../../database/redisClient.js";

const LIVE_CACHE_TTL_SECONDS = 10 * 60;
// A local run shares Redis with production but resolves users from `dev-users`, so its
// minutes must never land under the key production reads.
const CACHE_PREFIX =
  process.env.NODE_ENV === "development" ? "performance:dev:hours" : "performance:hours";

function rangeFor(period) {
  const rangeStart = new Date(period.startsAt);
  // Never past now: future shifts are scheduled, not worked.
  const rangeEnd = new Date(Math.min(new Date(period.endsAt).getTime(), Date.now()));
  return { rangeStart, rangeEnd };
}

async function computeMinutes(period) {
  const { rangeStart, rangeEnd } = rangeFor(period);
  if (!(rangeEnd > rangeStart)) {
    return { agents: [], skippedUnmatched: 0, groups: [], rangeStart, rangeEnd };
  }
  const result = await reportsService.computeGroupMinutes({ rangeStart, rangeEnd });
  return {
    agents: result.agents.map(({ clerkId, minutes, unresolvedPositionMinutes }) => ({
      clerkId,
      minutes,
      unresolvedPositionMinutes,
    })),
    skippedUnmatched: result.skippedUnmatched,
    groups: result.groups,
    rangeStart,
    rangeEnd,
  };
}

/** What lock stores in period.hoursSnapshot. */
async function takeSnapshot(period) {
  return { takenAt: new Date(), ...(await computeMinutes(period)) };
}

async function liveMinutes(period, { refresh }) {
  const cacheKey = `${CACHE_PREFIX}:${period.key}`;
  if (!refresh) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return { ...JSON.parse(cached), fromCache: true };
    } catch (err) {
      console.warn(`[performance] cache read failed for ${cacheKey}: ${err.message}`);
    }
  }
  const value = { ...(await computeMinutes(period)), computedAt: new Date().toISOString() };
  try {
    await redisClient.set(cacheKey, JSON.stringify(value), { EX: LIVE_CACHE_TTL_SECONDS });
  } catch (err) {
    console.warn(`[performance] cache write failed for ${cacheKey}: ${err.message}`);
  }
  return { ...value, fromCache: false };
}

/**
 * hoursFacts: the period's `hours` facts ({ clerkId, metrics: { chatsHours, ticketsHours } }).
 * Returns {
 *   byAgent: { [clerkId]: { chats, tickets, other, unresolved, source } }   (minutes)
 *   meta:    { source, computedAt, fromCache, rangeStart, rangeEnd, skippedUnmatched, groups }
 * }
 */
async function minutesForPeriod(period, hoursFacts, { refresh = false } = {}) {
  const byAgent = {};
  let meta;

  if (period.hoursSource === "import") {
    meta = { source: "import", computedAt: null, fromCache: false, skippedUnmatched: 0, groups: [] };
  } else {
    const base =
      period.status === "locked" && period.hoursSnapshot
        ? { ...period.hoursSnapshot, computedAt: period.hoursSnapshot.takenAt, fromCache: false }
        : await liveMinutes(period, { refresh });
    const source = period.status === "locked" && period.hoursSnapshot ? "snapshot" : "agendo";
    for (const agent of base.agents || []) {
      byAgent[agent.clerkId] = {
        chats: agent.minutes?.Chats || 0,
        tickets: agent.minutes?.Tickets || 0,
        other: agent.minutes?.Other || 0,
        unresolved: agent.unresolvedPositionMinutes || 0,
        source,
      };
    }
    meta = {
      source,
      computedAt: base.computedAt ?? null,
      fromCache: Boolean(base.fromCache),
      rangeStart: base.rangeStart ?? null,
      rangeEnd: base.rangeEnd ?? null,
      skippedUnmatched: base.skippedUnmatched || 0,
      groups: base.groups || [],
    };
  }

  for (const fact of hoursFacts) {
    const { chatsHours, ticketsHours } = fact.metrics || {};
    const current = byAgent[fact.clerkId] || { chats: 0, tickets: 0, other: 0, unresolved: 0 };
    byAgent[fact.clerkId] = {
      ...current,
      chats: chatsHours != null ? chatsHours * 60 : current.chats,
      tickets: ticketsHours != null ? ticketsHours * 60 : current.tickets,
      source: period.hoursSource === "import" ? "import" : "override",
    };
  }

  return { byAgent, meta };
}

export default { minutesForPeriod, takeSnapshot };
