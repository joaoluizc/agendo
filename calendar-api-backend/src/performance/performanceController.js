import { getAuth } from "@clerk/express";
import methodologyService from "./services/methodologyService.js";
import periodService from "./services/periodService.js";
import importService from "./services/importService.js";
import scoreService from "./services/scoreService.js";
import agentService from "./services/agentService.js";
import { Alias } from "./models/aliasModel.js";
import { REGIONS } from "./lib/regions.js";
import { parsePeriodKey } from "./lib/quarters.js";

/**
 * Validation here, work in the services. Services throw HttpError for anything the admin
 * can fix (404/400/409); everything else is a 500 that names no data.
 */
function handle(fn, label) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      console.error(`[performance] ${label} failed: ${error.message}`);
      res.status(500).json({ message: `caught error: ${error.message}` });
    }
  };
}

const callerId = (req) => getAuth(req)?.userId ?? null;

function periodKeyParam(req, res) {
  if (!parsePeriodKey(req.params.key)) {
    res.status(400).json({ message: "period key must look like 2026-Q3" });
    return null;
  }
  return req.params.key;
}

const listMethodologies = handle(async (req, res) => {
  res.status(200).json(await methodologyService.listMethodologies());
}, "listMethodologies");

const getMethodology = handle(async (req, res) => {
  res.status(200).json(await methodologyService.getMethodology(req.params.key));
}, "getMethodology");

const listPeriods = handle(async (req, res) => {
  res.status(200).json(await periodService.listPeriods());
}, "listPeriods");

const createPeriod = handle(async (req, res) => {
  const year = Number(req.body?.year);
  const quarter = Number(req.body?.quarter);
  const { methodologyKey, hoursSource } = req.body || {};
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return res.status(400).json({ message: "year must be a year" });
  }
  if (![1, 2, 3, 4].includes(quarter)) {
    return res.status(400).json({ message: "quarter must be 1–4" });
  }
  if (hoursSource && !["agendo", "import"].includes(hoursSource)) {
    return res.status(400).json({ message: 'hoursSource must be "agendo" or "import"' });
  }
  const period = await periodService.createPeriod({
    year,
    quarter,
    methodologyKey,
    hoursSource,
    createdBy: callerId(req),
  });
  res.status(201).json(period);
}, "createPeriod");

const getOverview = handle(async (req, res) => {
  const key = periodKeyParam(req, res);
  if (!key) return;
  res.status(200).json(await scoreService.getOverview(key, { refresh: req.query.refresh === "true" }));
}, "getOverview");

const updatePeriod = handle(async (req, res) => {
  const key = periodKeyParam(req, res);
  if (!key) return;
  const { methodologyKey, hoursSource, note } = req.body || {};
  if (hoursSource && !["agendo", "import"].includes(hoursSource)) {
    return res.status(400).json({ message: 'hoursSource must be "agendo" or "import"' });
  }
  if (note != null && (typeof note !== "string" || note.length > 500)) {
    return res.status(400).json({ message: "note must be a string of at most 500 characters" });
  }
  res.status(200).json(await periodService.updatePeriod(key, { methodologyKey, hoursSource, note }, callerId(req)));
}, "updatePeriod");

const replaceAgents = handle(async (req, res) => {
  const key = periodKeyParam(req, res);
  if (!key) return;
  const agents = req.body?.agents;
  if (!Array.isArray(agents) || agents.length > 500) {
    return res.status(400).json({ message: "agents must be an array" });
  }
  const clean = [];
  for (const [i, a] of agents.entries()) {
    if (!a || typeof a.clerkId !== "string" || !a.clerkId) {
      return res.status(400).json({ message: `agents[${i}].clerkId is required` });
    }
    if (a.region != null && !REGIONS.includes(a.region)) {
      return res.status(400).json({ message: `agents[${i}].region must be one of ${REGIONS.join(", ")}` });
    }
    if (typeof a.role !== "string") {
      return res.status(400).json({ message: `agents[${i}].role is required` });
    }
    clean.push({
      clerkId: a.clerkId,
      region: a.region ?? null,
      role: a.role,
      cohortOverride: a.cohortOverride || null,
      note: typeof a.note === "string" ? a.note.slice(0, 500) : "",
    });
  }
  res.status(200).json(await periodService.replaceAgents(key, clean));
}, "replaceAgents");

const lockPeriod = handle(async (req, res) => {
  const key = periodKeyParam(req, res);
  if (!key) return;
  res.status(200).json(await periodService.lockPeriod(key, callerId(req)));
}, "lockPeriod");

const unlockPeriod = handle(async (req, res) => {
  const key = periodKeyParam(req, res);
  if (!key) return;
  res.status(200).json(await periodService.unlockPeriod(key));
}, "unlockPeriod");

const listImports = handle(async (req, res) => {
  const key = periodKeyParam(req, res);
  if (!key) return;
  res.status(200).json(await importService.listImports(key));
}, "listImports");

function validColumns(columns) {
  if (columns == null) return true;
  if (typeof columns !== "object" || Array.isArray(columns)) return false;
  return Object.values(columns).every((v) => Number.isInteger(v) && v >= 0 && v < 100);
}

const previewImport = handle(async (req, res) => {
  const key = periodKeyParam(req, res);
  if (!key) return;
  const { source, text, columns } = req.body || {};
  if (!validColumns(columns)) return res.status(400).json({ message: "columns must map fields to column indexes" });
  res.status(200).json(await importService.previewImport({ periodKey: key, source, text, columns }));
}, "previewImport");

const commitImport = handle(async (req, res) => {
  const key = periodKeyParam(req, res);
  if (!key) return;
  const { source, text, columns, decisions } = req.body || {};
  if (!validColumns(columns)) return res.status(400).json({ message: "columns must map fields to column indexes" });
  const result = await importService.commitImport({
    periodKey: key,
    source,
    text,
    columns,
    decisions,
    createdBy: callerId(req),
  });
  res.status(201).json(result);
}, "commitImport");

const getScores = handle(async (req, res) => {
  const key = periodKeyParam(req, res);
  if (!key) return;
  const methodologyKey = typeof req.query.methodology === "string" ? req.query.methodology : undefined;
  res.status(200).json(
    await scoreService.getScores(key, {
      methodologyKey,
      refresh: req.query.refresh === "true",
      includeLeads: req.query.includeLeads === "true",
    }),
  );
}, "getScores");

const listAgents = handle(async (req, res) => {
  res.status(200).json(await agentService.listAgents());
}, "listAgents");

const createAgent = handle(async (req, res) => {
  const { name, email, region, periodKey, role } = req.body || {};
  if (periodKey != null && !parsePeriodKey(periodKey)) {
    return res.status(400).json({ message: "periodKey must look like 2026-Q3" });
  }
  if (role != null && typeof role !== "string") return res.status(400).json({ message: "role must be a string" });
  const agent = await agentService.createAgent({ name, email, region, periodKey, role, createdBy: callerId(req) });
  res.status(201).json(agent);
}, "createAgent");

const deleteAgent = handle(async (req, res) => {
  await agentService.deleteAgent(req.params.agentId);
  res.status(204).end();
}, "deleteAgent");

const listAliases = handle(async (req, res) => {
  res.status(200).json(await Alias.find().sort({ display: 1 }).lean());
}, "listAliases");

const deleteAlias = handle(async (req, res) => {
  const deleted = await Alias.findByIdAndDelete(req.params.id).lean().catch(() => null);
  if (!deleted) return res.status(404).json({ message: "no such alias" });
  res.status(204).end();
}, "deleteAlias");

export default {
  listMethodologies,
  getMethodology,
  listPeriods,
  createPeriod,
  getOverview,
  updatePeriod,
  replaceAgents,
  lockPeriod,
  unlockPeriod,
  listImports,
  previewImport,
  commitImport,
  getScores,
  listAgents,
  createAgent,
  deleteAgent,
  listAliases,
  deleteAlias,
};
