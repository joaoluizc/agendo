import express from "express";
import positionController from "../controllers/positionController.js";

const positionRouter = express.Router();

positionRouter.get("/", (req, res) => {
  positionController.getAllPositions(req, res);
});

positionRouter.post("/", (req, res) => {
  positionController.createPosition(req, res);
});

positionRouter.get("/sync", (req, res) => {
  positionController.getUserPositionsToSync_cl(req, res);
});

positionRouter.put("/sync", (req, res) => {
  positionController.setUserPositionsToSync_cl(req, res);
});

export default positionRouter;
