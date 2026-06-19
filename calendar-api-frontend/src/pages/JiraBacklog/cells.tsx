import { memo, type ReactNode } from "react";
import { AlertCircle, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnDesc, JiraIssue, JiraTableMeta } from "./types";
import { extractIssueKey } from "./api";
import { urgencyCellClasses } from "./urgency";
import { badgeClasses } from "./badges";

interface CellProps {
  issue: JiraIssue;
  desc: ColumnDesc;
  meta: JiraTableMeta;
}

/**
 * Table cells are now display-only — a row is a clickable summary that opens the detail
 * panel, where everything is edited. This keeps the grid calm (no inline widgets) and is
 * what makes the panel-centric, Notion-like flow work. Coloured pills (status / priority /
 * client / urgency) carry the at-a-glance signal.
 */

function Pill({ classes, children }: { classes: string; children: ReactNode }) {
  return (
    <span className={cn("inline-block max-w-full truncate rounded px-2 py-0.5 text-xs font-medium", classes)}>
      {children}
    </span>
  );
}

const dash = <span className="text-muted-foreground">—</span>;

function TextDisplay({ issue, desc }: CellProps) {
  const value = (issue[desc.field] as string) || "";
  if (desc.badge && value) return <Pill classes={badgeClasses(desc.badge, value)}>{value}</Pill>;
  if (!value) return dash;
  return (
    <span className={cn("block", desc.wrap ? "whitespace-pre-wrap break-words" : "truncate")} title={value}>
      {value}
    </span>
  );
}

function SelectDisplay({ issue, desc }: CellProps) {
  const value = (issue[desc.field] as string) || "";
  if (!value) return dash;
  if (desc.badge) return <Pill classes={badgeClasses(desc.badge, value)}>{value}</Pill>;
  return (
    <span className="block truncate" title={value}>
      {value}
    </span>
  );
}

function UrgencyDisplay({ issue }: CellProps) {
  const value = issue.urgency;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold tabular-nums",
        urgencyCellClasses(value),
      )}
      title={issue.urgencyOverridden ? "Manually overridden" : "Auto-calculated"}
    >
      {value == null ? "—" : value}
      {issue.urgencyOverridden && <Pencil className="h-3 w-3 opacity-60" aria-label="overridden" />}
    </span>
  );
}

function ZdDisplay({ issue }: CellProps) {
  if (issue._zdBusy) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (issue._zdError)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" /> err
      </span>
    );
  const fetchedAt = issue.zdCountFetchedAt ? new Date(issue.zdCountFetchedAt).toLocaleString() : null;
  return (
    <span className="tabular-nums" title={fetchedAt ? `Fetched ${fetchedAt}` : undefined}>
      {issue.zdCount == null ? "—" : issue.zdCount}
    </span>
  );
}

function JiraUrlDisplay({ issue }: CellProps) {
  const key = issue.issueKey || extractIssueKey(issue.url);
  if (!issue.url) return dash;
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary hover:underline"
      title={issue.url}
      onClick={(e) => e.stopPropagation()}
    >
      {key || "link"}
    </a>
  );
}

/** Display dispatcher for a column descriptor. Memoized on row identity. */
export const FieldCell = memo(function FieldCell(props: CellProps) {
  switch (props.desc.type) {
    case "jiraUrl":
      return <JiraUrlDisplay {...props} />;
    case "select":
      return <SelectDisplay {...props} />;
    case "urgency":
      return <UrgencyDisplay {...props} />;
    case "zd":
      return <ZdDisplay {...props} />;
    default:
      return <TextDisplay {...props} />;
  }
});
