import express from "express";
import coverageMeterController from "../controllers/coverageMeterController.js";
import { requirePermission } from "../middlewares/requirePermission.js";

const coverageMeterRouter = express.Router();

// scheduling:edit throughout, reads included: coverage targets are a schedule-building
// tool, and the schedule page only renders coverage rows for people who build it.
//
// The whole list is written at once (PUT /) rather than per-item CRUD, because the
// settings card batches every edit behind a single "Save changes" button.
coverageMeterRouter.get("/", requirePermission("scheduling", "edit"), coverageMeterController.getMeters);
coverageMeterRouter.put("/", requirePermission("scheduling", "edit"), coverageMeterController.replaceMeters);

export default coverageMeterRouter;
