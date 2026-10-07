import express from "express";
import reportsController from "./reportsController.js";
import adminOnly from "../middlewares/adminOnly.js";
import { requirePermission } from "../middlewares/requirePermission.js";

const reportsRouter = express.Router();

// Admin-only throughout, reads included: this is a management/reporting tool, not
// user-facing data — same convention as coverageMeterRouter.js.
reportsRouter.get("/groups", requirePermission("reports", "edit"), adminOnly, reportsController.getGroups);
reportsRouter.put("/groups", requirePermission("reports", "edit"), adminOnly, reportsController.replaceGroups);
reportsRouter.get("/hours", requirePermission("reports", "self"), adminOnly, reportsController.getHoursReport);

export default reportsRouter;
