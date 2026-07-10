import { JiraIssue } from "./jiraBacklogModel.js";
import { computeUrgency, URGENCY_INPUT_FIELDS } from "./lib/urgency.js";
import { DROPDOWN_OPTIONS } from "./lib/dropdowns.js";
import { STATUS_OPTIONS, FIXED_CLOSED_STATUS, ARCHIVED_STATUS } from "./lib/status.js";
import { fetchConnectedTicketCount, fetchIssueDetails } from "./lib/jiraClient.js";
import { findLinkedZendeskTicketIds, fetchTicketRequester } from "./lib/zendeskClient.js";
import { resolveOwnerAccount, fetchMrrForOwner } from "./lib/domoClient.js";
import { isJiraConfigured, isMrrConfigured } from "./lib/config.js";
import { MrrOverride } from "./mrrOverrideModel.js";
import { JIRA_BACKLOG_SEED } from "./seed/jiraBacklogSeed.js";
import { mapSeedRecord } from "./seed/mapSeedRecord.js";
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

// Days an archived bug is retained before it's automatically deleted.
const ARCHIVE_RETENTION_DAYS = 30;

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * Reconcile a doc's archival fields with its (possibly just-changed) status. Selecting
 * "Fixed/Closed" archives the bug: the status is stored as "Archived" and an expiry is
 * stamped 30 days out, after which getAllIssues purges the row. The expiry is only set once
 * (so editing other fields on an archived bug never resets its countdown); moving a bug back
 * out of "Archived" clears both stamps. Mutates the doc in place.
 */
function reconcileArchival(doc) {
  if (doc.status === FIXED_CLOSED_STATUS) doc.status = ARCHIVED_STATUS;
  if (doc.status === ARCHIVED_STATUS) {
    if (!doc.archiveExpiresAt) {
      const now = new Date();
      doc.archivedAt = now;
      doc.archiveExpiresAt = addDays(now, ARCHIVE_RETENTION_DAYS);
    }
  } else if (doc.archivedAt || doc.archiveExpiresAt) {
    doc.archivedAt = null;
    doc.archiveExpiresAt = null;
  }
}

/**
 * Delete archived issues whose retention window has passed (cascading their tasks, like a
 * manual delete). Runs lazily on every list load — no separate scheduler — so a row is
 * removed the next time anyone opens the backlog after its 30 days are up.
 */
async function purgeExpiredArchived() {
  const expired = await JiraIssue.find({ archiveExpiresAt: { $ne: null, $lte: new Date() } })
    .select("_id")
    .lean();
  if (!expired.length) return;
  const ids = expired.map((e) => e._id);
  await JiraIssue.deleteMany({ _id: { $in: ids } });
  await Promise.all(ids.map((id) => taskService.deleteTasksForIssue(id)));
  console.log(`[jira-backlog] purged ${ids.length} expired archived issue(s)`);
}

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
  await purgeExpiredArchived();
  // Default order: most urgent first. Null urgency (regressions / incomplete rows) sorts
  // last in a descending sort; `order` is a stable insertion-order tiebreaker.
  return JiraIssue.find().sort({ urgency: -1, order: 1 }).lean();
}

/**
 * Bugs are unique by Jira key — refuse to create/link a row whose issueKey already exists.
 * Throws a typed error the controller maps to 409 with the existing row's id (so the UI can
 * offer to jump to it). Only meaningful for non-empty keys.
 */
async function assertNoDuplicateKey(issueKey, excludeId) {
  const query = { issueKey };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await JiraIssue.findOne(query).select("_id").lean();
  if (existing) {
    throw Object.assign(new Error(`${issueKey} is already on the backlog.`), {
      code: "DUPLICATE_ISSUE",
      existingId: String(existing._id),
    });
  }
}

async function createIssue(body = {}) {
  const writable = sanitizeWritable(body);
  if (writable.issueKey) await assertNoDuplicateKey(writable.issueKey, null);
  const issue = new JiraIssue({ ...writable, order: await nextOrder() });

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

  reconcileArchival(issue);

  await issue.save();
  return issue.toObject();
}

async function updateIssue(id, body = {}) {
  const doc = await JiraIssue.findById(id);
  if (!doc) return null;

  const writable = sanitizeWritable(body);
  if (writable.issueKey) await assertNoDuplicateKey(writable.issueKey, doc._id);
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

  reconcileArchival(doc);

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
  if (details.partnerValue) patch.client = details.partnerValue; // Jira "Partners" → client

  Object.assign(doc, sanitizeWritable(patch));

  // Jira-sourced, read-only fields — set directly, not part of the user-writable set.
  if (details.jiraStatusName) doc.jiraStatus = details.jiraStatusName;

  if (details.zdCount != null) {
    doc.zdCount = details.zdCount;
    doc.zdCountFetchedAt = new Date();
  }

  await doc.save();
  return doc.toObject();
}

/**
 * Find the override matching a ticket, org matcher first (the ticket's Zendesk organization
 * groups all of a client's requester emails), then exact requester email. Overrides *win*
 * over requester-email resolution — a partner employee's personal Duda account must never be
 * counted in place of the real enterprise account. Returns null when nothing matches.
 */
async function findMrrOverride({ organizationId, email }) {
  if (organizationId) {
    const byOrg = await MrrOverride.findOne({ matchType: "org", matchValue: organizationId }).lean();
    if (byOrg) return byOrg;
  }
  if (email) {
    const byEmail = await MrrOverride.findOne({
      matchType: "email",
      matchValue: email.toLowerCase(),
    }).lean();
    if (byEmail) return byEmail;
  }
  return null;
}

/**
 * Resolve MRR for one row: its linked Zendesk ticket(s) (from Zendesk's Jira-links table —
 * see zendeskClient.js)
 * -> each ticket's requester email (or an admin-managed override, see mrrOverrideModel.js)
 * -> DOMO's owning account -> that account's latest-complete-month MRR, summed across
 * *distinct* owner accounts (so two tickets from the same account never double-count).
 *
 * A single ticket/account failure is skipped rather than aborting the whole row — but every
 * ticket's outcome (including skips) is recorded in `mrrTrace`, so a 0 or missing MRR can be
 * traced to the exact step that failed afterwards.
 */
async function refreshMrr(id) {
  const doc = await JiraIssue.findById(id);
  if (!doc) return null;

  const ticketIds = await findLinkedZendeskTicketIds(doc.issueKey);
  doc.zendeskTicketIds = ticketIds.map(String);

  const seenOwners = new Set();
  const accounts = [];
  const trace = [];
  let total = 0;

  if (!ticketIds.length) {
    trace.push({ ticketId: "", email: "", stage: "no_tickets_found", detail: "No Zendesk tickets reference this Jira key." });
  }

  for (const ticketId of ticketIds) {
    const entry = { ticketId: String(ticketId), email: "", stage: "", detail: "" };
    trace.push(entry);

    let requester;
    try {
      requester = await fetchTicketRequester(ticketId);
    } catch (e) {
      entry.stage = "requester_lookup_failed";
      entry.detail = e.message;
      continue;
    }
    entry.email = requester.email;

    const override = await findMrrOverride({ organizationId: requester.organizationId, email: requester.email });
    const resolveEmail = override ? override.accountEmail : requester.email;
    if (!override && !requester.email) {
      entry.stage = "requester_lookup_failed";
      entry.detail = "Ticket has no requester email.";
      continue;
    }

    // Account managers often file the ticket themselves — their @duda.co user is not the
    // client, so resolving it would just report a $0 internal account. Overrides still apply
    // (the ticket's org identifies the real client even when a Duda employee filed it).
    if (!override && /@duda\.co$/i.test(requester.email)) {
      entry.stage = "duda_employee";
      entry.detail = "Requester is a Duda employee.";
      continue;
    }

    let owner;
    try {
      owner = await resolveOwnerAccount(resolveEmail);
    } catch (e) {
      entry.stage = "mrr_lookup_failed";
      entry.detail = `Account resolution errored: ${e.message}`;
      continue;
    }
    if (!owner) {
      entry.stage = "no_account_match";
      entry.detail = override
        ? `Override "${override.label || override.matchValue}" points at ${resolveEmail}, which matches no Duda account.`
        : `${resolveEmail} matches no Duda account. Add an override if this client files tickets from a non-Duda email.`;
      continue;
    }

    const ownerKey = `${owner.ownerInstance}:${owner.ownerAccountUuid || owner.ownerEmail}`;
    if (seenOwners.has(ownerKey)) {
      entry.stage = "duplicate_owner";
      entry.detail = `Same owner as another ticket (${owner.ownerEmail}) — counted once.`;
      continue;
    }
    seenOwners.add(ownerKey);

    let mrr = 0;
    try {
      const result = await fetchMrrForOwner({ accountId: owner.ownerAccountId, instance: owner.ownerInstance });
      mrr = result.mrr;
    } catch (e) {
      entry.stage = "mrr_lookup_failed";
      entry.detail = `Owner ${owner.ownerEmail} resolved, but the revenue query errored: ${e.message}`;
      continue;
    }

    if (mrr === 0) {
      entry.stage = "zero_mrr";
      entry.detail = `Owner ${owner.ownerEmail} resolved, but latest-month MRR is $0 — free account or a data gap.`;
    } else {
      entry.stage = override ? "via_override" : "ok";
      entry.detail = override
        ? `Resolved via override "${override.label || override.matchValue}" -> ${owner.ownerEmail}.`
        : `Resolved to ${owner.ownerEmail}.`;
    }

    accounts.push({ email: requester.email || resolveEmail, ownerEmail: owner.ownerEmail, businessName: owner.ownerBusinessName, mrr });
    total += mrr;
  }

  doc.mrr = Math.round(total * 100) / 100;
  doc.mrrAccounts = accounts;
  doc.mrrTrace = trace;
  doc.mrrFetchedAt = new Date();
  await doc.save();
  return doc.toObject();
}

/* ----------------------------- MRR overrides ------------------------------ */

async function getMrrOverrides() {
  return MrrOverride.find().sort({ createdAt: 1 }).lean();
}

async function createMrrOverride(body = {}) {
  const matchType = body.matchType === "org" ? "org" : body.matchType === "email" ? "email" : "";
  if (!matchType) throw new Error('matchType must be "org" or "email"');
  const rawValue = (body.matchValue == null ? "" : String(body.matchValue)).trim();
  const matchValue = matchType === "email" ? rawValue.toLowerCase() : rawValue;
  const accountEmail = (body.accountEmail == null ? "" : String(body.accountEmail)).trim();
  const label = (body.label == null ? "" : String(body.label)).trim();
  if (!matchValue) throw new Error("matchValue is required (a Zendesk org id or requester email)");
  if (matchType === "org" && !/^\d+$/.test(matchValue)) {
    throw new Error("For org overrides, matchValue must be a numeric Zendesk organization id");
  }
  if (!accountEmail) throw new Error("accountEmail is required (the Duda account to attribute MRR to)");
  const override = await MrrOverride.create({ matchType, matchValue, label, accountEmail });
  return override.toObject();
}

async function deleteMrrOverride(id) {
  const doc = await MrrOverride.findByIdAndDelete(id);
  return Boolean(doc);
}

/**
 * Bulk "Sync from Jira" for every linked bug — the server-side counterpart of the toolbar
 * button, run by the daily scheduler (scheduler.js) and the standalone cron script. Autofills
 * each row that has a Jira key/URL, a few at a time (bounded concurrency so we stay within
 * Jira's rate limits). Never throws for a single-row failure — it logs and tallies it so one
 * bad ticket can't abort the whole run. Logs loudly with a `[jira-backlog][sync]` prefix so
 * runs are easy to confirm in the server (Render) logs.
 *
 * MRR refresh rides along as a second, independently-gated pass: it's skipped entirely unless
 * Jira + Zendesk + DOMO are all configured (isMrrConfigured()), so it's a silent no-op today
 * (DOMO's two dataset ids aren't set yet) and turns on by itself once they are — no code
 * change needed.
 */
async function syncAllFromJira({ concurrency = 5 } = {}) {
  const startedAt = Date.now();
  if (!isJiraConfigured()) {
    console.log("[jira-backlog][sync] skipped — Jira is not configured (set the Jira env vars)");
    return { skipped: true, total: 0, linked: 0, ok: 0, failed: 0, durationMs: 0 };
  }

  await seedIfEmpty();
  const total = await JiraIssue.estimatedDocumentCount();
  // Only rows with something to look up in Jira (a key or a URL).
  const linked = await JiraIssue.find({ $or: [{ issueKey: { $ne: "" } }, { url: { $ne: "" } }] })
    .select("_id")
    .lean();
  const ids = linked.map((d) => d._id);
  console.log(
    `[jira-backlog][sync] starting — ${ids.length} linked of ${total} bug(s), concurrency ${concurrency}`,
  );

  let ok = 0;
  let failed = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        await autofillFromJira(id);
        ok++;
      } catch (e) {
        failed++;
        console.warn(`[jira-backlog][sync] failed ${id}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));

  const durationMs = Date.now() - startedAt;
  console.log(
    `[jira-backlog][sync] done — ${ok} synced, ${failed} failed, of ${ids.length} linked (${(durationMs / 1000).toFixed(1)}s)`,
  );

  let mrr = { skipped: true, ok: 0, failed: 0 };
  if (isMrrConfigured()) {
    console.log(`[jira-backlog][mrr-sync] starting — ${ids.length} linked bug(s), concurrency ${concurrency}`);
    let mrrOk = 0;
    let mrrFailed = 0;
    let mrrCursor = 0;
    const mrrWorker = async () => {
      while (mrrCursor < ids.length) {
        const id = ids[mrrCursor++];
        try {
          await refreshMrr(id);
          mrrOk++;
        } catch (e) {
          mrrFailed++;
          console.warn(`[jira-backlog][mrr-sync] failed ${id}: ${e.message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, mrrWorker));
    console.log(`[jira-backlog][mrr-sync] done — ${mrrOk} synced, ${mrrFailed} failed`);
    mrr = { skipped: false, ok: mrrOk, failed: mrrFailed };
  }

  return { skipped: false, total, linked: ids.length, ok, failed, durationMs, mrr };
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
  refreshMrr,
  getMrrOverrides,
  createMrrOverride,
  deleteMrrOverride,
  autofillFromJira,
  syncAllFromJira,
  getBugStatuses,
  createBugStatus,
  deleteBugStatus,
};
