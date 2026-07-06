import taskService from "./taskService.js";

/* --------------------------------- tasks --------------------------------- */

// GET /jira-backlog/tasks — every task across all tickets, enriched for the kanban cards.
const listAllTasks = async (_req, res) => {
  try {
    const tasks = await taskService.getAllTasks();
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /jira-backlog/issues/:id/tasks — tasks for one ticket (detail panel).
const listIssueTasks = async (req, res) => {
  try {
    const tasks = await taskService.getTasksForIssue(req.params.id);
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createTask = async (req, res) => {
  try {
    const task = await taskService.createTask(req.params.id, req.body || {});
    if (!task) return res.status(404).json({ message: "Issue not found" });
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const task = await taskService.updateTask(req.params.taskId, req.body || {});
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const ok = await taskService.deleteTask(req.params.taskId);
    if (!ok) return res.status(404).json({ message: "Task not found" });
    res.status(200).json({ message: "Task deleted" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /jira-backlog/tasks — create a standalone task (no parent issue).
const createStandaloneTask = async (req, res) => {
  try {
    const task = await taskService.createTask(null, req.body || {});
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /jira-backlog/issues/:id/no-eta-task — create (or return the existing) 30-day
// re-evaluation reminder for a bug flagged "Possible No-ETA".
const createNoEtaTask = async (req, res) => {
  try {
    const task = await taskService.createNoEtaReviewTask(req.params.id);
    if (!task) return res.status(404).json({ message: "Issue not found" });
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /jira-backlog/tasks/:taskId/no-eta — advance a review task: body { action: "reevaluate" | "resolve" }.
const noEtaTransition = async (req, res) => {
  try {
    const task = await taskService.noEtaTransition(req.params.taskId, (req.body || {}).action);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/* ------------------------------- statuses -------------------------------- */

const listStatuses = async (_req, res) => {
  try {
    const statuses = await taskService.getStatuses();
    res.status(200).json(statuses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createStatus = async (req, res) => {
  try {
    const status = await taskService.createStatus(req.body || {});
    res.status(201).json(status);
  } catch (error) {
    // Unique-index violation on `name` -> a friendly conflict, not a 500.
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ code: "DUPLICATE_STATUS", message: "A status with that name already exists." });
    }
    res.status(400).json({ message: error.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const status = await taskService.updateStatus(req.params.id, req.body || {});
    if (!status) return res.status(404).json({ message: "Status not found" });
    res.status(200).json(status);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ code: "DUPLICATE_STATUS", message: "A status with that name already exists." });
    }
    res.status(400).json({ message: error.message });
  }
};

// PUT /jira-backlog/task-statuses/order — body { ids: [...] } sets each status's order to
// its position in the array (the status manager's drag/reorder).
const reorderStatuses = async (req, res) => {
  try {
    const statuses = await taskService.reorderStatuses((req.body || {}).ids || []);
    res.status(200).json(statuses);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Deleting a status that still has tasks is blocked (409) — same 409+code convention as
// jiraBacklogController's JIRA_NOT_CONFIGURED, so the UI can show a clear message.
const deleteStatus = async (req, res) => {
  try {
    const result = await taskService.deleteStatus(req.params.id);
    if (result.ok) return res.status(200).json({ message: "Status deleted" });
    if (result.code === "NOT_FOUND") return res.status(404).json({ message: "Status not found" });
    if (result.code === "STATUS_IN_USE") {
      return res.status(409).json({
        code: "STATUS_IN_USE",
        message: `This status still has ${result.count} task${result.count === 1 ? "" : "s"}. Move or remove them first.`,
      });
    }
    res.status(400).json({ message: "Could not delete status" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export default {
  listAllTasks,
  listIssueTasks,
  createTask,
  createStandaloneTask,
  createNoEtaTask,
  noEtaTransition,
  updateTask,
  deleteTask,
  listStatuses,
  createStatus,
  updateStatus,
  reorderStatuses,
  deleteStatus,
};
