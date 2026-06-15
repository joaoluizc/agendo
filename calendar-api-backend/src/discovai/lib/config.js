import process from "process";

/**
 * DiscovAI search configuration, read straight from process.env (agendo's pattern).
 *
 * Values are exposed via getters so every access reads the *live* process.env.
 * This matters because ES-module imports are hoisted: this module is loaded before
 * app.js runs dotenv.config(), so capturing values at import time would read
 * undefined. Getters sidestep import-order entirely.
 *
 * NOTE: unlike DiscovAI's original server/src/env.ts, this does NOT validate with zod
 * or call process.exit() — a missing var must never crash the whole agendo backend.
 * Instead, assertDiscovaiConfig() is called per-request inside the controller's
 * try/catch so a misconfiguration surfaces as a clean SSE error event.
 *
 * Env var names are kept identical to DiscovAI-search (including the NEXT_PUBLIC_
 * prefix) so the ported code is unchanged.
 */
export const discovaiConfig = {
  get supabaseUrl() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL;
  },
  get supabaseAnonKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  },
  get jinaApiKey() {
    return process.env.JINA_API_KEY;
  },
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY;
  },
  get openaiApiUrl() {
    return process.env.OPENAI_API_URL || undefined;
  },
  get upstashUrl() {
    return process.env.UPSTASH_REDIS_REST_URL;
  },
  get upstashToken() {
    return process.env.UPSTASH_REDIS_REST_TOKEN;
  },
};

/** Required vars for the search pipeline. Upstash (cache) is optional. */
const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: "supabaseUrl",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "supabaseAnonKey",
  JINA_API_KEY: "jinaApiKey",
  OPENAI_API_KEY: "openaiApiKey",
};

/** Throws a descriptive error if any required DiscovAI env var is missing. */
export function assertDiscovaiConfig() {
  const missing = Object.entries(REQUIRED)
    .filter(([, key]) => !discovaiConfig[key])
    .map(([envName]) => envName);

  if (missing.length) {
    throw new Error(
      `DiscovAI search is not configured. Missing env var(s): ${missing.join(", ")}. ` +
        `Add them to calendar-api-backend/.env (see src/discovai/README.md).`,
    );
  }
}
