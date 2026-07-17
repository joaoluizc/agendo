import { Button } from "@/components/ui/button.tsx";
import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Position } from "@/types/positionTypes.tsx";
import { EventColorCell } from "./EventColorCell.tsx";

export const columns: ColumnDef<Position>[] = [
  {
    id: "select",
    header: ({ table, column }) => (
      <div className="flex items-center gap-1">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          aria-label="Sort by synced"
          title="Sort by synced"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    ),
    cell: ({ row }) =>
      row.original.enforceSync ? (
        <Checkbox checked disabled aria-label="Sync enforced" />
      ) : (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => {
            row.toggleSelected(!!value);
          }}
          aria-label="Select row"
        />
      ),
    enableSorting: true,
    // accessorFn is required for the column to be sortable at all (TanStack's
    // getCanSort gate); the sortingFn below is what actually orders rows.
    accessorFn: (row) => (row.sync || row.enforceSync ? 0 : 1),
    // Group synced rows first (ascending): synced -> 0, unsynced -> 1. Enforced
    // rows count as synced even though they're excluded from the selection model.
    // Uses live selection so it reflects unsaved checkbox toggles too.
    sortingFn: (rowA, rowB) => {
      const a = rowA.getIsSelected() || rowA.original.enforceSync ? 0 : 1;
      const b = rowB.getIsSelected() || rowB.original.enforceSync ? 0 : 1;
      return a - b;
    },
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span>{row.original.name}</span>
        {row.original.enforceSync && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-xs cursor-default">
                  Sync enforced
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Your admin requires this position to always sync to your Google
                Calendar. You can&apos;t turn it off.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    ),
  },
  {
    accessorKey: "type",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Type
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    id: "eventColor",
    header: "Event color",
    enableSorting: false,
    cell: ({ row }) => <EventColorCell row={row} />,
  },
];
