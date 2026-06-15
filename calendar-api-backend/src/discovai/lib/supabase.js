import { createClient } from "@supabase/supabase-js";
import { discovaiConfig } from "./config.js";

// Ported from DiscovAI-search/server/src/db/supabase.ts, made lazy so importing
// this module never throws at boot when env vars are absent.
let client = null;

export function getSupabase() {
  if (!client) {
    client = createClient(
      discovaiConfig.supabaseUrl,
      discovaiConfig.supabaseAnonKey,
    );
  }
  return client;
}
