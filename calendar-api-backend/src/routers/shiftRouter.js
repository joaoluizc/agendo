import express from "express";
import shiftController from "../controllers/shiftController.js";

const shiftRouter = express.Router();

shiftRouter.post("/new", shiftController.createShift);

shiftRouter.get("/range", shiftController.findShiftsByRange);

shiftRouter.get("/", shiftController.getShift);

shiftRouter.put("/", shiftController.updateShift);

shiftRouter.delete("/", shiftController.deleteShift);

shiftRouter.get(
  "/range/with-sling",
  shiftController.findShiftsByRangeWithSling
);

export default shiftRouter;
