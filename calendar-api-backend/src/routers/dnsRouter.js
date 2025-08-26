import express from "express";
import { lookup } from "../controllers/dnsController.js";

const router = express.Router();
router.get("/lookup", lookup);

export default router;
