import express from "express";
import positionController from "../controllers/positionController.js";
import { requireAdmin, requirePermission, signedIn } from "../middlewares/requirePermission.js";

const positionRouter = express.Router();

positionRouter.get("/all", signedIn, positionController.getAllPositions);

positionRouter.post("/new", requireAdmin, positionController.createPosition);

positionRouter.get("/sync", signedIn, positionController.getUserPositionsToSync);

positionRouter.put("/sync", signedIn, positionController.setUserPositionsToSync);

// Another agent's sync verdicts, for the schedule's edit-shift dialog. scheduling:edit, and
// declared before "/:positionId" so it isn't captured as a positionId.
positionRouter.get(
  "/sync-rules",
  requirePermission("scheduling", "edit"),
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

positionRouter.put("/:positionId", requireAdmin, positionController.updatePosition);

positionRouter.delete(
  "/:positionId",
  requireAdmin,
  positionController.deletePosition,
);

export default positionRouter;
