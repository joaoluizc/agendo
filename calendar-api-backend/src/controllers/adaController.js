import {
  startConversation,
  sendMessage,
  waitForReply,
  handleWebhook,
} from "../services/adaService.js";

/**
 * Handles search query endpoint, proxies to ADA and returns reply
 */
export const searchQuery = async (req, res, next) => {
  console.log("[AdaController] searchQuery invoked with body:", req.body);
  try {
    const { query } = req.body;
    console.log(`[AdaController] Query received: ${query}`);
    if (!query) {
      return res.status(400).json({ error: "Missing query in request body" });
    }
    const convId = await startConversation();
    console.log(`[AdaController] Conversation started: ${convId}`);
    // Register reply listener before sending message to avoid race condition
    const replyPromise = waitForReply(convId);
    console.log("[AdaController] Sending message to Ada");
    await sendMessage(convId, query);
    const reply = await replyPromise;
    console.log(`[AdaController] Reply received: ${reply}`);
    res.json({ reply });
  } catch (err) {
    console.error("[AdaController] searchQuery error:", err);
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
