import { Period } from "../models/periodModel.js";
import { Fact } from "../models/factModel.js";
import methodologyService, { LATEST_METHODOLOGY_KEY } from "./methodologyService.js";
import hoursService from "./hoursService.js";
import { periodKey, periodLabel, quarterBounds, TEAM_TZ } from "../lib/quarters.js";
import { notFound, conflict, badRequest } from "../lib/httpError.js";

async function getPeriod(key) {
  const period = await Period.findOne({ key }).lean();
  if (!period) throw notFound(`no period "${key}"`);
  return period;
}

function assertOpen(period) {
  if (period.status === "locked") throw conflict(`${period.label} is locked — unlock it first`);
}

async function listPeriods() {
  const periods = await Period.find()
    .select("-hoursSnapshot -agents")
    .sort({ startsAt: -1 })
    .lean();
  const counts = await Fact.aggregate([
    { $group: { _id: { periodKey: "$periodKey", source: "$source" }, n: { $sum: 1 } } },
  ]);
  const countsByPeriod = {};
  for (const { _id, n } of counts) {
    countsByPeriod[_id.periodKey] = { ...(countsByPeriod[_id.periodKey] || {}), [_id.source]: n };
  }
  return periods.map((p) => ({ ...p, factCounts: countsByPeriod[p.key] || {} }));
}

/**
 * A new quarter starts from the nearest earlier quarter's agent setup — team leads and
 * billing roles rarely change between quarters, and re-entering them each time is how
 * one gets forgotten.
 */
async function createPeriod({ year, quarter, methodologyKey, hoursSource, createdBy }) {
  const key = periodKey(year, quarter);
  if (await Period.exists({ key })) throw conflict(`${periodLabel(year, quarter)} already exists`);
  const methodology = await methodologyService.getMethodology(methodologyKey || LATEST_METHODOLOGY_KEY);
  const { startsAt, endsAt } = quarterBounds(year, quarter);
  const previous = await Period.findOne({ startsAt: { $lt: startsAt } })
    .sort({ startsAt: -1 })
    .select("agents")
    .lean();
  const now = new Date();
  const created = await Period.create({
    key,
    label: periodLabel(year, quarter),
    year,
    quarter,
    startsAt,
    endsAt,
    tz: TEAM_TZ,
    methodologyKey: methodology.key,
    methodologyHistory: [{ key: methodology.key, setAt: now, setBy: createdBy, note: "created" }],
    hoursSource: hoursSource || "agendo",
    agents: previous?.agents || [],
    createdBy,
  });
  return created.toObject();
}

/**
 * Changing the official methodology is allowed on a locked quarter on purpose: it is the
 * "re-score Q3 with the Q4 rules" decision, and it touches no data — just which version
 * the stored facts are read with. It is logged in methodologyHistory.
 */
async function updatePeriod(key, { methodologyKey, hoursSource, note }, by) {
  const period = await getPeriod(key);
  const set = {};
  const push = {};
  if (methodologyKey && methodologyKey !== period.methodologyKey) {
    await methodologyService.getMethodology(methodologyKey);
    set.methodologyKey = methodologyKey;
    push.methodologyHistory = { key: methodologyKey, setAt: new Date(), setBy: by, note: note || "" };
  }
  if (hoursSource && hoursSource !== period.hoursSource) {
    assertOpen(period);
    set.hoursSource = hoursSource;
  }
  if (!Object.keys(set).length) return period;
  return Period.findOneAndUpdate(
    { key },
    { $set: set, ...(push.methodologyHistory ? { $push: push } : {}) },
    { new: true },
  ).lean();
}

async function replaceAgents(key, agents) {
  const period = await getPeriod(key);
  assertOpen(period);
  const methodology = await methodologyService.getMethodology(period.methodologyKey);
  const { roles, cohorts } = methodology.config;
  const seen = new Set();
  for (const agent of agents) {
    if (seen.has(agent.clerkId)) throw badRequest(`${agent.clerkId} appears twice`);
    seen.add(agent.clerkId);
    if (!roles[agent.role]) throw badRequest(`unknown role "${agent.role}"`);
    if (agent.cohortOverride && !cohorts[agent.cohortOverride]) {
      throw badRequest(`unknown cohort "${agent.cohortOverride}"`);
    }
  }
  return Period.findOneAndUpdate({ key }, { $set: { agents } }, { new: true })
    .select("-hoursSnapshot")
    .lean();
}

async function lockPeriod(key, by) {
  const period = await getPeriod(key);
  assertOpen(period);
  const hoursSnapshot = period.hoursSource === "agendo" ? await hoursService.takeSnapshot(period) : null;
  return Period.findOneAndUpdate(
    { key, status: "open" },
    { $set: { status: "locked", lockedAt: new Date(), lockedBy: by, hoursSnapshot } },
    { new: true },
  )
    .select("-hoursSnapshot")
    .lean();
}

/** The snapshot stays on the document but is ignored while open; locking again retakes it. */
async function unlockPeriod(key) {
  const period = await getPeriod(key);
  if (period.status !== "locked") return period;
  return Period.findOneAndUpdate(
    { key },
    { $set: { status: "open", lockedAt: null, lockedBy: null } },
    { new: true },
  )
    .select("-hoursSnapshot")
    .lean();
}

export default {
  getPeriod,
  assertOpen,
  listPeriods,
  createPeriod,
  updatePeriod,
  replaceAgents,
  lockPeriod,
  unlockPeriod,
};
