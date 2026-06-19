import { memo } from "react";
import {
  ColumnDef,
  Row,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
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
 * table blends into the page. The header is sticky beneath the page toolbar.
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
  const table = useReactTable({
    data,
    columns,
    meta,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row._id,
  });

  return (
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
        {data.length ? (
          table.getRowModel().rows.map((row) => <MemoTableRow key={row.id} row={row} meta={meta} />)
        ) : (
          <tr>
            <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
              No issues.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
