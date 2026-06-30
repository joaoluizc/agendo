import { JiraTask, TaskStatus } from "./taskModel.js";
import { JiraIssue } from "./jiraBacklogModel.js";

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Re-evaluation cadence for "Possible No-ETA" review tasks — 30 days between reviews.
const NO_ETA_REVIEW_DAYS = 30;

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/** A deadline from the client: null / "" clears it; anything else is coerced to a Date. */
function parseDeadline(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------- statuses -------------------------------- */

// Memoised so concurrent first-requests in one process can't double-seed (mirrors
// jiraBacklogService.seedIfEmpty). The unique index on `name` is the cross-process guard.
let statusSeedPromise = null;
function seedStatusesIfEmpty() {
  if (!statusSeedPromise) statusSeedPromise = doSeedStatuses();
  return statusSeedPromise;
}
async function doSeedStatuses() {
  const count = await TaskStatus.estimatedDocumentCount();
  if (count > 0) return; // never re-seed once statuses exist
  await TaskStatus.insertMany([
    { name: "Not done", order: 0 },
    { name: "Doing", order: 1 },
    { name: "Done", order: 2 },
  ]);
  console.log("[jira-backlog] seeded 3 default task statuses");
}

async function nextStatusOrder() {
  const last = await TaskStatus.findOne().sort({ order: -1 }).select("order").lean();
  return (last?.order ?? -1) + 1;
}

async function getStatuses() {
  await seedStatusesIfEmpty();
  return TaskStatus.find().sort({ order: 1, createdAt: 1 }).lean();
}

async function createStatus(body = {}) {
  const name = (body.name == null ? "" : String(body.name)).trim();
  if (!name) throw new Error("Status name is required");
  const status = await TaskStatus.create({ name, order: await nextStatusOrder() });
  return status.toObject();
}

async function updateStatus(id, body = {}) {
  const doc = await TaskStatus.findById(id);
  if (!doc) return null;
  if (has(body, "name")) {
    const name = String(body.name).trim();
    if (name) doc.name = name;
  }
  if (has(body, "order")) {
    const n = Number(body.order);
    if (Number.isFinite(n)) doc.order = n;
  }
  await doc.save();
  return doc.toObject();
}

/**
 * Delete a status, but never while tasks still reference it. Returns a small result
 * object the controller maps to HTTP codes: NOT_FOUND -> 404, STATUS_IN_USE -> 409.
 */
async function deleteStatus(id) {
  const doc = await TaskStatus.findById(id);
  if (!doc) return { ok: false, code: "NOT_FOUND" };
  const count = await JiraTask.countDocuments({ statusId: id });
  if (count > 0) return { ok: false, code: "STATUS_IN_USE", count };
  await doc.deleteOne();
  return { ok: true };
}

/* --------------------------------- tasks --------------------------------- */

async function nextTaskOrder(statusId) {
  const last = await JiraTask.findOne({ statusId }).sort({ order: -1 }).select("order").lean();
  return (last?.order ?? -1) + 1;
}

async function getTasksForIssue(issueId) {
  return JiraTask.find({ issueId }).sort({ order: 1, createdAt: 1 }).lean();
}

/**
 * Every task across all tickets, flattened for the kanban cards (title + status + deadline
 * + the parent issue's key/description/id when linked). Standalone tasks (no issue) are
 * kept with empty issueKey/desc; only true orphans — a task whose linked issue no longer
 * exists — are skipped.
 */
async function getAllTasks() {
  const tasks = await JiraTask.find().sort({ order: 1, createdAt: 1 }).lean();
  const issueIds = [...new Set(tasks.filter((t) => t.issueId).map((t) => String(t.issueId)))];
  const issues = issueIds.length
    ? await JiraIssue.find({ _id: { $in: issueIds } }).select("issueKey desc").lean()
    : [];
  const byId = new Map(issues.map((i) => [String(i._id), i]));

  const out = [];
  for (const t of tasks) {
    const issue = t.issueId ? byId.get(String(t.issueId)) : null;
    if (t.issueId && !issue) continue; // orphan: linked issue was deleted
    out.push({
      _id: t._id,
      title: t.title,
      statusId: t.statusId,
      order: t.order,
      deadline: t.deadline ?? null,
      noEtaReview: t.noEtaReview ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      issueId: t.issueId ? String(t.issueId) : null,
      issueKey: issue?.issueKey || "",
      issueDesc: issue?.desc || "",
    });
  }
  return out;
}

/**
 * Create a task. `issueId` is optional: when provided the issue must exist (returns null
 * -> 404 otherwise); when null/omitted the task is standalone. `deadline` is optional.
 */
async function createTask(issueId, body = {}) {
  if (issueId) {
    const issue = await JiraIssue.findById(issueId).select("_id").lean();
    if (!issue) return null; // controller -> 404
  }

  const title = (body.title == null ? "" : String(body.title)).trim();
  if (!title) throw new Error("Task title is required");

  let statusId = body.statusId;
  if (!statusId) {
    await seedStatusesIfEmpty();
    const first = await TaskStatus.findOne().sort({ order: 1 }).select("_id").lean();
    statusId = first?._id;
  } else if (!(await TaskStatus.exists({ _id: statusId }))) {
    throw new Error("Unknown task status");
  }
  if (!statusId) throw new Error("No task status available");

  const task = await JiraTask.create({
    issueId: issueId || null,
    title,
    statusId,
    order: await nextTaskOrder(statusId),
    deadline: parseDeadline(body.deadline),
  });
  return task.toObject();
}

async function updateTask(id, body = {}) {
  const doc = await JiraTask.findById(id);
  if (!doc) return null;

  if (has(body, "title")) {
    const title = String(body.title).trim();
    if (title) doc.title = title;
  }
  if (has(body, "statusId")) {
    if (!(await TaskStatus.exists({ _id: body.statusId }))) {
      throw new Error("Unknown task status");
    }
    doc.statusId = body.statusId;
  }
  if (has(body, "order")) {
    const n = Number(body.order);
    if (Number.isFinite(n)) doc.order = n;
  }
  if (has(body, "deadline")) {
    doc.deadline = parseDeadline(body.deadline);
  }

  await doc.save();
  return doc.toObject();
}

async function deleteTask(id) {
  const doc = await JiraTask.findByIdAndDelete(id);
  return Boolean(doc);
}

/** Remove every task belonging to an issue — called when the issue itself is deleted. */
async function deleteTasksForIssue(issueId) {
  await JiraTask.deleteMany({ issueId });
}

/* ------------------------------ No-ETA review ----------------------------- */

// The "Done" column for a resolved review task: prefer one literally named "Done",
// else the rightmost (highest-order) column. seedStatusesIfEmpty guarantees one exists.
async function resolveDoneStatusId() {
  await seedStatusesIfEmpty();
  const named = await TaskStatus.findOne({ name: /^done$/i }).select("_id").lean();
  if (named) return named._id;
  const last = await TaskStatus.findOne().sort({ order: -1 }).select("_id").lean();
  return last?._id || null;
}

/**
 * Create the 30-day re-evaluation reminder for a bug flagged "Possible No-ETA". Idempotent
 * per bug: if an unresolved review task already exists for the issue, returns it instead of
 * creating a duplicate. Returns null if the issue doesn't exist (controller -> 404).
 */
async function createNoEtaReviewTask(issueId) {
  const issue = await JiraIssue.findById(issueId).select("issueKey").lean();
  if (!issue) return null;

  const existing = await JiraTask.findOne({ issueId, noEtaReview: { $ne: null } }).lean();
  if (existing) return existing;

  await seedStatusesIfEmpty();
  const first = await TaskStatus.findOne().sort({ order: 1 }).select("_id").lean();
  if (!first) throw new Error("No task status available");

  const now = new Date();
  const task = await JiraTask.create({
    issueId,
    title: `Re-evaluate No-ETA candidate${issue.issueKey ? ` (${issue.issueKey})` : ""}`,
    statusId: first._id,
    order: await nextTaskOrder(first._id),
    deadline: addDays(now, NO_ETA_REVIEW_DAYS),
    noEtaReview: { flaggedAt: now, cycles: 0 },
  });
  return task.toObject();
}

/**
 * Advance a No-ETA review task. `reevaluate` pushes the deadline another 30 days and bumps
 * the cycle count; `resolve` clears the review marker and parks the task in the Done column
 * (the caller separately moves the bug to the "No-ETA" status). Returns null if not found.
 */
async function noEtaTransition(taskId, action) {
  const doc = await JiraTask.findById(taskId);
  if (!doc) return null; // controller -> 404
  if (!doc.noEtaReview) throw new Error("Task is not a No-ETA review task");

  if (action === "reevaluate") {
    doc.deadline = addDays(new Date(), NO_ETA_REVIEW_DAYS);
    // Reassign the subdoc so Mongoose tracks the change.
    doc.noEtaReview = { flaggedAt: doc.noEtaReview.flaggedAt, cycles: (doc.noEtaReview.cycles || 0) + 1 };
  } else if (action === "resolve") {
    const doneId = await resolveDoneStatusId();
    if (doneId) {
      doc.statusId = doneId;
      doc.order = await nextTaskOrder(doneId);
    }
    doc.noEtaReview = null;
  } else {
    throw new Error("Unknown action");
  }

  await doc.save();
  return doc.toObject();
}

export default {
  // statuses
  getStatuses,
  createStatus,
  updateStatus,
  deleteStatus,
  // tasks
  getTasksForIssue,
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  deleteTasksForIssue,
  // No-ETA review lifecycle
  createNoEtaReviewTask,
  noEtaTransition,
};
