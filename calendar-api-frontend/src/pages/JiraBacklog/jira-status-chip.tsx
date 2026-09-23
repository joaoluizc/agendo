import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimeFormat } from "@/utils/timeFormat";
import { JiraIssue } from "./types";
import { isJiraStatusStale, relativeToNow } from "./dates";

/**
 * Jira's own status as of the last sync, as a coloured chip. Shared by the To Review view
 * (under the Jira link) and the main table's "Jira status" column, so the colour buckets and
 * the staleness treatment can't drift apart between the two.
 *
 * Renders nothing when the row has no status — the callers decide what an empty cell looks
 * like (the To Review view omits it entirely; the table shows a dash).
 *
 * `compact` shrinks the type and padding for the main table's column, which is held to the
 * same narrow width as the Jira key beside it. Jira statuses are free text and can run long
 * ("Waiting for support"), so the label truncates and the full value lives in the tooltip —
 * the column never widens to fit its contents.
 */
export function JiraStatusChip({ issue, compact = false }: { issue: JiraIssue; compact?: boolean }) {
  const { clock } = useTimeFormat();
  if (!issue.jiraStatus) return null;

  return (
    <span
      title={jiraStatusTitle(issue, clock.hourCycle)}
      className={cn(
        "inline-flex max-w-full items-center rounded font-medium",
        compact ? "gap-0.5 px-1 py-0 text-[10px] leading-4" : "gap-1 px-2 py-0.5 text-xs",
        jiraStatusChipClasses(issue.jiraStatus),
      )}
    >
      <span className="truncate">{issue.jiraStatus}</span>
      {isJiraStatusStale(issue.jiraStatusFetchedAt) && (
        <AlertTriangle
          className={cn("shrink-0 text-amber-500", compact ? "h-2.5 w-2.5" : "h-3 w-3")}
        />
      )}
    </span>
  );
}

/**
 * Jira's status is free text set by each project's own workflow, so unlike agendo's fixed
 * STATUS_OPTIONS it can't be colour-mapped value-by-value. Bucket by keyword instead — covers
 * the common Jira workflow vocabulary and falls back to neutral for anything else.
 * Support/Open/To Do get amber: these are the "not yet looked at, needs eyes" states.
 */
export function jiraStatusChipClasses(value: string): string {
  const v = value.toLowerCase();
  if (v.includes("block")) return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (v.includes("done") || v.includes("closed") || v.includes("resolved"))
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (v.includes("progress") || v.includes("review") || v.includes("development"))
    return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
  if (v.includes("support") || v.includes("open") || v.includes("to do") || v.includes("todo"))
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-slate-500/15 text-slate-600 dark:text-slate-300";
}

/**
 * Tooltip for the chip: the value, how old it is, and the exact sync time — the chip itself is
 * too small to show any of that inline. Mirrors the `Fetched <date>` convention the Zendesk and
 * MRR cells use.
 */
function jiraStatusTitle(
  issue: JiraIssue,
  hourCycle: Intl.DateTimeFormatOptions["hourCycle"],
): string {
  const at = issue.jiraStatusFetchedAt;
  if (!at) return `Jira status: ${issue.jiraStatus} — sync time unknown`;
  return `Jira status: ${issue.jiraStatus} — synced ${relativeToNow(at)} (${new Date(at).toLocaleString(undefined, { hourCycle })})`;
}
