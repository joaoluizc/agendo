import { ColumnDef, FilterFn } from "@tanstack/react-table";
import { COLUMN_DEFS } from "./constants";
import { FieldCell } from "./cells";
import { ColumnHeader } from "./column-header";
import { ColumnDesc, JiraIssue, JiraTableMeta } from "./types";

/**
 * TanStack column defs built from COLUMN_DEFS. Cells stay display-only (<FieldCell>);
 * editing happens in the detail panel that opens on row click. Headers are sortable and,
 * for the meaningful columns, filterable (see ColumnHeader).
 */

// Numeric columns hold number | null; the accessor maps null → undefined so
// sortUndefined:"last" keeps blanks at the bottom regardless of sort direction.
const NUMERIC_FIELDS = new Set<string>(["urgency", "zdCount", "mrr"]);

// Dropdown columns filter by exact value; free-text columns by case-insensitive contains.
const equalsFilter: FilterFn<JiraIssue> = (row, columnId, value) =>
  !value || String(row.getValue(columnId) ?? "") === value;

const containsFilter: FilterFn<JiraIssue> = (row, columnId, value) =>
  !value ||
  String(row.getValue(columnId) ?? "")
    .toLowerCase()
    .includes(String(value).toLowerCase());

export function buildColumns(defs: readonly ColumnDesc[] = COLUMN_DEFS): ColumnDef<JiraIssue>[] {
  return defs.map((desc) => {
    const numeric = NUMERIC_FIELDS.has(desc.field as string);
    // Status is filtered from the toolbar's status multi-select (every view), not per-column.
    const filterable = (desc.type === "select" || desc.type === "text") && desc.field !== "status";
    return {
      id: desc.id,
      accessorFn: numeric
        ? (row) => (row[desc.field] as number | null) ?? undefined
        : (row) => row[desc.field] as string,
      header: ({ column, table }) => (
        <ColumnHeader column={column} desc={desc} meta={table.options.meta as JiraTableMeta} />
      ),
      minSize: desc.minWidth,
      enableSorting: true,
      sortingFn: numeric ? "basic" : "alphanumeric",
      sortUndefined: "last",
      enableColumnFilter: filterable,
      filterFn: desc.type === "select" ? equalsFilter : containsFilter,
      cell: ({ row, table }) => (
        <FieldCell issue={row.original} desc={desc} meta={table.options.meta as JiraTableMeta} />
      ),
    };
  });
}
