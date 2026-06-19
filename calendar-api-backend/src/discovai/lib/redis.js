import { Redis } from "@upstash/redis";
import { discovaiConfig } from "./config.js";

// Cache keys — namespaced by dataset so two datasets can never serve each other's
// cached results (a query shared between "duda" and a white-label set must not leak).
export const embeddingVectorCacheKey = (dataset, query) =>
  `cache:search:${dataset}:${query}`;
export const llmResultCacheKey = (dataset, prompt) => `cache:llm:${dataset}:${prompt}`;

// Caching is OPTIONAL: if Upstash env vars are absent we return a no-op client
// with the same { get, setex } interface, so the pipeline still works (uncached).
// DiscovAI's global @upstash/ratelimit is intentionally dropped for this test route.
let redisInstance = null;

const noopRedis = {
  get: async () => null,
  setex: async () => {},
};

export function getRedis() {
  if (redisInstance) return redisInstance;

  if (discovaiConfig.upstashUrl && discovaiConfig.upstashToken) {
    redisInstance = new Redis({
      url: discovaiConfig.upstashUrl,
      token: discovaiConfig.upstashToken,
    });
  } else {
    redisInstance = noopRedis;
  }
  return redisInstance;
}
