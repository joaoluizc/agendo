import { useEffect, useState } from "react";
import { PositionSyncRule } from "@/types/positionTypes";

/** Position `_id` -> that position's verdict for one agent. */
export type SyncRuleMap = Map<string, PositionSyncRule>;

export type SyncRulesState = {
  rules: SyncRuleMap | null;
  status: "loading" | "ready" | "error";
};

/**
 * Requests in flight or already resolved, keyed by Clerk user id.
 *
 * Cached for the page session, and the promise rather than the value so two dialogs
 * opening at once share one request. Sync preferences are edited by each agent in their
 * own Settings, never by the admin looking at this dialog, so there is nothing an admin
 * can do here that would invalidate the cache — and reopening shift after shift down a
 * roster shouldn't refetch the same agent every time.
 */
const cache = new Map<string, Promise<SyncRuleMap>>();

const fetchSyncRules = (userId: string): Promise<SyncRuleMap> => {
  const cached = cache.get(userId);
  if (cached) return cached;

  const request = fetch(
    `/api/position/sync-rules?userId=${encodeURIComponent(userId)}`,
    {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load sync rules (${response.status})`);
      }
      const data: { rules?: PositionSyncRule[] } = await response.json();
      return new Map(
        (data.rules ?? []).map((rule) => [String(rule.positionId), rule])
      );
    })
    .catch((error) => {
      // Don't cache a failure — the next dialog open should get another go.
      cache.delete(userId);
      throw error;
    });

  cache.set(userId, request);
  return request;
};

/**
 * Whether shifts on each position reach one agent's Google Calendar.
 *
 * Admin-only on the API. A failure is not worth a toast: the dialog degrades to saying
 * the rule follows the agent's own settings, which is true either way — so this reports
 * `error` and lets the caller choose the wording.
 */
export const useAgentSyncRules = (
  userId: string,
  enabled = true
): SyncRulesState => {
  const [state, setState] = useState<SyncRulesState>(() => ({
    rules: null,
    status: enabled ? "loading" : "error",
  }));

  useEffect(() => {
    if (!enabled || !userId) {
      setState({ rules: null, status: "error" });
      return;
    }

    let active = true;
    setState({ rules: null, status: "loading" });

    fetchSyncRules(userId)
      .then((rules) => {
        if (active) setState({ rules, status: "ready" });
      })
      .catch((error) => {
        console.error("Failed to load agent sync rules", error);
        if (active) setState({ rules: null, status: "error" });
      });

    return () => {
      active = false;
    };
  }, [userId, enabled]);

  return state;
};
