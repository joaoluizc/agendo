import express from "express";
import positionController from "../controllers/positionController.js";

const positionRouter = express.Router();

positionRouter.get("/all", positionController.getAllPositions);

positionRouter.post("/new", positionController.createPosition);

positionRouter.get("/", positionController.getPosition);

positionRouter.put("/:positionId", positionController.updatePosition);

positionRouter.delete("/:positionId", positionController.deletePosition);

positionRouter.get("/sync", positionController.getUserPositionsToSync);

positionRouter.put("/sync", positionController.setUserPositionsToSync);

export default positionRouter;
