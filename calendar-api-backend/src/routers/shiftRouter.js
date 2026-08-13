import express from "express";
import shiftController from "../controllers/shiftController.js";
import adminOnly from "../middlewares/adminOnly.js";

const shiftRouter = express.Router();

// Every shift mutation is admin-only. The UI has always enforced this (EmptySlot,
// Shift, CreateShiftBtn, DuplicateShifts and ToggleBulkSelector all no-op or render
// nothing for a non-admin), but the server did not — so a normal authenticated user
// could create, rewrite or delete any shift by calling the API directly. `createShift`
// is the sharpest case: it takes an arbitrary `userIds` array and writes Google
// Calendar events into those employees' real calendars.
//
// Reads stay open to any authenticated user: the schedule page shows the whole
// roster's day to everyone.

shiftRouter.post("/new", adminOnly, shiftController.createShift);

shiftRouter.get("/range", shiftController.findShiftsByRange);

shiftRouter.get("/", shiftController.getShift);

shiftRouter.put("/", adminOnly, shiftController.updateShift);

shiftRouter.post("/delete", adminOnly, shiftController.deleteShift);

shiftRouter.get(
  "/range/with-sling",
  shiftController.findShiftsByRangeWithSling
);

shiftRouter.post(
  "/duplicate-shifts",
  adminOnly,
  shiftController.duplicateShiftsFromDay
);

export default shiftRouter;
