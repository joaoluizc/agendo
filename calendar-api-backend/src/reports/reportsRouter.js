import express from "express";
import reportsController from "./reportsController.js";
import adminOnly from "../middlewares/adminOnly.js";

const reportsRouter = express.Router();

// Admin-only throughout, reads included: this is a management/reporting tool, not
// user-facing data — same convention as coverageMeterRouter.js.
reportsRouter.get("/groups", adminOnly, reportsController.getGroups);
reportsRouter.put("/groups", adminOnly, reportsController.replaceGroups);
reportsRouter.get("/hours", adminOnly, reportsController.getHoursReport);

export default reportsRouter;
