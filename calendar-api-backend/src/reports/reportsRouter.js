import express from "express";
import reportsController from "./reportsController.js";
import { requirePermission } from "../middlewares/requirePermission.js";

const reportsRouter = express.Router();

// The hours report needs reports:self — a self-level caller gets only their own row (see
// the controller). Report groups are config with effects on Performance hours too, so
// reading and editing them needs reports:edit.
reportsRouter.get("/groups", requirePermission("reports", "edit"), reportsController.getGroups);
reportsRouter.put("/groups", requirePermission("reports", "edit"), reportsController.replaceGroups);
reportsRouter.get("/hours", requirePermission("reports", "self"), reportsController.getHoursReport);

export default reportsRouter;
