/**
 * Loads a quarter's inputs (facts, hours, setup) and runs them through the engine. Scores
 * are never stored — they are a function of those inputs and a methodology version, so
 * they are recomputed on every read (a quarter is ~40 agents of arithmetic).
 */
import { User } from "../../models/UserModel.js";
import Location from "../../models/LocationModel.js";
import { Fact } from "../models/factModel.js";
import { Period } from "../models/periodModel.js";
import periodService from "./periodService.js";
import methodologyService from "./methodologyService.js";
import hoursService from "./hoursService.js";
import importService from "./importService.js";
import { scorePeriod } from "../engine/score.js";
import { defaultRegions } from "../lib/regions.js";
import { previousQuarter, periodKey } from "../lib/quarters.js";

async function loadDirectory() {
  const [users, locations] = await Promise.all([
    User.find().select("clerkId firstName lastName").lean(),
    Location.find().select("name assignedUsers").lean(),
  ]);
  return {
    userById: new Map(users.filter((u) => u.clerkId).map((u) => [u.clerkId, u])),
    regions: defaultRegions(locations),
  };
}

async function loadInputs(period, { refresh }) {
  const facts = await Fact.find({ periodKey: period.key }).lean();
  const factsByClerk = {};
  const hoursFacts = [];
  const factCounts = {};
  for (const fact of facts) {
    factCounts[fact.source] = (factCounts[fact.source] || 0) + 1;
    if (fact.source === "hours") {
      hoursFacts.push(fact);
      continue;
    }
    factsByClerk[fact.clerkId] = { ...(factsByClerk[fact.clerkId] || {}), [fact.source]: fact.metrics };
  }
  const hours = await hoursService.minutesForPeriod(period, hoursFacts, { refresh });
  return { factsByClerk, hoursFacts, factCounts, hours };
}

/**
 * Everyone the quarter concerns: the saved setup, plus anyone with imported facts or with
 * chat/ticket time in agendo. Agents not in the setup yet get defaults (regular, region
 * from their Location when it is unambiguous) and are flagged, so a newcomer shows up
 * instead of silently missing.
 */
function buildRoster(period, inputs, directory) {
  const setup = new Map((period.agents || []).map((a) => [a.clerkId, a]));
  const ids = new Set(setup.keys());
  for (const id of Object.keys(inputs.factsByClerk)) ids.add(id);
  for (const fact of inputs.hoursFacts) ids.add(fact.clerkId);
  for (const [id, m] of Object.entries(inputs.hours.byAgent)) {
    if (m.chats > 0 || m.tickets > 0) ids.add(id);
  }
  return [...ids].map((clerkId) => {
    const saved = setup.get(clerkId);
    const user = directory.userById.get(clerkId);
    return {
      clerkId,
      name: user ? `${user.firstName} ${user.lastName}`.trim() : null,
      region: saved ? saved.region ?? null : directory.regions.get(clerkId) ?? null,
      role: saved?.role ?? "regular",
      cohortOverride: saved?.cohortOverride ?? null,
      note: saved?.note ?? "",
      inSetup: Boolean(saved),
      userMissing: !user,
    };
  });
}

/**
 * The "leads included" what-if: team leads scored exactly like regular agents — same
 * formula, on the leaderboard, and counted in the benchmarks and volume reference — so
 * every average, σ, score and grade reflects them. A view only: the methodology's own
 * config, and so the official scores, are untouched.
 */
function withLeadsAsAgents(config) {
  const { benchmark } = config.productivity;
  const addLead = (roles) => [...new Set([...roles, "teamLead"])];
  return {
    ...config,
    roles: {
      ...config.roles,
      teamLead: { ...config.roles.regular, label: config.roles.teamLead?.label ?? "Team lead" },
    },
    productivity: { ...config.productivity, benchmark: { ...benchmark, roles: addLead(benchmark.roles) } },
    volume: { ...config.volume, referenceRoles: addLead(config.volume.referenceRoles) },
  };
}

async function scoreWith(period, methodology, directory, { refresh = false } = {}) {
  const inputs = await loadInputs(period, { refresh });
  const roster = buildRoster(period, inputs, directory);
  const result = scorePeriod({
    agents: roster,
    facts: inputs.factsByClerk,
    minutes: inputs.hours.byAgent,
    config: methodology.config,
  });
  return { inputs, roster, result };
}

function periodSummary(period) {
  const {
    key, label, year, quarter, startsAt, endsAt, tz, status, lockedAt, lockedBy,
    hoursSource, methodologyKey, methodologyHistory,
  } = period;
  return {
    key, label, year, quarter, startsAt, endsAt, tz, status, lockedAt, lockedBy,
    hoursSource, methodologyKey, methodologyHistory,
  };
}

function dataWarnings(inputs, roster) {
  const warnings = [];
  for (const source of ["tickets", "chats"]) {
    if (!inputs.factCounts[source]) warnings.push({ code: "noFactsForSource", source });
  }
  if (inputs.hours.meta.skippedUnmatched > 0) {
    warnings.push({ code: "skippedUnmatched", count: inputs.hours.meta.skippedUnmatched });
  }
  const defaulted = roster.filter((a) => !a.inSetup).length;
  if (defaulted) warnings.push({ code: "setupDefaulted", count: defaulted });
  const missing = roster.filter((a) => a.userMissing).length;
  if (missing) warnings.push({ code: "userMissing", count: missing });
  return warnings;
}

/**
 * Scores for a quarter under its official methodology, or any other version as a
 * what-if. Each row carries the previous quarter's figures, scored with the same version
 * so the comparison is like for like.
 */
async function getScores(key, { methodologyKey, refresh = false, includeLeads = false } = {}) {
  const period = await periodService.getPeriod(key);
  const stored = await methodologyService.getMethodology(methodologyKey || period.methodologyKey);
  const methodology = includeLeads ? { ...stored, config: withLeadsAsAgents(stored.config) } : stored;
  const directory = await loadDirectory();
  const { inputs, roster, result } = await scoreWith(period, methodology, directory, { refresh });

  const prev = previousQuarter(period.year, period.quarter);
  const previousPeriod = await Period.findOne({ key: periodKey(prev.year, prev.quarter) }).lean();
  const previousById = new Map();
  if (previousPeriod) {
    const previous = await scoreWith(previousPeriod, methodology, directory);
    for (const row of previous.result.rows) {
      previousById.set(row.clerkId, {
        inputs: row.inputs,
        aps: row.aps,
        apsRounded: row.apsRounded,
        grade: row.grade,
        role: row.role,
        productivity: row.productivity.value,
        quality: row.quality.value,
      });
    }
  }

  const rosterById = new Map(roster.map((a) => [a.clerkId, a]));
  const rows = result.rows.map((row) => {
    const agent = rosterById.get(row.clerkId);
    const minutes = inputs.hours.byAgent[row.clerkId];
    const flags = [...row.flags];
    if (!agent.inSetup) flags.push("setupDefaulted");
    if (agent.userMissing) flags.push("userMissing");
    if (minutes?.source === "override") flags.push("hoursOverridden");
    return {
      ...row,
      name: agent.name,
      note: agent.note,
      inSetup: agent.inSetup,
      otherMinutes: minutes?.other ?? 0,
      unresolvedMinutes: minutes?.unresolved ?? 0,
      flags,
      previous: previousById.get(row.clerkId) || null,
    };
  });

  return {
    period: periodSummary(period),
    methodology: {
      key: methodology.key,
      name: methodology.name,
      summary: methodology.summary,
      config: methodology.config,
    },
    official: methodology.key === period.methodologyKey,
    includeLeads,
    hours: inputs.hours.meta,
    factCounts: inputs.factCounts,
    benchmarks: result.benchmarks,
    rows,
    warnings: [...result.warnings, ...dataWarnings(inputs, roster)],
    engineVersion: result.engineVersion,
    previousPeriodKey: previousPeriod?.key ?? null,
    computedAt: new Date().toISOString(),
  };
}

/** What the Data tab needs: setup, per-agent coverage, hours source, recent imports. */
async function getOverview(key, { refresh = false } = {}) {
  const period = await periodService.getPeriod(key);
  const methodology = await methodologyService.getMethodology(period.methodologyKey);
  const directory = await loadDirectory();
  const inputs = await loadInputs(period, { refresh });
  const roster = buildRoster(period, inputs, directory);
  const hoursFactIds = new Set(inputs.hoursFacts.map((f) => f.clerkId));

  const agents = roster
    .map((agent) => {
      const minutes = inputs.hours.byAgent[agent.clerkId] || {};
      const facts = inputs.factsByClerk[agent.clerkId] || {};
      return {
        ...agent,
        sources: {
          tickets: Boolean(facts.tickets),
          chats: Boolean(facts.chats),
          screenshares: Boolean(facts.screenshares),
          hours: hoursFactIds.has(agent.clerkId),
        },
        minutes: {
          chats: minutes.chats || 0,
          tickets: minutes.tickets || 0,
          other: minutes.other || 0,
          unresolved: minutes.unresolved || 0,
        },
        hoursSource: minutes.source || null,
      };
    })
    .sort((a, b) => String(a.name || "~").localeCompare(String(b.name || "~")));

  return {
    period: periodSummary(period),
    methodology: {
      key: methodology.key,
      name: methodology.name,
      roles: methodology.config.roles,
      cohorts: methodology.config.cohorts,
      cohortByRegion: methodology.config.cohortByRegion,
    },
    agents,
    hours: inputs.hours.meta,
    factCounts: inputs.factCounts,
    imports: await importService.listImports(key),
    warnings: dataWarnings(inputs, roster),
  };
}

export default { getScores, getOverview };
