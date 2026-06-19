import { ColumnDef } from "@tanstack/react-table";
import { COLUMN_DEFS } from "./constants";
import { FieldCell } from "./cells";
import { JiraIssue, JiraTableMeta } from "./types";

/**
 * TanStack column defs built from COLUMN_DEFS. Cells are display-only (<FieldCell>);
 * editing happens in the detail panel that opens on row click. No trailing actions column
 * — delete moved into the panel.
 */
export function buildColumns(): ColumnDef<JiraIssue>[] {
  return COLUMN_DEFS.map((desc) => ({
    id: desc.id,
    accessorKey: desc.field,
    header: desc.header,
    minSize: desc.minWidth,
    enableSorting: false,
    cell: ({ row, table }) => (
      <FieldCell issue={row.original} desc={desc} meta={table.options.meta as JiraTableMeta} />
    ),
  }));
}
