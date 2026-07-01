/**
 * Status — the consolidated triage state that replaces the three legacy booleans
 * (closed / checkedSquad / reviewSquad). A row has exactly one status.
 *
 * Order is meaningful: it drives the dropdown and roughly follows the triage
 * lifecycle. The frontend keeps an identical copy in
 * pages/JiraBacklog/constants.ts (STATUS_OPTIONS) — keep the two in sync.
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
];

export const DEFAULT_STATUS = "Backlog";

/**
 * Terminal statuses. Setting a bug to "Fixed/Closed" archives it: the service rewrites the
 * status to "Archived" and stamps a 30-day expiry, after which the row is auto-deleted (see
 * jiraBacklogService). They're kept as distinct constants so that logic reads clearly.
 */
export const FIXED_CLOSED_STATUS = "Fixed/Closed";
export const ARCHIVED_STATUS = "Archived";

/**
 * Decision tree for the one-time migration off the three legacy booleans
 * (and for seeding from the original boolean-based seed export). Priority order,
 * first match wins:
 *
 *   1. closed       -> "Fixed/Closed"      a closed ticket is done, regardless of the rest
 *   2. reviewSquad  -> "Review with Squad" open + flagged for squad review
 *   3. checkedSquad -> "In a Sprint"       triaged with the squad and being worked
 *   4. (none)       -> "Backlog"           default
 *
 * "Delayed" has no signal in the legacy data, so it is only ever set by hand.
 */
export function deriveStatus({ closed, checkedSquad, reviewSquad } = {}) {
  if (closed) return "Fixed/Closed";
  if (reviewSquad) return "Review with Squad";
  if (checkedSquad) return "In a Sprint";
  return DEFAULT_STATUS;
}
