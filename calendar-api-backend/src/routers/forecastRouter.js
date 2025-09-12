import express from "express";
import { forecastAdaStaffingController } from "../controllers/forecastController.js";
import { generateAndPersistChatForecast } from "../services/demandForecastService.js";

const router = express.Router();

// GET or POST /api/forecast/chats
router.route("/chats").get(forecastAdaStaffingController);
router.route("/chats-persist").post(async (req, res) => {
  const count = await generateAndPersistChatForecast();
  res.status(201).json({ count });
});

export default router;
