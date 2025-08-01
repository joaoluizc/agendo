import express from "express";
import { searchQuery, webhookHandler } from "../controllers/adaController.js";
import crypto from "crypto";

const router = express.Router();

// Endpoint to receive a search query and proxy to ADA
router.post("/search", searchQuery);

// Webhook endpoint for ADA to send messages back
// Accept webhooks from tunnels and Ada (raw body support for signature validation)
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    // If body is a Buffer (from express.raw), parse it
    let rawBody = req.body;
    if (Buffer.isBuffer(rawBody)) {
      try {
        // Signature verification
        const signature =
          req.headers["ada-signature"] || req.headers["x-ada-signature"];
        const secret = process.env.ADA_WEBHOOK_SECRET;
        if (!signature || !secret) {
          return res.status(401).json({ error: "Missing signature or secret" });
        }
        const hmac = crypto.createHmac("sha256", secret);
        hmac.update(rawBody);
        const expected = hmac.digest("hex");
        if (signature !== expected) {
          return res.status(401).json({ error: "Invalid webhook signature" });
        }
        req.body = JSON.parse(rawBody.toString("utf8"));
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON in webhook body" });
      }
    }
    webhookHandler(req, res, next);
  }
);

export default router;
