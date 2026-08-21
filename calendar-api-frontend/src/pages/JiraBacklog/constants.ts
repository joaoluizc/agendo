import { ColumnDesc, JiraIssue } from "./types";

/**
 * Triage statuses — identical to the backend (lib/status.js STATUS_OPTIONS). Order is
 * meaningful (drives the dropdown + roughly the lifecycle). Replaces the old
 * closed / checkedSquad / reviewSquad booleans.
 */
export const STATUS_OPTIONS = [
  "Backlog",
  "Review with Squad",
  "Delayed",
  "In a Sprint",
  "Possible No-ETA",
  "No-ETA",
  "Fixed/Closed",
  "Archived",
] as const;

/**
 * Statuses shown by default in the "To Review" view, in the order they should appear within
 * a squad group: "In a Sprint" first, then "Review with Squad". The view's status picker lets
 * the user widen it to pull in bugs from other statuses when relevant.
 */
export const DEFAULT_TO_REVIEW_STATUSES: string[] = ["In a Sprint", "Review with Squad"];

/**
 * The two "No-ETA" workflow statuses. Setting a bug to POSSIBLE_NO_ETA_STATUS prompts the
 * 30-day re-evaluation task; NO_ETA_STATUS is the terminal decision made from that task.
 */
export const POSSIBLE_NO_ETA_STATUS = "Possible No-ETA";
export const NO_ETA_STATUS = "No-ETA";

/**
 * Canonical dropdown options — identical to the backend
 * (calendar-api-backend/src/jiraBacklog/lib/dropdowns.js). Order matters. The
 * /jira-backlog/config endpoint returns these too; the static copy avoids a first-paint
 * flash and the page reconciles with the server copy on load.
 */
export const DROPDOWN_OPTIONS: Record<string, readonly string[]> = {
  status: STATUS_OPTIONS,
  priority: ["Major", "Minor", "Critical"],
  squad: [
    "AEO",
    "AI Infra",
    "Architects",
    "Engineering",
    "F&B (Editor)",
    "Pricing (Monetization)",
    "Snipcart (Store Ops)",
    "Store front (eCommerce)",
    "Vibe",
  ],
  // Mirrors Jira's "Complexity" field (customfield_14340) — keep in step with the backend's
  // lib/dropdowns.js, which validates every write. "Uncertain" is a deliberate Jira choice;
  // "Needs research" is the absence of one (nobody set the field in Jira).
  complexity: ["Needs research", "Trivial", "Low", "Moderate", "High", "Very High", "Uncertain"],
  scope: [
    "Confirmed all sites / master",
    "One site, one client",
    "Several clients, not confirmed widespread",
    "Several sites, one client",
  ],
  planTier: ["Agency", "Managed enterprise", "Enterprise/mid-market", "VIP managed enterprise"],
  workaround: [
    "No workaround found",
    "Workaround found — client accepted it",
    "Workaround found — client rejected it",
  ],
  frustration: ["Low — minor inconvenience", "Medium — slowing workflow", "High — blocking or escalating"],
  scopeConf: ["Scope is as reported", "Likely wider than reported"],
  workaroundQ: ["No workaround / N/A", "Workaround is reasonable", "Workaround is poor / complex"],
  bugType: ["Bug", "Regression"],
};

/**
 * Every field descriptor, keyed by id. The main table, the To-Review view and the detail
 * panel all compose their layouts from this one map, so a field's editor/colour behaviour
 * is defined once.
 */
const F: Record<string, ColumnDesc> = {
  jiraUrl: { id: "jiraUrl", field: "url", header: "Jira", type: "jiraUrl", minWidth: 92 },
  status: { id: "status", field: "status", header: "Status", type: "select", options: DROPDOWN_OPTIONS.status, badge: "status", minWidth: 150 },
  desc: { id: "desc", field: "desc", header: "Title", type: "text", minWidth: 170, wrap: true, grow: true },
  client: { id: "client", field: "client", header: "Client", type: "text", badge: "client", minWidth: 90, wrap: true },
  priority: { id: "priority", field: "priority", header: "Priority", type: "select", options: DROPDOWN_OPTIONS.priority, badge: "priority", minWidth: 100 },
  squad: { id: "squad", field: "squad", header: "Squad", type: "select", options: DROPDOWN_OPTIONS.squad, minWidth: 100, wrap: true },
  sprint: { id: "sprint", field: "sprint", header: "Sprint", type: "text", minWidth: 90, wrap: true },
  // Jira-owned (its Complexity field) — read-only here; edits happen in Jira and arrive on sync.
  complexity: { id: "complexity", field: "complexity", header: "Complexity", type: "select", options: DROPDOWN_OPTIONS.complexity, minWidth: 122, wrap: true, readOnly: true },
  urgency: { id: "urgency", field: "urgency", header: "Urgency", type: "urgency", minWidth: 84 },
  zd: { id: "zd", field: "zdCount", header: "Tickets", type: "zd", minWidth: 88 },
  mrr: { id: "mrr", field: "mrr", header: "MRR", type: "mrr", minWidth: 100 },
  // Detail-panel-only fields (kept off the main table to avoid horizontal scroll).
  bugType: { id: "bugType", field: "bugType", header: "Bug type", type: "select", options: DROPDOWN_OPTIONS.bugType, minWidth: 120 },
  comment: { id: "comment", field: "comment", header: "Comment", type: "text", minWidth: 240, wrap: true },
  scope: { id: "scope", field: "scope", header: "Scope", type: "select", options: DROPDOWN_OPTIONS.scope, minWidth: 200 },
  planTier: { id: "planTier", field: "planTier", header: "Plan tier", type: "select", options: DROPDOWN_OPTIONS.planTier, minWidth: 170 },
  workaround: { id: "workaround", field: "workaround", header: "Workaround", type: "select", options: DROPDOWN_OPTIONS.workaround, minWidth: 220 },
  frustration: { id: "frustration", field: "frustration", header: "Frustration", type: "select", options: DROPDOWN_OPTIONS.frustration, minWidth: 190 },
  scopeConf: { id: "scopeConf", field: "scopeConf", header: "Scope confidence", type: "select", options: DROPDOWN_OPTIONS.scopeConf, minWidth: 170 },
  workaroundQ: { id: "workaroundQ", field: "workaroundQ", header: "Workaround quality", type: "select", options: DROPDOWN_OPTIONS.workaroundQ, minWidth: 180 },
};

/**
 * Main table columns, in order. Deliberately lean (no urgency-input fields, no comment) so
 * the table fits without a horizontal scrollbar; the rest lives in the detail panel.
 */
export const COLUMN_DEFS: ColumnDesc[] = [
  F.jiraUrl,
  F.status,
  F.desc,
  F.client,
  F.priority,
  F.squad,
  F.sprint,
  F.complexity,
  F.urgency,
  F.zd,
  F.mrr,
];

/** Columns shown (in this order) in the To-Review view — squad is the group, so it's dropped. */
export const TO_REVIEW_COLUMNS: ColumnDesc[] = [
  F.jiraUrl,
  F.status,
  F.desc,
  F.priority,
  F.sprint,
  F.complexity,
  F.urgency,
  F.zd,
  F.mrr,
];

/** The status field descriptor — rendered prominently at the top of the detail panel. */
export const STATUS_FIELD: ColumnDesc = F.status;

/**
 * Detail-panel layout: grouped, every field editable. Details first (the "what"), then
 * Triage, then the urgency inputs (the panel appends the urgency-override input at the end
 * of that group — see detail-panel.tsx URGENCY_GROUP_TITLE).
 */
export const DETAIL_GROUPS: { title: string; fields: ColumnDesc[] }[] = [
  { title: "Details", fields: [F.desc, F.comment] },
  { title: "Triage", fields: [F.priority, F.squad, F.client, F.sprint, F.complexity, F.bugType] },
  { title: "Urgency inputs", fields: [F.scope, F.planTier, F.workaround, F.frustration, F.scopeConf, F.workaroundQ] },
];

/**
 * Status ordering within a To-Review squad group: "In a Sprint" first, then
 * "Review with Squad". Any other status the user has widened the filter to include sorts
 * after these, keeping its relative input order.
 */
const TO_REVIEW_STATUS_ORDER: string[] = ["In a Sprint", "Review with Squad"];

function statusRank(status: string): number {
  const i = TO_REVIEW_STATUS_ORDER.indexOf(status);
  return i === -1 ? TO_REVIEW_STATUS_ORDER.length : i;
}

/**
 * Sort within a To-Review squad group: by status ("In a Sprint" before "Review with Squad"),
 * then Regressions first, then urgency descending, with null/empty urgency at the bottom.
 * Stable for equal keys.
 */
export function compareToReview(a: JiraIssue, b: JiraIssue): number {
  const statusDiff = statusRank(a.status) - statusRank(b.status);
  if (statusDiff !== 0) return statusDiff;

  const aReg = a.bugType === "Regression";
  const bReg = b.bugType === "Regression";
  if (aReg !== bReg) return aReg ? -1 : 1;

  const aNull = a.urgency == null;
  const bNull = b.urgency == null;
  if (aNull !== bNull) return aNull ? 1 : -1;
  if (aNull && bNull) return 0;
  return (b.urgency as number) - (a.urgency as number);
}

/** Group review-flagged issues by squad, squads sorted alphabetically. */
export function groupBySquadForReview(issues: JiraIssue[]): { squad: string; issues: JiraIssue[] }[] {
  const groups = new Map<string, JiraIssue[]>();
  for (const it of issues) {
    const squad = it.squad || "(no squad)";
    if (!groups.has(squad)) groups.set(squad, []);
    groups.get(squad)!.push(it);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([squad, list]) => ({ squad, issues: [...list].sort(compareToReview) }));
}

// Matches a Jira issue key anywhere in a string (a typed key or one inside a pasted
// browse URL, e.g. https://dudamobile.atlassian.net/browse/SUP-6983).
const ISSUE_KEY_RE = /[A-Za-z]+-\d+/;

/**
 * Normalise a search query into a lowercase term. If the query contains a Jira key —
 * the common case where someone pastes a Jira link — reduce it to just that key so the
 * URL's domain/path doesn't get in the way of matching the row by its `issueKey`.
 */
export function normalizeQuery(raw: string): string {
  const key = raw.match(ISSUE_KEY_RE);
  return (key ? key[0] : raw).trim().toLowerCase();
}

/**
 * Project prefix assumed when someone types only the number half of a key ("7174"). The
 * backlog is overwhelmingly SUP, but not exclusively — so the resolved key is always shown
 * back to the user for confirmation before a row is created, never applied silently.
 */
export const DEFAULT_ISSUE_PREFIX = "SUP";

/** What a search box / prompt entry turned out to be, once parsed. */
export type IssueRefKind = "url" | "key" | "number" | "none";

export interface IssueRef {
  kind: IssueRefKind;
  /** Canonical upper-case key ("SUP-7174"), or "" when kind is "none". */
  key: string;
  /** True when the prefix was assumed rather than typed — worth saying out loud in the UI. */
  prefixAssumed: boolean;
}

const FULL_KEY_RE = /^[A-Za-z]+-\d+$/;
const DIGITS_RE = /^\d+$/;

/**
 * Classify what the user typed so the UI can name it back to them precisely. The three
 * shapes people actually paste into this backlog:
 *
 *   - a browse URL   https://dudamobile.atlassian.net/browse/SUP-7174  -> kind "url"
 *   - a bare key     SUP-7174                                          -> kind "key"
 *   - just digits    7174                                              -> kind "number" (prefix assumed)
 *
 * Anything else is "none": it may still be a useful free-text search, but there's no issue
 * to offer to create from it. Deliberately separate from normalizeQuery, which only needs a
 * lowercase substring to filter on — this needs the canonical key to *create* a row.
 */
export function classifyIssueRef(raw: string): IssueRef {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { kind: "none", key: "", prefixAssumed: false };

  // A URL is only a URL if it also carries a key — a bare domain gives us nothing to create.
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes("/browse/")) {
    const m = trimmed.match(ISSUE_KEY_RE);
    return m
      ? { kind: "url", key: m[0].toUpperCase(), prefixAssumed: false }
      : { kind: "none", key: "", prefixAssumed: false };
  }

  if (FULL_KEY_RE.test(trimmed)) {
    return { kind: "key", key: trimmed.toUpperCase(), prefixAssumed: false };
  }

  if (DIGITS_RE.test(trimmed)) {
    return { kind: "number", key: `${DEFAULT_ISSUE_PREFIX}-${trimmed}`, prefixAssumed: true };
  }

  return { kind: "none", key: "", prefixAssumed: false };
}

/** Build the Jira browse URL for a key. Returns "" without a configured base URL. */
export function issueBrowseUrl(baseUrl: string, key: string): string {
  if (!baseUrl || !key) return "";
  return `${baseUrl.replace(/\/+$/, "")}/browse/${key}`;
}

/**
 * The order the server returns rows in for the All / Open views: most urgent first, null
 * urgency last (incomplete rows / regressions), `order` as the stable tiebreaker. Mirrors
 * `JiraIssue.find().sort({ urgency: -1, order: 1 })` in the backend service — kept in step
 * with it. Used to re-place a freshly created row once its Jira data lands, so it settles
 * where a reload would put it instead of clinging to the top of the list.
 */
export function compareByUrgencyThenOrder(a: JiraIssue, b: JiraIssue): number {
  const aNull = a.urgency == null;
  const bNull = b.urgency == null;
  if (aNull !== bNull) return aNull ? 1 : -1;
  if (!aNull && !bNull && a.urgency !== b.urgency) {
    return (b.urgency as number) - (a.urgency as number);
  }
  return (a.order ?? 0) - (b.order ?? 0);
}

/**
 * Case-insensitive match of a normalised term (see normalizeQuery) against an issue's
 * searchable text. `term` is assumed already normalised + lowercased; "" matches all.
 */
export function matchesQuery(issue: JiraIssue, term: string): boolean {
  if (!term) return true;
  const fields = [
    issue.issueKey,
    issue.desc,
    issue.client,
    issue.comment,
    issue.squad,
    issue.sprint,
    issue.priority,
    issue.status,
    issue.bugType,
  ];
  return fields.some((f) => (f || "").toLowerCase().includes(term));
}
