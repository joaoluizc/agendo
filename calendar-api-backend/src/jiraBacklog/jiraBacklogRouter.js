import express from "express";
import jiraBacklogController from "./jiraBacklogController.js";
import taskController from "./taskController.js";
import adminOnly from "../middlewares/adminOnly.js";
import { requireAdmin, requirePermission } from "../middlewares/requirePermission.js";

/**
 * Routes for the Jira backlog feature. Mounted in app.js behind requireSession, so every
 * endpoint requires a signed-in session, and every route below also requires an admin via
 * agendo's `adminOnly` middleware — this replaces the spec's ADMIN_EMAILS scheme, since
 * agendo already models admin vs normal users (Mongo UserModel.type).
 */
const jiraBacklogRouter = express.Router();

// Admin-only throughout: the Jira Backlog + Tasks pages are admin-only (enforced on the
// client by AdminRoute), so these endpoints are gated to match — the data isn't readable
// by a non-admin hitting the API directly.
jiraBacklogRouter.get("/config", requirePermission("bugs", "view"), adminOnly, jiraBacklogController.getConfig);
jiraBacklogRouter.get("/issues", requirePermission("bugs", "view"), adminOnly, jiraBacklogController.listIssues);

// Writes + Jira fetches
jiraBacklogRouter.post("/issues", requirePermission("bugs", "edit"), adminOnly, jiraBacklogController.createIssue);
jiraBacklogRouter.patch("/issues/:id", requirePermission("bugs", "edit"), adminOnly, jiraBacklogController.updateIssue);
jiraBacklogRouter.delete("/issues/:id", requirePermission("bugs", "edit"), adminOnly, jiraBacklogController.deleteIssue);
jiraBacklogRouter.post("/issues/:id/refresh-zd", requirePermission("bugs", "edit"), adminOnly, jiraBacklogController.refreshZd);
jiraBacklogRouter.post("/issues/:id/refresh-mrr", requirePermission("bugs", "edit"), adminOnly, jiraBacklogController.refreshMrr);
jiraBacklogRouter.post("/issues/:id/autofill", requirePermission("bugs", "edit"), adminOnly, jiraBacklogController.autofill);

// MRR overrides (admin-managed matcher -> Duda account email; see mrrOverrideModel.js)
jiraBacklogRouter.get("/mrr-overrides", requireAdmin, adminOnly, jiraBacklogController.listMrrOverrides);
jiraBacklogRouter.post("/mrr-overrides", requireAdmin, adminOnly, jiraBacklogController.createMrrOverride);
jiraBacklogRouter.delete("/mrr-overrides/:id", requireAdmin, adminOnly, jiraBacklogController.deleteMrrOverride);

// Bug statuses (the issue status dropdown — user-managed: add / delete)
jiraBacklogRouter.get("/bug-statuses", requirePermission("bugs", "view"), adminOnly, jiraBacklogController.listBugStatuses);
jiraBacklogRouter.post("/bug-statuses", requireAdmin, adminOnly, jiraBacklogController.createBugStatus);
jiraBacklogRouter.delete("/bug-statuses/:id", requireAdmin, adminOnly, jiraBacklogController.deleteBugStatus);

/**
 * Tasks layer (see taskService.js). Admin-only like the issue routes (the Tasks page is
 * admin-only). A task is linked to a ticket, so it's created under that ticket's id;
 * updates/deletes address the task directly.
 */
// Tasks
jiraBacklogRouter.get("/tasks", requirePermission("bugs", "view"), adminOnly, taskController.listAllTasks);
jiraBacklogRouter.post("/tasks", requirePermission("bugs", "edit"), adminOnly, taskController.createStandaloneTask); // standalone (no issue)
jiraBacklogRouter.get("/issues/:id/tasks", requirePermission("bugs", "view"), adminOnly, taskController.listIssueTasks);
jiraBacklogRouter.post("/issues/:id/tasks", requirePermission("bugs", "edit"), adminOnly, taskController.createTask);
jiraBacklogRouter.patch("/tasks/:taskId", requirePermission("bugs", "edit"), adminOnly, taskController.updateTask);
jiraBacklogRouter.delete("/tasks/:taskId", requirePermission("bugs", "edit"), adminOnly, taskController.deleteTask);

// "Possible No-ETA" review lifecycle: create the 30-day reminder for a bug, then
// re-evaluate / resolve it (see taskService).
jiraBacklogRouter.post("/issues/:id/no-eta-task", requirePermission("bugs", "edit"), adminOnly, taskController.createNoEtaTask);
jiraBacklogRouter.post("/tasks/:taskId/no-eta", requirePermission("bugs", "edit"), adminOnly, taskController.noEtaTransition);

// Task statuses (kanban columns)
jiraBacklogRouter.get("/task-statuses", requirePermission("bugs", "view"), adminOnly, taskController.listStatuses);
jiraBacklogRouter.post("/task-statuses", requireAdmin, adminOnly, taskController.createStatus);
// Bulk reorder (static path before :id so it's never captured as an id).
jiraBacklogRouter.put("/task-statuses/order", requireAdmin, adminOnly, taskController.reorderStatuses);
jiraBacklogRouter.patch("/task-statuses/:id", requireAdmin, adminOnly, taskController.updateStatus);
jiraBacklogRouter.delete("/task-statuses/:id", requireAdmin, adminOnly, taskController.deleteStatus);

export default jiraBacklogRouter;
