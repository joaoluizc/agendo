import express from "express";
import positionController from "../controllers/positionController.js";
import adminOnly from "../middlewares/adminOnly.js";

const positionRouter = express.Router();

positionRouter.get("/all", positionController.getAllPositions);

positionRouter.post("/new", adminOnly, positionController.createPosition);

positionRouter.get("/", positionController.getPosition);

positionRouter.get("/sync", positionController.getUserPositionsToSync);

positionRouter.put("/sync", positionController.setUserPositionsToSync);

// Must be declared before "/:positionId" so it isn't captured as a positionId.
positionRouter.get(
  "/default-color",
  positionController.getUserDefaultEventColorId,
);

positionRouter.put(
  "/default-color",
  positionController.setUserDefaultEventColorId,
);

positionRouter.put("/:positionId", adminOnly, positionController.updatePosition);

positionRouter.delete(
  "/:positionId",
  adminOnly,
  positionController.deletePosition,
);

export default positionRouter;
