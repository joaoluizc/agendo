import { IssuePatch, JiraIssue } from "./types";

/**
 * Thin client for the /jira-backlog backend. Uses the same calling convention as the
 * rest of agendo: same-origin "/api" proxy + credentials:"include" so the Clerk session
 * cookie rides along. Mutating calls hit admin-gated endpoints; a non-admin gets 403.
 */
const BASE = "/api/jira-backlog";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    mode: "cors",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // some responses (rare) may have no body
  }

  if (!res.ok) {
    const p = payload as { message?: string; code?: string } | null;
    throw new ApiError(p?.message || `Request failed (${res.status})`, res.status, p?.code);
  }
  return payload as T;
}

export interface JiraConfig {
  jiraConfigured: boolean;
  dropdownOptions: Record<string, string[]>;
}

export const jiraApi = {
  getConfig: () => request<JiraConfig>("/config"),
  getIssues: () => request<JiraIssue[]>("/issues"),
  createIssue: (body: IssuePatch = {}) => request<JiraIssue>("/issues", { method: "POST", body }),
  updateIssue: (id: string, body: IssuePatch) =>
    request<JiraIssue>(`/issues/${id}`, { method: "PATCH", body }),
  deleteIssue: (id: string) => request<{ message: string }>(`/issues/${id}`, { method: "DELETE" }),
  // The "Refresh ZD counts" toolbar action fans out over this per-row endpoint (a few at
  // a time) rather than one long batch request — see refreshVisible in JiraBacklog.tsx.
  refreshZd: (id: string) => request<JiraIssue>(`/issues/${id}/refresh-zd`, { method: "POST" }),
};

/** Extract a Jira issue key (e.g. "SUP-6983") from a key or browse URL. */
export function extractIssueKey(keyOrUrl: string): string {
  if (!keyOrUrl) return "";
  const match = keyOrUrl.match(/[A-Z][A-Z0-9]+-\d+/i);
  return match ? match[0].toUpperCase() : "";
}
