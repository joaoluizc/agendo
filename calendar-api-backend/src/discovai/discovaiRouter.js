import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import discovaiController from "./discovaiController.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const discovaiRouter = express.Router();

// Self-contained test UI, served same-origin with the API below (no CORS/Clerk).
discovaiRouter.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// SSE search endpoint — ported from DiscovAI's POST /api/chat.
discovaiRouter.post("/chat", discovaiController.chat);

export default discovaiRouter;
