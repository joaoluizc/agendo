import process from "process";
import redisClient from "../database/redisClient.js";
import AdaChat from "../models/AdaChatModel.js";

const ADA_BASE_URL = process.env.ADA_BASE_URL;
const ADA_API_KEY = process.env.ADA_API_KEY;
const ADA_CHANNEL_ID = process.env.ADA_CHANNEL_ID;
const ADA_USER_ID = "681aaf5abfd7e129b6c27d99";

/**
 * Fetches escalated Ada conversations for a given date range and stores them in the database.
 * Handles pagination and only stores conversations where is_escalated = true.
 * @param {Date} fromDate - Start date (inclusive, ISO string)
 * @param {Date} toDate - End date (exclusive, ISO string)
 */

export async function fetchAndStoreEscalatedAdaChats({ fromDate, toDate }) {
  const adaBaseUrl = process.env.ADA_PROD_BASE_URL;
  const adaToken = process.env.ADA_PROD_API_KEY;
  console.log("[AdaService] fetchAndStoreEscalatedAdaChats called", {
    fromDate,
    toDate,
  });
  if (!adaBaseUrl || !adaToken) {
    console.error("[AdaService] Missing ADA_PROD_BASE_URL or ADA_PROD_API_KEY");
    throw new Error(
      "ADA_BASE_URL or ADA_API_KEY not set in environment variables"
    );
  }

  // Helper to add days to a date
  function addDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  let totalStored = 0;
  let windowStart = new Date(fromDate);
  let windowEnd;
  let windowIndex = 1;
  while (windowStart < toDate) {
    windowEnd = addDays(windowStart, 7);
    if (windowEnd > toDate) windowEnd = new Date(toDate);
    console.log(
      `[AdaService] Fetching window #${windowIndex}: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`
    );
    let url = `${adaBaseUrl}/api/v2/export/conversations?created_since=${windowStart.toISOString()}&created_to=${windowEnd.toISOString()}&page_size=10000`;
    let page = 1;
    while (url) {
      console.log(
        `[AdaService] Fetching page ${page} for window #${windowIndex}: ${url}`
      );
      let res;
      try {
        res = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${adaToken}` },
        });
      } catch (err) {
        console.error(
          `[AdaService] Fetch error on page ${page} (window #${windowIndex}):`,
          err
        );
        throw err;
      }
      if (!res.ok) {
        console.error(
          `[AdaService] Non-OK response: ${res.status} ${res.statusText}`
        );
        throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
      }
      const responseData = await res.json();
      const { data, meta } = responseData;
      console.log(
        `[AdaService] Page ${page} fetched for window #${windowIndex}. Items: ${
          Array.isArray(data) ? data.length : 0
        }`
      );
      if (Array.isArray(data)) {
        const escalated = data.filter((conv) => conv.is_escalated === true);
        console.log(
          `[AdaService] Escalated conversations on page ${page} (window #${windowIndex}): ${escalated.length}`
        );
        if (escalated.length > 0) {
          // Upsert by _id to avoid duplicates
          try {
            await AdaChat.bulkWrite(
              escalated.map((conv) => ({
                updateOne: {
                  filter: { _id: conv._id },
                  update: {
                    $set: {
                      ...conv,
                      data: conv,
                      date_created: new Date(conv.date_created),
                      date_updated: conv.date_updated
                        ? new Date(conv.date_updated)
                        : null,
                    },
                  },
                  upsert: true,
                },
              }))
            );
            console.log(
              `[AdaService] Upserted ${escalated.length} escalated conversations to DB.`
            );
          } catch (dbErr) {
            console.error("[AdaService] DB bulkWrite error:", dbErr);
            throw dbErr;
          }
          totalStored += escalated.length;
        }
      }
      url = meta && meta.next_page_uri ? meta.next_page_uri : null;
      page++;
    }
    windowStart = addDays(windowStart, 7);
    windowIndex++;
  }
  console.log(
    `[AdaService] Total escalated conversations stored: ${totalStored}`
  );
  return totalStored;
}

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
