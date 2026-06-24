import { JiraTask, TaskStatus } from "./taskModel.js";
import { JiraIssue } from "./jiraBacklogModel.js";

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

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
 * Every task across all tickets, flattened for the kanban cards (title + status + the
 * parent issue's key/description/id). Tasks whose issue was deleted (orphans) are skipped.
 */
async function getAllTasks() {
  const tasks = await JiraTask.find()
    .sort({ order: 1, createdAt: 1 })
    .populate("issueId", "issueKey desc")
    .lean();
  return tasks
    .filter((t) => t.issueId) // drop orphans (issue removed)
    .map((t) => ({
      _id: t._id,
      title: t.title,
      statusId: t.statusId,
      order: t.order,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      issueId: t.issueId._id,
      issueKey: t.issueId.issueKey || "",
      issueDesc: t.issueId.desc || "",
    }));
}

async function createTask(issueId, body = {}) {
  const issue = await JiraIssue.findById(issueId).select("_id").lean();
  if (!issue) return null; // controller -> 404

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
    issueId,
    title,
    statusId,
    order: await nextTaskOrder(statusId),
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
};
