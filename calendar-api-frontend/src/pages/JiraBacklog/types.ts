export interface JiraIssue {
  _id: string;
  issueKey: string;
  url: string;
  /** Consolidated triage state — one of STATUS_OPTIONS (replaces the old booleans). */
  status: string;
  desc: string;
  client: string;
  priority: string;
  squad: string;
  sprint: string;
  complexity: string;
  urgency: number | null;
  urgencyOverridden: boolean;
  comment: string;
  bugType: string;
  scope: string;
  planTier: string;
  workaround: string;
  frustration: string;
  scopeConf: string;
  workaroundQ: string;
  zdCount: number | null;
  zdCountFetchedAt: string | null;
  order: number;
  createdAt?: string;
  updatedAt?: string;
  // Transient, client-only per-row Jira-fetch state (never sent to / stored by the API).
  // Kept on the issue (rather than in table meta) so meta stays referentially stable and
  // only the affected row re-renders during a refresh.
  _zdBusy?: boolean;
  _zdError?: boolean;
}

export type IssuePatch = Partial<Omit<JiraIssue, "_id">>;

/** A user-managed issue status (the backlog's status dropdown). */
export interface BugStatus {
  _id: string;
  name: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

/** A kanban column / task status (shared across all tickets, customizable). */
export interface TaskStatus {
  _id: string;
  name: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

/** A task linked to one ticket, as returned by GET /issues/:id/tasks. */
export interface Task {
  _id: string;
  issueId: string;
  title: string;
  statusId: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

/** A task flattened with its parent ticket's key + description — for the kanban cards. */
export interface TaskWithIssue {
  _id: string;
  title: string;
  statusId: string;
  order: number;
  issueId: string;
  issueKey: string;
  issueDesc: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ViewKey = "all" | "open" | "toReview";

export type ColumnType = "jiraUrl" | "text" | "select" | "urgency" | "zd";

/** Which coloured-pill palette a value uses (see badges.ts). */
export type BadgeKind = "status" | "priority" | "client";

export interface ColumnDesc {
  id: string;
  /** Issue field this column reads/writes (omitted-meaning for derived columns like jiraUrl). */
  field: keyof JiraIssue;
  header: string;
  type: ColumnType;
  /** Dropdown options for type === "select". */
  options?: readonly string[];
  /** px min width for the column. */
  minWidth: number;
  /** Allow text to wrap (Description / Comment). */
  wrap?: boolean;
  /** Render the value as a coloured pill using this palette. */
  badge?: BadgeKind;
  /** Let this column absorb leftover width (Description). */
  grow?: boolean;
}

/**
 * Passed to every cell + the detail panel. Carries permissions + the mutation callbacks
 * and the row-open handler. Kept referentially stable (all functions memoized, no volatile
 * maps) so row memoization works — per-row Jira-fetch state lives on the issue instead.
 */
export interface JiraTableMeta {
  canEdit: boolean;
  jiraConfigured: boolean;
  /** Persist a field change; resolves once the server has confirmed. */
  updateField: (id: string, patch: IssuePatch) => Promise<boolean>;
  deleteRow: (id: string) => void;
  refreshZd: (id: string) => void;
  /** Pull as much as possible from the linked Jira ticket onto the row (new-row autofill). */
  autofill: (id: string) => void;
  /** Open the Notion-style detail panel for a row. */
  openDetail: (id: string) => void;
  /** Current bug-status names (user-managed) — drives the status dropdown + filter. */
  statusOptions: readonly string[];
}
