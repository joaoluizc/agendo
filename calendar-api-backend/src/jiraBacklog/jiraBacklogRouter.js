import express from "express";
import jiraBacklogController from "./jiraBacklogController.js";
import taskController from "./taskController.js";
import adminOnly from "../middlewares/adminOnly.js";

/**
 * Routes for the Jira backlog feature. Mounted in app.js behind requireAuth(), so every
 * endpoint requires a signed-in agendo user (any user may read). Mutations and Jira
 * fetches additionally require an admin via agendo's existing `adminOnly` middleware —
 * this replaces the spec's ADMIN_EMAILS scheme, since agendo already models admin vs
 * normal users (UserModel.type) through Clerk.
 */
const jiraBacklogRouter = express.Router();

// Admin-only throughout: the Jira Backlog + Tasks pages are admin-only (enforced on the
// client by AdminRoute), so these endpoints are gated to match — the data isn't readable
// by a non-admin hitting the API directly. adminOnly is bypassed in development.
jiraBacklogRouter.get("/config", adminOnly, jiraBacklogController.getConfig);
jiraBacklogRouter.get("/issues", adminOnly, jiraBacklogController.listIssues);

// Writes + Jira fetches
jiraBacklogRouter.post("/issues", adminOnly, jiraBacklogController.createIssue);
jiraBacklogRouter.patch("/issues/:id", adminOnly, jiraBacklogController.updateIssue);
jiraBacklogRouter.delete("/issues/:id", adminOnly, jiraBacklogController.deleteIssue);
jiraBacklogRouter.post("/issues/:id/refresh-zd", adminOnly, jiraBacklogController.refreshZd);
jiraBacklogRouter.post("/issues/:id/autofill", adminOnly, jiraBacklogController.autofill);

// Bug statuses (the issue status dropdown — user-managed: add / delete)
jiraBacklogRouter.get("/bug-statuses", adminOnly, jiraBacklogController.listBugStatuses);
jiraBacklogRouter.post("/bug-statuses", adminOnly, jiraBacklogController.createBugStatus);
jiraBacklogRouter.delete("/bug-statuses/:id", adminOnly, jiraBacklogController.deleteBugStatus);

/**
 * Tasks layer (see taskService.js). Admin-only like the issue routes (the Tasks page is
 * admin-only). A task is linked to a ticket, so it's created under that ticket's id;
 * updates/deletes address the task directly.
 */
// Tasks
jiraBacklogRouter.get("/tasks", adminOnly, taskController.listAllTasks);
jiraBacklogRouter.get("/issues/:id/tasks", adminOnly, taskController.listIssueTasks);
jiraBacklogRouter.post("/issues/:id/tasks", adminOnly, taskController.createTask);
jiraBacklogRouter.patch("/tasks/:taskId", adminOnly, taskController.updateTask);
jiraBacklogRouter.delete("/tasks/:taskId", adminOnly, taskController.deleteTask);

// Task statuses (kanban columns)
jiraBacklogRouter.get("/task-statuses", adminOnly, taskController.listStatuses);
jiraBacklogRouter.post("/task-statuses", adminOnly, taskController.createStatus);
jiraBacklogRouter.patch("/task-statuses/:id", adminOnly, taskController.updateStatus);
jiraBacklogRouter.delete("/task-statuses/:id", adminOnly, taskController.deleteStatus);

export default jiraBacklogRouter;
