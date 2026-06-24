import { JiraIssue } from "./jiraBacklogModel.js";
import { computeUrgency, URGENCY_INPUT_FIELDS } from "./lib/urgency.js";
import { DROPDOWN_OPTIONS } from "./lib/dropdowns.js";
import { deriveStatus, STATUS_OPTIONS } from "./lib/status.js";
import { fetchConnectedTicketCount, fetchIssueDetails } from "./lib/jiraClient.js";
import { JIRA_BACKLOG_SEED } from "./seed/jiraBacklogSeed.js";
import { BugStatus } from "./bugStatusModel.js";
import taskService from "./taskService.js";

const STRING_FIELDS = [
  "issueKey",
  "url",
  "desc",
  "client",
  "sprint",
  "comment",
];
const DROPDOWN_FIELDS = Object.keys(DROPDOWN_OPTIONS); // status, priority, squad, complexity, ...

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Pick only writable fields from a request body and coerce their types. Unknown
 * dropdown values collapse to "" so a bad payload can never corrupt the urgency calc
 * or the views. `urgency` is handled separately (override logic), not here.
 */
function sanitizeWritable(body = {}) {
  const out = {};
  for (const f of STRING_FIELDS) {
    if (has(body, f)) out[f] = body[f] == null ? "" : String(body[f]);
  }
  for (const f of DROPDOWN_FIELDS) {
    if (has(body, f)) {
      const v = body[f] == null ? "" : String(body[f]);
      out[f] = v === "" || DROPDOWN_OPTIONS[f].includes(v) ? v : "";
    }
  }
  return out;
}

/** null when empty/cleared, otherwise an integer clamped to 0–100. */
function normalizeUrgencyInput(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

async function nextOrder() {
  const last = await JiraIssue.findOne().sort({ order: -1 }).select("order").lean();
  return (last?.order ?? -1) + 1;
}

function mapSeedRecord(rec, index) {
  return {
    issueKey: rec.id || "",
    url: rec.url || "",
    status: deriveStatus(rec),
    desc: rec.desc || "",
    client: rec.client || "",
    priority: rec.priority || "",
    squad: rec.squad || "",
    sprint: rec.sprint || "",
    complexity: rec.complexity || "",
    urgency: typeof rec.urgency === "number" ? rec.urgency : null,
    urgencyOverridden: false,
    comment: rec.comment || "",
    bugType: rec.bugType || "",
    scope: rec.scope || "",
    planTier: rec.planTier || "",
    workaround: rec.workaround || "",
    frustration: rec.frustration || "",
    scopeConf: rec.scopeConf || "",
    workaroundQ: rec.workaroundQ || "",
    zdCount: typeof rec.zdCount === "number" ? rec.zdCount : null,
    zdCountFetchedAt: rec.zdCountFetchedAt ? new Date(rec.zdCountFetchedAt) : null,
    order: index,
  };
}

// Memoised so concurrent first-requests in one process can't double-seed.
let seedPromise = null;
function seedIfEmpty() {
  if (!seedPromise) seedPromise = doSeed();
  return seedPromise;
}
async function doSeed() {
  const count = await JiraIssue.estimatedDocumentCount();
  if (count > 0) return; // never re-import on subsequent runs
  await JiraIssue.insertMany(JIRA_BACKLOG_SEED.map(mapSeedRecord));
  console.log(`[jira-backlog] seeded ${JIRA_BACKLOG_SEED.length} issues`);
}

async function getAllIssues() {
  await seedIfEmpty();
  return JiraIssue.find().sort({ order: 1, createdAt: 1 }).lean();
}

async function createIssue(body = {}) {
  const issue = new JiraIssue({ ...sanitizeWritable(body), order: await nextOrder() });

  if (has(body, "urgency")) {
    const u = normalizeUrgencyInput(body.urgency);
    if (u == null) {
      issue.urgencyOverridden = false;
      issue.urgency = computeUrgency(issue);
    } else {
      issue.urgency = u;
      issue.urgencyOverridden = true;
    }
  } else {
    issue.urgency = computeUrgency(issue);
  }

  await issue.save();
  return issue.toObject();
}

async function updateIssue(id, body = {}) {
  const doc = await JiraIssue.findById(id);
  if (!doc) return null;

  const writable = sanitizeWritable(body);
  Object.assign(doc, writable);

  if (has(body, "urgency")) {
    // Explicit edit of the urgency cell: a value means manual override; clearing it
    // reverts the row to auto-calculation.
    const u = normalizeUrgencyInput(body.urgency);
    if (u == null) {
      doc.urgencyOverridden = false;
      doc.urgency = computeUrgency(doc);
    } else {
      doc.urgency = u;
      doc.urgencyOverridden = true;
    }
  } else if (URGENCY_INPUT_FIELDS.some((f) => has(writable, f)) && !doc.urgencyOverridden) {
    // An input field changed and the row isn't manually overridden -> recalc.
    doc.urgency = computeUrgency(doc);
  }

  await doc.save();
  return doc.toObject();
}

async function deleteIssue(id) {
  const doc = await JiraIssue.findByIdAndDelete(id);
  if (doc) await taskService.deleteTasksForIssue(id); // cascade: no orphan tasks on the board
  return Boolean(doc);
}

/** Fetch + persist the linked Zendesk count for one row. Throws on Jira errors. */
async function refreshZdCount(id) {
  const doc = await JiraIssue.findById(id);
  if (!doc) return null;
  const count = await fetchConnectedTicketCount(doc.issueKey || doc.url);
  doc.zdCount = count;
  doc.zdCountFetchedAt = new Date();
  await doc.save();
  return doc.toObject();
}

/**
 * Map a Jira squad option value onto one of agendo's squad options. Jira uses short names
 * ("Pricing", "eCommerce") while agendo's are longer ("Pricing (Monetization)",
 * "Store front (eCommerce)"), so match exactly first, then by an unambiguous substring.
 */
function matchSquad(jiraValue) {
  const v = (jiraValue || "").trim().toLowerCase();
  if (!v) return "";
  const opts = DROPDOWN_OPTIONS.squad;
  const exact = opts.find((o) => o.toLowerCase() === v);
  if (exact) return exact;
  const contains = opts.filter((o) => o.toLowerCase().includes(v));
  return contains.length === 1 ? contains[0] : "";
}

/**
 * Pull as much as we can from the linked Jira ticket onto a row: summary -> description,
 * priority, squad, sprint, and the Zendesk count. Only non-empty fetched values are applied
 * (so blank Jira fields never wipe existing data), and dropdown values are validated by
 * sanitizeWritable. Throws on Jira errors; returns null if the row is gone.
 */
async function autofillFromJira(id) {
  const doc = await JiraIssue.findById(id);
  if (!doc) return null;

  const details = await fetchIssueDetails(doc.issueKey || doc.url);

  const patch = {};
  if (details.summary) patch.desc = details.summary;
  if (details.priorityName) patch.priority = details.priorityName; // validated by sanitizeWritable
  const squad = matchSquad(details.squadValue);
  if (squad) patch.squad = squad;
  if (details.sprintName) patch.sprint = details.sprintName;

  Object.assign(doc, sanitizeWritable(patch));

  if (details.zdCount != null) {
    doc.zdCount = details.zdCount;
    doc.zdCountFetchedAt = new Date();
  }

  await doc.save();
  return doc.toObject();
}

/* ----------------------------- bug statuses ------------------------------ */

// Memoised so concurrent first-requests can't double-seed (mirrors seedIfEmpty). The
// unique index on `name` is the cross-process guard. Seeds the legacy hardcoded defaults.
let bugStatusSeedPromise = null;
function seedBugStatusesIfEmpty() {
  if (!bugStatusSeedPromise) bugStatusSeedPromise = doSeedBugStatuses();
  return bugStatusSeedPromise;
}
async function doSeedBugStatuses() {
  const count = await BugStatus.estimatedDocumentCount();
  if (count > 0) return;
  await BugStatus.insertMany(STATUS_OPTIONS.map((name, order) => ({ name, order })));
  console.log(`[jira-backlog] seeded ${STATUS_OPTIONS.length} bug statuses`);
}

async function nextBugStatusOrder() {
  const last = await BugStatus.findOne().sort({ order: -1 }).select("order").lean();
  return (last?.order ?? -1) + 1;
}

async function getBugStatuses() {
  await seedBugStatusesIfEmpty();
  return BugStatus.find().sort({ order: 1, createdAt: 1 }).lean();
}

async function createBugStatus(body = {}) {
  const name = (body.name == null ? "" : String(body.name)).trim();
  if (!name) throw new Error("Status name is required");
  const status = await BugStatus.create({ name, order: await nextBugStatusOrder() });
  return status.toObject();
}

/**
 * Delete a status, but never while issues still use it. Returns a small result object the
 * controller maps to HTTP codes: NOT_FOUND -> 404, STATUS_IN_USE -> 409. Issues store the
 * status by name, so the guard counts issues whose `status` matches.
 */
async function deleteBugStatus(id) {
  const doc = await BugStatus.findById(id);
  if (!doc) return { ok: false, code: "NOT_FOUND" };
  const count = await JiraIssue.countDocuments({ status: doc.name });
  if (count > 0) return { ok: false, code: "STATUS_IN_USE", count };
  await doc.deleteOne();
  return { ok: true };
}

export default {
  getAllIssues,
  createIssue,
  updateIssue,
  deleteIssue,
  refreshZdCount,
  autofillFromJira,
  getBugStatuses,
  createBugStatus,
  deleteBugStatus,
};
