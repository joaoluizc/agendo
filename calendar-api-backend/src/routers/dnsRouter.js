import express from "express";
import { lookup } from "../controllers/dnsController.js";
import { publicRoute } from "../middlewares/requirePermission.js";

const router = express.Router();
router.get("/lookup", publicRoute, lookup);

export default router;
