import process from "process";
import redisClient from "../database/redisClient.js";

const ADA_BASE_URL = process.env.ADA_BASE_URL;
const ADA_API_KEY = process.env.ADA_API_KEY;
const ADA_CHANNEL_ID = process.env.ADA_CHANNEL_ID;
const ADA_USER_ID = "681aaf5abfd7e129b6c27d99";

export const startConversation = async () => {
  console.log("[AdaService] Starting conversation with Ada");
  const response = await fetch(`${ADA_BASE_URL}/api/v2/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADA_API_KEY}`,
    },
    body: JSON.stringify({
      channel_id: ADA_CHANNEL_ID,
      end_user_id: ADA_USER_ID,
    }),
  });
  if (!response.ok) {
    console.error(`Failed to start conversation: ${response.statusText}`);
    throw new Error(`Failed to start conversation: ${response.statusText}`);
  }
  const data = await response.json();
  console.log(
    `[AdaService] Conversation started: ${data.conversation_id || data.id}`
  );
  return data.conversation_id || data.id;
};

export const sendMessage = async (conversationId, message) => {
  console.log(
    `[AdaService] Sending message to convo ${conversationId}: ${message}`
  );
  // Check cache first
  const cacheKey = `ada-search:${message}`;
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log(`[AdaService] Cache hit for query: ${message}`);
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error("[AdaService] Redis cache error:", err);
  }
  const response = await fetch(
    `${ADA_BASE_URL}/api/v2/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADA_API_KEY}`,
      },
      body: JSON.stringify({
        author: {
          role: "end_user",
          id: ADA_USER_ID,
        },
        content: { type: "text", body: message },
      }),
    }
  );
  if (!response.ok) {
    console.error(`Failed to send message: ${response.statusText}`);
    throw new Error(`Failed to send message: ${response.statusText}`);
  }
  const data = await response.json();
  console.log("[AdaService] Message sent successfully");
  return data;
};
// Map to hold pending replies keyed by conversation_id
const pendingConversations = new Map();
// Map to track send times for latency measurement
const messageSendTimes = new Map();

/**
 * Waits for a reply for a given conversation ID. Returns a promise resolving with the message content.
 */
export const waitForReply = (conversationId) => {
  console.log(
    `[AdaService] Waiting for reply on conversation ${conversationId}`
  );
  // Record the time when waiting starts (message sent)
  const now = Date.now();
  messageSendTimes.set(conversationId, now);
  console.log(`[AdaService] Message sent at epoch: ${now}`);
  return new Promise((resolve) => {
    pendingConversations.set(conversationId, resolve);
  });
};

/**
 * Handles incoming webhook data from ADA, resolves pending promise if exists.
 */
export const handleWebhook = (webhookBody) => {
  const convId = webhookBody.data.conversation_id;
  const content = webhookBody.data.content.body;
  const authorRole = webhookBody.data.author?.role;
  const resolver = pendingConversations.get(convId);
  console.log(
    `[AdaService] Received webhook for convo ${convId} from author role: ${authorRole}`
  );
  const receivedTime = Date.now();
  console.log(`[AdaService] Webhook received at epoch: ${receivedTime}`);
  if (resolver && authorRole === "ai_agent") {
    const sentTime = messageSendTimes.get(convId);
    if (sentTime) {
      const latency = receivedTime - sentTime;
      console.log(
        `[AdaService] Latency for conversation ${convId}: ${latency} ms`
      );
      messageSendTimes.delete(convId);
    }
    resolver(content);
    pendingConversations.delete(convId);
    // end the conversation after resolving
    console.log(`[AdaService] Ending conversation ${convId}`);
    endConversation(convId).catch(console.error);
  } else if (authorRole !== "ai_agent") {
    console.log(
      `[AdaService] Ignored webhook message from author role: ${authorRole}`
    );
  }
};

/**
 * Ends the conversation with Ada.
 */
export const endConversation = async (conversationId) => {
  await fetch(`${ADA_BASE_URL}/api/v2/conversations/${conversationId}/end`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADA_API_KEY}` },
  });
  console.log(`[AdaService] Conversation ${conversationId} ended`);
};
