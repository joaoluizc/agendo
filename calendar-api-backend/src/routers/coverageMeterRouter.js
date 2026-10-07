import express from "express";
import coverageMeterController from "../controllers/coverageMeterController.js";
import adminOnly from "../middlewares/adminOnly.js";
import { requirePermission } from "../middlewares/requirePermission.js";

const coverageMeterRouter = express.Router();

// Admin-only throughout, reads included: coverage targets are a management tool and
// the schedule page only renders coverage rows for admins, so the data isn't readable
// by a normal user hitting the API directly.
//
// The whole list is written at once (PUT /) rather than per-item CRUD, because the
// settings card batches every edit behind a single "Save changes" button.
coverageMeterRouter.get("/", requirePermission("scheduling", "edit"), adminOnly, coverageMeterController.getMeters);
coverageMeterRouter.put("/", requirePermission("scheduling", "edit"), adminOnly, coverageMeterController.replaceMeters);

export default coverageMeterRouter;
