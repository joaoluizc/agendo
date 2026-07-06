import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { JiraIssue, JiraTableMeta } from "./types";
import { TO_REVIEW_COLUMNS, groupBySquadForReview } from "./constants";
import { FieldCell } from "./cells";

const isGrow = (id: string) => id === "desc";

/**
 * "To Review" view: the issues the page passes in (those whose status is selected in the
 * toolbar's status filter — "In a Sprint" and "Review with Squad" by default — intersected
 * with the search), grouped into collapsible squad sections (squads alphabetical, collapsed
 * by default). Within a group: by status ("In a Sprint" before "Review with Squad"), then
 * Regressions first, then urgency descending, nulls last (compareToReview). The bug's comment
 * is shown under its title so the "why" (context / urgency rationale) is visible at a glance.
 * Rows open the detail panel, same as the main table. No horizontal scroll — the reduced
 * column set fits the page width.
 */
export function ToReviewView({ issues, meta }: { issues: JiraIssue[]; meta: JiraTableMeta }) {
  const groups = groupBySquadForReview(issues);
  // Squad sections start collapsed; a squad is open only once explicitly expanded.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!issues.length) {
    return (
      <div className="rounded-md border py-12 text-center text-muted-foreground">
        No issues to review. Adjust the status filter or search in the toolbar to widen what
        shows here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ squad, issues: list }) => {
        const isOpen = expanded[squad];
        return (
          <div key={squad} className="overflow-hidden rounded-lg border">
            <button
              type="button"
              onClick={() => setExpanded((s) => ({ ...s, [squad]: !s[squad] }))}
              className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left font-medium hover:bg-muted/60"
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {squad}
              <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
            </button>

            {isOpen && (
              <table className="w-full border-collapse border-t text-sm">
                <thead>
                  <tr>
                    {TO_REVIEW_COLUMNS.map((desc) => {
                      const grow = isGrow(desc.id);
                      return (
                        <th
                          key={desc.id}
                          style={{ minWidth: desc.minWidth, width: grow ? "100%" : undefined }}
                          className={cn(
                            "border-b bg-background px-3 py-2 text-left text-xs font-medium text-muted-foreground",
                            grow ? "" : "whitespace-nowrap",
                          )}
                        >
                          {desc.header}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {list.map((issue) => (
                    <tr
                      key={issue._id}
                      className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                      onClick={() => meta.openDetail(issue._id)}
                    >
                      {TO_REVIEW_COLUMNS.map((desc) => {
                        const grow = isGrow(desc.id);
                        return (
                          <td
                            key={desc.id}
                            style={{ minWidth: desc.minWidth, width: grow ? "100%" : undefined }}
                            className={cn("px-3 py-2.5 align-top", grow ? "" : "whitespace-nowrap")}
                          >
                            <FieldCell issue={issue} desc={desc} meta={meta} />
                            {/* Show the comment under the title so reviewers see the "why" at a glance. */}
                            {desc.id === "desc" && issue.comment && (
                              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                {issue.comment}
                              </p>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
