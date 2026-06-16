import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { discovaiConfig } from "./config.js";

// Ported from DiscovAI-search/server/src/db/supabase.ts, made lazy so importing
// this module never throws at boot when env vars are absent.
let client = null;

export function getSupabase() {
  if (!client) {
    client = createClient(
      discovaiConfig.supabaseUrl,
      discovaiConfig.supabaseAnonKey,
      {
        // @supabase/supabase-js always constructs a RealtimeClient (even though we
        // only use REST/RPC). On Node < 22 — agendo's Docker image is node:21 —
        // realtime-js throws "without native WebSocket support" unless given a
        // transport. `ws` satisfies it and works on every Node version, so we
        // always pass it. (Works locally on Node 23 too; keeps envs uniform.)
        realtime: { transport: ws },
      },
    );
  }
  return client;
}
