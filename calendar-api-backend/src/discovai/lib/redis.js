import { Redis } from "@upstash/redis";
import { discovaiConfig } from "./config.js";

// Cache keys — ported verbatim from DiscovAI-search/server/src/db/redis.ts.
export const embeddingVectorCacheKey = (query) => `cache:search:${query}`;
export const llmResultCacheKey = (prompt) => `cache:llm:${prompt}`;

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
