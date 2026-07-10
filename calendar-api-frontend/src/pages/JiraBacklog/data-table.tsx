import { memo, useEffect, useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  Row,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JiraIssue, JiraTableMeta } from "./types";

/**
 * Column header sticks just below the app nav (h-16 = 64px) + the page's condensed sticky
 * toolbar (h-[52px]) → 116px. Keep in sync with the toolbar height in JiraBacklog.tsx.
 */
const STICKY_TOP = "top-[116px]";

/** True for the Description column, which absorbs leftover width and wraps. */
const isGrow = (id: string) => id === "desc";

/**
 * One rendered table row, memoized — re-renders only when its own issue identity or meta
 * changes. The whole row is clickable and opens the detail panel; the Jira link inside
 * stops propagation so it still opens Jira instead.
 */
const MemoTableRow = memo(
  function MemoTableRow({ row, meta }: { row: Row<JiraIssue>; meta: JiraTableMeta }) {
    return (
      <tr
        className="cursor-pointer border-b transition-colors hover:bg-muted/40"
        onClick={() => meta.openDetail(row.original._id)}
      >
        {row.getVisibleCells().map((cell) => {
          const grow = isGrow(cell.column.id);
          return (
            <td
              key={cell.id}
              style={{ minWidth: cell.column.columnDef.minSize, width: grow ? "100%" : undefined }}
              className={cn("px-3 py-2.5 align-top", grow ? "" : "whitespace-nowrap")}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          );
        })}
      </tr>
    );
  },
  (prev, next) => prev.row.original === next.row.original && prev.meta === next.meta,
);

/**
 * The "All" / "Open" table. No inner scroll container — the page scrolls as a whole, so the
 * table blends into the page. The header is sticky beneath the page toolbar, and is
 * sortable + filterable per column (see ColumnHeader).
 */
export function DataTable({
  columns,
  data,
  meta,
}: {
  columns: ColumnDef<JiraIssue>[];
  data: JiraIssue[];
  meta: JiraTableMeta;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Columns can be hidden at runtime (the toolbar's Columns picker) — drop any filter or
  // sort that references a column that no longer exists, or the row models would choke.
  useEffect(() => {
    const ids = new Set(columns.map((c) => c.id));
    setColumnFilters((prev) => prev.filter((f) => ids.has(f.id)));
    setSorting((prev) => prev.filter((s) => ids.has(s.id)));
  }, [columns]);

  const table = useReactTable({
    data,
    columns,
    meta,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row._id,
  });

  const rows = table.getRowModel().rows;
  const hasFilters = columnFilters.length > 0;

  return (
    <div>
      {hasFilters && (
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing {rows.length} of {data.length}
          </span>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setColumnFilters([])}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear filters
          </Button>
        </div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const grow = isGrow(h.column.id);
                return (
                  <th
                    key={h.id}
                    style={{ minWidth: h.column.columnDef.minSize, width: grow ? "100%" : undefined }}
                    className={cn(
                      "sticky z-20 border-b bg-background px-3 py-2 text-left text-xs font-medium text-muted-foreground",
                      STICKY_TOP,
                      grow ? "" : "whitespace-nowrap",
                    )}
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => <MemoTableRow key={row.id} row={row} meta={meta} />)
          ) : (
            <tr>
              <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No issues match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
