import {
  differenceInHours,
  format,
  formatDistanceToNow,
  isAfter,
  isBefore,
  startOfDay,
} from "date-fns";

/**
 * Task deadlines are date-only values stored as UTC midnight. We read the calendar day from
 * the UTC parts and rebuild a LOCAL midnight Date, so display and overdue checks reflect the
 * day the user picked regardless of timezone (avoids the classic off-by-one-day shift).
 */
function deadlineToLocalDate(deadline: string): Date {
  const d = new Date(deadline);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Deadline reached: its day is today or earlier. Drives the red due-date *text* — the date
 * turns red on the due date and stays red after.
 */
export function isDeadlineReached(deadline?: string | null): boolean {
  if (!deadline) return false;
  return !isAfter(deadlineToLocalDate(deadline), startOfDay(new Date()));
}

/**
 * Past due: its day is strictly before today. Drives the red *dot* — which appears only
 * once the due date has passed (not on the due date itself).
 */
export function isPastDue(deadline?: string | null): boolean {
  if (!deadline) return false;
  return isBefore(deadlineToLocalDate(deadline), startOfDay(new Date()));
}

/** "Jul 29, 2026" — for displaying a deadline. */
export function formatDeadline(deadline: string): string {
  return format(deadlineToLocalDate(deadline), "MMM d, yyyy");
}

/** "in 30 days" / "2 days ago" relative to now, for a deadline (date-only). */
export function deadlineRelative(deadline: string): string {
  return formatDistanceToNow(deadlineToLocalDate(deadline), { addSuffix: true });
}

/** "5 days ago" relative to now, for a full timestamp (e.g. noEtaReview.flaggedAt). */
export function relativeToNow(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

/**
 * Jira status is a snapshot synced by the backend's cron, not a live read — so it can lag the
 * real ticket. The sync runs at 07:00, 12:00 and 16:00 São Paulo time (CRON_EXPRESSION in the
 * backend's jiraBacklog/scheduler.js), so the binding gap is the overnight one — 16:00 to 07:00,
 * 15h — and 18h is that plus a 3h grace for a late start or a long run. Past it, at least one
 * tick was missed or the row fails to sync every time; both are worth flagging.
 * Keep in step with the backend cron if that schedule changes.
 */
export const JIRA_STATUS_STALE_HOURS = 18;

/**
 * Whether a synced-from-Jira status is old enough not to be trusted.
 *
 * A missing timestamp is deliberately NOT stale: every row predating jiraStatusFetchedAt starts
 * null, so treating unknown-age as stale would flag the whole board on deploy over a state that
 * clears itself at the next sync. Absence of evidence isn't evidence of staleness — the UI says
 * "last sync time unknown" instead, which is the claim we can actually support.
 */
export function isJiraStatusStale(iso?: string | null): boolean {
  if (!iso) return false;
  return differenceInHours(new Date(), new Date(iso)) >= JIRA_STATUS_STALE_HOURS;
}

/** ISO deadline → "yyyy-MM-dd" for a date-only value (UTC date part). */
export function toDateInputValue(deadline?: string | null): string {
  return deadline ? new Date(deadline).toISOString().slice(0, 10) : "";
}

/** "yyyy-MM-dd" → a LOCAL midnight Date (for the calendar's selected day); undefined if empty. */
export function inputValueToDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** A calendar-selected Date → "yyyy-MM-dd" (local date parts), the deadline draft format. */
export function dateToInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
