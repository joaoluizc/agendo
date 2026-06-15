import { streamText, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { CHAT_PROMPT, TRANSLATE } from "./prompts.js";
import { containsChinese } from "./utils.js";
import { discovaiConfig } from "./config.js";

// Ported from DiscovAI-search/server/src/lib/chat/llm.ts.
// The client is created lazily (per call) so it picks up the API key from the live
// process.env after dotenv has loaded. zod / generateObject from the original are
// dropped here because the chat route never uses them.
function getOpenAI() {
  return createOpenAI({
    apiKey: discovaiConfig.openaiApiKey,
    baseURL: discovaiConfig.openaiApiUrl, // undefined => SDK default
  });
}

function documentToStr(doc) {
  const { metadata, chunk_text } = doc;
  return `Title: ${metadata.title}\nURL: ${metadata.url}\nSummary: ${chunk_text}`;
}

function formatContext(searchResults) {
  return searchResults
    .map((result, index) => `Citation ${index + 1}. ${documentToStr(result)}`)
    .join("\n\n");
}

export const formatePrompt = (contexts, query) =>
  CHAT_PROMPT(formatContext(contexts), query);

export async function genLLMTextChunk({ query, contexts }) {
  const prompt = formatePrompt(contexts, query);
  const model = getOpenAI()("gpt-4o-mini");
  return streamText({ model, prompt });
}

export async function translate({ query }) {
  if (!containsChinese(query)) return query;
  const prompt = TRANSLATE(query);
  const model = getOpenAI()("gpt-4o-mini");
  const { text } = await generateText({ model, prompt });
  return text;
}
