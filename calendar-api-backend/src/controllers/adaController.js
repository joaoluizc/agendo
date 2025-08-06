import {
  startConversation,
  sendMessage,
  waitForReply,
  handleWebhook,
} from "../services/adaService.js";
import AdaAiSearch from "../models/AdaAiSearchModel.js";
import redisClient from "../database/redisClient.js";

/**
 * Handles search query endpoint, proxies to ADA and returns reply
 */
export const searchQuery = async (req, res, next) => {
  console.log("[AdaController] searchQuery invoked with body:", req.body);
  const requestedAt = new Date();
  let dbRecord;
  try {
    const { query } = req.body;
    console.log(`[AdaController] Query received: ${query}`);
    if (!query) {
      return res.status(400).json({ error: "Missing query in request body" });
    }
    // Check cache first
    const cacheKey = `ada-search:${query}`;
    let cached = null;
    try {
      cached = await redisClient.get(cacheKey);
    } catch (err) {
      console.error("[AdaController] Redis cache error:", err);
    }
    if (cached) {
      const reply = JSON.parse(cached);
      const returnedAt = new Date();
      const latency = returnedAt.getTime() - requestedAt.getTime();
      // Save DB record for cache hit
      dbRecord = await AdaAiSearch.create({
        query,
        result: reply,
        requestedAt,
        returnedAt,
        latency,
        success: true,
        cacheHit: true,
      });
      console.log("[AdaController] Cache hit, returning cached reply.");
      return res.json({ reply });
    }
    // Create DB record for the request
    dbRecord = await AdaAiSearch.create({
      query,
      requestedAt,
      success: false,
      cacheHit: false,
    });
    const convId = await startConversation();
    console.log(`[AdaController] Conversation started: ${convId}`);
    // Register reply listener before sending message to avoid race condition
    const replyPromise = waitForReply(convId);
    console.log("[AdaController] Sending message to Ada");
    await sendMessage(convId, query);
    const reply = await replyPromise;
    const returnedAt = new Date();
    const latency = returnedAt.getTime() - requestedAt.getTime();
    console.log(`[AdaController] Reply received: ${reply}`);
    // Update DB record with result
    await AdaAiSearch.findByIdAndUpdate(dbRecord._id, {
      result: reply,
      returnedAt,
      latency,
      success: true,
    });
    // Save result to cache
    try {
      const cacheKey = `ada-search:${query}`;
      await redisClient.set(cacheKey, JSON.stringify(reply), { EX: 60 * 60 }); // 1 hour expiry
      console.log(`[AdaController] Cached result for query: ${query}`);
    } catch (err) {
      console.error("[AdaController] Redis cache set error:", err);
    }
    res.json({ reply });
  } catch (err) {
    console.error("[AdaController] searchQuery error:", err);
    if (dbRecord && dbRecord._id) {
      await AdaAiSearch.findByIdAndUpdate(dbRecord._id, {
        error: err.message,
        returnedAt: new Date(),
        success: false,
      });
    }
    next(err);
  }
};

/**
 * Handles ADA webhook for incoming messages
 */
export const webhookHandler = (req, res) => {
  try {
    // Acknowledge and ignore conversation created/ended events
    const type = req.body?.type;
    if (
      type === "v1.conversation.ended" ||
      type === "v1.conversation.created"
    ) {
      console.log(`[AdaController] Ignored webhook of type: ${type}`);
      return res.status(200).json({ status: "ignored" });
    }
    handleWebhook(req.body);
    console.log("[AdaController] webhook processed successfully");
    res.status(200).json({ status: "received" });
  } catch (err) {
    console.error("[AdaController] webhookHandler error:", err);
    res.status(500).json({ error: "Webhook handling failed" });
  }
};
