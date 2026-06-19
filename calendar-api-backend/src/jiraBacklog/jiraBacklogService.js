import { JiraIssue } from "./jiraBacklogModel.js";
import { computeUrgency, URGENCY_INPUT_FIELDS } from "./lib/urgency.js";
import { DROPDOWN_OPTIONS } from "./lib/dropdowns.js";
import { deriveStatus } from "./lib/status.js";
import { fetchConnectedTicketCount } from "./lib/jiraClient.js";
import { JIRA_BACKLOG_SEED } from "./seed/jiraBacklogSeed.js";

const STRING_FIELDS = [
  "issueKey",
  "url",
  "desc",
  "client",
  "sprint",
  "comment",
  "custFrust",
  "custPlan",
  "spread",
  "tlUrg",
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
    custFrust: rec.custFrust || "",
    custPlan: rec.custPlan || "",
    spread: rec.spread || "",
    tlUrg: rec.tlUrg || "",
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

export default {
  getAllIssues,
  createIssue,
  updateIssue,
  deleteIssue,
  refreshZdCount,
};
