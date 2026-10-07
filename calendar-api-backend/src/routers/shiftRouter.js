import express from "express";
import shiftController from "../controllers/shiftController.js";
import { requirePermission } from "../middlewares/requirePermission.js";

const shiftRouter = express.Router();

// Every shift mutation needs scheduling:edit, enforced here on the server — never only
// in the UI. `createShift` is the sharpest case: it takes an arbitrary `userIds` array and
// writes Google Calendar events into those employees' real calendars.
//
// Reads need scheduling:view: the schedule page shows the whole roster's day to anyone who
// can see the schedule. Drafts are only returned to scheduling:edit (see the controller).

shiftRouter.post("/new", requirePermission("scheduling", "edit"), shiftController.createShift);

shiftRouter.get("/range", requirePermission("scheduling", "view"), shiftController.findShiftsByRange);

shiftRouter.get("/", requirePermission("scheduling", "view"), shiftController.getShift);

shiftRouter.put("/", requirePermission("scheduling", "edit"), shiftController.updateShift);

shiftRouter.post("/delete", requirePermission("scheduling", "edit"), shiftController.deleteShift);

shiftRouter.get(
  "/range/with-sling",
  requirePermission("scheduling", "view"),
  shiftController.findShiftsByRangeWithSling
);

shiftRouter.post(
  "/duplicate-shifts",
  requirePermission("scheduling", "edit"),
  shiftController.duplicateShiftsFromDay
);

// Commit drafts. Creating a shift no longer syncs it, so this is the only route that puts
// a shift on an agent's real calendar — which is exactly why it needs scheduling:edit.
shiftRouter.post("/publish", requirePermission("scheduling", "edit"), shiftController.publishShifts);

// The reverse: back to draft, and the calendar event goes with it.
shiftRouter.post("/unpublish", requirePermission("scheduling", "edit"), shiftController.unpublishShifts);

export default shiftRouter;
