import { format, formatDistanceToNow, isAfter, isBefore, startOfDay } from "date-fns";

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

/** ISO deadline → "yyyy-MM-dd" for an <input type="date"> value (UTC date part). */
export function toDateInputValue(deadline?: string | null): string {
  return deadline ? new Date(deadline).toISOString().slice(0, 10) : "";
}
