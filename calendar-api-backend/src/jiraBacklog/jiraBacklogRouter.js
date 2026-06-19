import express from "express";
import jiraBacklogController from "./jiraBacklogController.js";
import adminOnly from "../middlewares/adminOnly.js";

/**
 * Routes for the Jira backlog feature. Mounted in app.js behind requireAuth(), so every
 * endpoint requires a signed-in agendo user (any user may read). Mutations and Jira
 * fetches additionally require an admin via agendo's existing `adminOnly` middleware —
 * this replaces the spec's ADMIN_EMAILS scheme, since agendo already models admin vs
 * normal users (UserModel.type) through Clerk.
 */
const jiraBacklogRouter = express.Router();

// Read (any authenticated user)
jiraBacklogRouter.get("/config", jiraBacklogController.getConfig);
jiraBacklogRouter.get("/issues", jiraBacklogController.listIssues);

// Write + Jira fetches (admins only)
jiraBacklogRouter.post("/issues", adminOnly, jiraBacklogController.createIssue);
jiraBacklogRouter.patch("/issues/:id", adminOnly, jiraBacklogController.updateIssue);
jiraBacklogRouter.delete("/issues/:id", adminOnly, jiraBacklogController.deleteIssue);
jiraBacklogRouter.post("/issues/:id/refresh-zd", adminOnly, jiraBacklogController.refreshZd);

export default jiraBacklogRouter;
