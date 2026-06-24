import { useState } from "react";
import { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ColumnDesc, JiraIssue, JiraTableMeta } from "./types";

/**
 * Header for the backlog table: the label doubles as a sort toggle (asc → desc → none) and,
 * for the meaningful columns, a filter popover (a text box for free-text columns, a value
 * list for the dropdown columns). The status column's options come from meta (user-managed),
 * everything else from the column descriptor. Sort-only columns (Jira link, urgency, tickets)
 * show just the sort control.
 */

function selectOptions(desc: ColumnDesc, meta: JiraTableMeta): readonly string[] {
  if (desc.field === "status") return meta.statusOptions;
  return desc.options ?? [];
}

export function ColumnHeader({
  column,
  desc,
  meta,
}: {
  column: Column<JiraIssue, unknown>;
  desc: ColumnDesc;
  meta: JiraTableMeta;
}) {
  const [open, setOpen] = useState(false);
  const sorted = column.getIsSorted(); // false | "asc" | "desc"
  const kind: "none" | "text" | "select" =
    desc.type === "select" ? "select" : desc.type === "text" ? "text" : "none";
  const filterValue = (column.getFilterValue() as string) ?? "";
  const hasFilter = filterValue !== "";

  // Three-state sort cycle: 1st click A→Z (asc), 2nd Z→A (desc), 3rd clears it back to the
  // original (unsorted) order.
  const cycleSort = () => {
    if (sorted === false) column.toggleSorting(false);
    else if (sorted === "asc") column.toggleSorting(true);
    else column.clearSorting();
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={cycleSort}
        className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
        title="Sort A→Z, then Z→A, then clear"
      >
        {desc.header}
        {sorted === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : sorted === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>

      {kind !== "none" && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "rounded p-0.5 hover:bg-accent hover:text-foreground",
                hasFilter ? "text-primary" : "text-muted-foreground opacity-60",
              )}
              title="Filter"
              aria-label={`Filter ${desc.header}`}
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            {kind === "text" ? (
              <Input
                autoFocus
                placeholder={`Filter ${desc.header.toLowerCase()}…`}
                value={filterValue}
                onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                className="h-8"
              />
            ) : (
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    column.setFilterValue(undefined);
                    setOpen(false);
                  }}
                  className={cn(
                    "block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent",
                    !hasFilter && "font-medium",
                  )}
                >
                  All
                </button>
                {selectOptions(desc, meta).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => {
                      column.setFilterValue(o);
                      setOpen(false);
                    }}
                    className={cn(
                      "block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent",
                      filterValue === o && "bg-accent font-medium",
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-7 w-full justify-start text-muted-foreground"
                onClick={() => column.setFilterValue(undefined)}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
