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

// SSE search endpoint. `/chat` defaults to the "duda" dataset (preserves the
// original deployed/documented endpoint); `/:dataset/chat` selects a dataset.
// Express matches the literal `/chat` before the `/:dataset/chat` param route.
discovaiRouter.post("/chat", discovaiController.chat);
discovaiRouter.post("/:dataset/chat", discovaiController.chat);

export default discovaiRouter;
