import express from "express";
import positionController from "../controllers/positionController.js";
import adminOnly from "../middlewares/adminOnly.js";
import { requireAdmin, requirePermission, signedIn } from "../middlewares/requirePermission.js";

const positionRouter = express.Router();

positionRouter.get("/all", signedIn, positionController.getAllPositions);

positionRouter.post("/new", requireAdmin, adminOnly, positionController.createPosition);

positionRouter.get("/", signedIn, positionController.getPosition);

positionRouter.get("/sync", signedIn, positionController.getUserPositionsToSync);

positionRouter.put("/sync", signedIn, positionController.setUserPositionsToSync);

// Another agent's sync verdicts, for the schedule's edit-shift dialog. Admin-only, and
// declared before "/:positionId" so it isn't captured as a positionId.
positionRouter.get(
  "/sync-rules",
  requirePermission("scheduling", "edit"),
  adminOnly,
  positionController.getSyncRulesForUser,
);

// Must be declared before "/:positionId" so it isn't captured as a positionId.
positionRouter.get(
  "/default-color",
  signedIn,
  positionController.getUserDefaultEventColorId,
);

positionRouter.put(
  "/default-color",
  signedIn,
  positionController.setUserDefaultEventColorId,
);

positionRouter.put("/:positionId", requireAdmin, adminOnly, positionController.updatePosition);

positionRouter.delete(
  "/:positionId",
  requireAdmin,
  adminOnly,
  positionController.deletePosition,
);

export default positionRouter;
