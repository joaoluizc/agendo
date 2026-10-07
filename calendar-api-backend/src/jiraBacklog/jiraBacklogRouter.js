import express from "express";
import jiraBacklogController from "./jiraBacklogController.js";
import taskController from "./taskController.js";
import { requireAdmin, requirePermission } from "../middlewares/requirePermission.js";

/**
 * Routes for the Jira backlog feature — the "bugs" permission area. Reads need
 * bugs:view, edits need bugs:edit, and the board's taxonomy (bug and task statuses) and
 * MRR overrides are admin-only: they change the board for everyone and how revenue is
 * attributed to bugs. See docs/knowledge/permissions.md.
 */
const jiraBacklogRouter = express.Router();

jiraBacklogRouter.get("/config", requirePermission("bugs", "view"), jiraBacklogController.getConfig);
jiraBacklogRouter.get("/issues", requirePermission("bugs", "view"), jiraBacklogController.listIssues);

// Writes + Jira fetches
jiraBacklogRouter.post("/issues", requirePermission("bugs", "edit"), jiraBacklogController.createIssue);
jiraBacklogRouter.patch("/issues/:id", requirePermission("bugs", "edit"), jiraBacklogController.updateIssue);
jiraBacklogRouter.delete("/issues/:id", requirePermission("bugs", "edit"), jiraBacklogController.deleteIssue);
jiraBacklogRouter.post("/issues/:id/refresh-zd", requirePermission("bugs", "edit"), jiraBacklogController.refreshZd);
jiraBacklogRouter.post("/issues/:id/refresh-mrr", requirePermission("bugs", "edit"), jiraBacklogController.refreshMrr);
jiraBacklogRouter.post("/issues/:id/autofill", requirePermission("bugs", "edit"), jiraBacklogController.autofill);

// MRR overrides (admin-managed matcher -> Duda account email; see mrrOverrideModel.js)
jiraBacklogRouter.get("/mrr-overrides", requireAdmin, jiraBacklogController.listMrrOverrides);
jiraBacklogRouter.post("/mrr-overrides", requireAdmin, jiraBacklogController.createMrrOverride);
jiraBacklogRouter.delete("/mrr-overrides/:id", requireAdmin, jiraBacklogController.deleteMrrOverride);

// Bug statuses (the issue status dropdown — user-managed: add / delete)
jiraBacklogRouter.get("/bug-statuses", requirePermission("bugs", "view"), jiraBacklogController.listBugStatuses);
jiraBacklogRouter.post("/bug-statuses", requireAdmin, jiraBacklogController.createBugStatus);
jiraBacklogRouter.delete("/bug-statuses/:id", requireAdmin, jiraBacklogController.deleteBugStatus);

/**
 * Tasks layer (see taskService.js). Same levels as the issue routes: bugs:view to read,
 * bugs:edit to change. A task is linked to a ticket, so it's created under that ticket's
 * id; updates/deletes address the task directly.
 */
// Tasks
jiraBacklogRouter.get("/tasks", requirePermission("bugs", "view"), taskController.listAllTasks);
jiraBacklogRouter.post("/tasks", requirePermission("bugs", "edit"), taskController.createStandaloneTask); // standalone (no issue)
jiraBacklogRouter.get("/issues/:id/tasks", requirePermission("bugs", "view"), taskController.listIssueTasks);
jiraBacklogRouter.post("/issues/:id/tasks", requirePermission("bugs", "edit"), taskController.createTask);
jiraBacklogRouter.patch("/tasks/:taskId", requirePermission("bugs", "edit"), taskController.updateTask);
jiraBacklogRouter.delete("/tasks/:taskId", requirePermission("bugs", "edit"), taskController.deleteTask);

// "Possible No-ETA" review lifecycle: create the 30-day reminder for a bug, then
// re-evaluate / resolve it (see taskService).
jiraBacklogRouter.post("/issues/:id/no-eta-task", requirePermission("bugs", "edit"), taskController.createNoEtaTask);
jiraBacklogRouter.post("/tasks/:taskId/no-eta", requirePermission("bugs", "edit"), taskController.noEtaTransition);

// Task statuses (kanban columns)
jiraBacklogRouter.get("/task-statuses", requirePermission("bugs", "view"), taskController.listStatuses);
jiraBacklogRouter.post("/task-statuses", requireAdmin, taskController.createStatus);
// Bulk reorder (static path before :id so it's never captured as an id).
jiraBacklogRouter.put("/task-statuses/order", requireAdmin, taskController.reorderStatuses);
jiraBacklogRouter.patch("/task-statuses/:id", requireAdmin, taskController.updateStatus);
jiraBacklogRouter.delete("/task-statuses/:id", requireAdmin, taskController.deleteStatus);

export default jiraBacklogRouter;
