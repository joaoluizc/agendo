import { BugStatus, IssuePatch, JiraIssue, Task, TaskStatus, TaskWithIssue } from "./types";

/**
 * Thin client for the /jira-backlog backend. Uses the same calling convention as the
 * rest of agendo: same-origin "/api" proxy + credentials:"include" so the Clerk session
 * cookie rides along. Mutating calls hit admin-gated endpoints; a non-admin gets 403.
 */
const BASE = "/api/jira-backlog";

export class ApiError extends Error {
  status: number;
  code?: string;
  /** For DUPLICATE_ISSUE: the _id of the existing row, so the UI can offer to open it. */
  existingId?: string;
  constructor(message: string, status: number, code?: string, existingId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.existingId = existingId;
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
    const p = payload as { message?: string; code?: string; existingId?: string } | null;
    throw new ApiError(p?.message || `Request failed (${res.status})`, res.status, p?.code, p?.existingId);
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
  // Pull summary/priority/squad/sprint/ZD-count from the linked Jira ticket onto the row.
  autofill: (id: string) => request<JiraIssue>(`/issues/${id}/autofill`, { method: "POST" }),
};

/** User-managed issue statuses (the backlog's status dropdown — add / delete). */
export const bugStatusApi = {
  list: () => request<BugStatus[]>("/bug-statuses"),
  create: (name: string) => request<BugStatus>("/bug-statuses", { method: "POST", body: { name } }),
  remove: (id: string) => request<{ message: string }>(`/bug-statuses/${id}`, { method: "DELETE" }),
};

/**
 * Tasks + customizable statuses layer (same /jira-backlog backend, same calling
 * convention). Reads are open to any signed-in user; mutations hit admin-gated endpoints.
 */
export const taskApi = {
  // statuses (kanban columns)
  getStatuses: () => request<TaskStatus[]>("/task-statuses"),
  createStatus: (name: string) =>
    request<TaskStatus>("/task-statuses", { method: "POST", body: { name } }),
  updateStatus: (id: string, body: { name?: string; order?: number }) =>
    request<TaskStatus>(`/task-statuses/${id}`, { method: "PATCH", body }),
  deleteStatus: (id: string) =>
    request<{ message: string }>(`/task-statuses/${id}`, { method: "DELETE" }),

  // tasks
  getAllTasks: () => request<TaskWithIssue[]>("/tasks"),
  getTasksForIssue: (issueId: string) => request<Task[]>(`/issues/${issueId}/tasks`),
  createTask: (issueId: string, body: { title: string; statusId?: string; deadline?: string | null }) =>
    request<Task>(`/issues/${issueId}/tasks`, { method: "POST", body }),
  // Standalone task (no parent issue) — created from the Tasks page.
  createStandaloneTask: (body: { title: string; statusId?: string; deadline?: string | null }) =>
    request<Task>("/tasks", { method: "POST", body }),
  updateTask: (
    id: string,
    body: { title?: string; statusId?: string; order?: number; deadline?: string | null },
  ) => request<Task>(`/tasks/${id}`, { method: "PATCH", body }),
  deleteTask: (id: string) => request<{ message: string }>(`/tasks/${id}`, { method: "DELETE" }),

  // "Possible No-ETA" review lifecycle.
  createNoEtaTask: (issueId: string) =>
    request<Task>(`/issues/${issueId}/no-eta-task`, { method: "POST" }),
  noEtaAction: (taskId: string, action: "reevaluate" | "resolve") =>
    request<Task>(`/tasks/${taskId}/no-eta`, { method: "POST", body: { action } }),
};

/** Extract a Jira issue key (e.g. "SUP-6983") from a key or browse URL. */
export function extractIssueKey(keyOrUrl: string): string {
  if (!keyOrUrl) return "";
  const match = keyOrUrl.match(/[A-Z][A-Z0-9]+-\d+/i);
  return match ? match[0].toUpperCase() : "";
}
