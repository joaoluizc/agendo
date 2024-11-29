import express from "express";
import positionController from "../controllers/positionController.js";

const positionRouter = express.Router();

positionRouter.get("/all", positionController.getAllPositions);

positionRouter.post("/new", positionController.createPosition);

positionRouter.get("/", positionController.getPosition);

positionRouter.get("/sync", positionController.getUserPositionsToSync_cl);

positionRouter.put("/sync", positionController.setUserPositionsToSync_cl);

export default positionRouter;
