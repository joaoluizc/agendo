import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, ArrowUpDown } from "lucide-react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useUserSettings } from "@/providers/useUserSettings";
import { Position } from "@/types/positionTypes";
import {
  createPosition,
  deletePosition,
  updatePosition,
} from "./positionUtils";
import { toast } from "sonner";

const POSITION_TYPES = [
  "live channel",
  "tickets",
  "meeting",
  "break",
  "development",
  "training",
];

const DEFAULT_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
];

const INITIAL_FORM = {
  name: "",
  color: DEFAULT_COLORS[0],
  type: "live channel" as Position["type"],
  positionId: "",
  enforceSync: false,
};

export default function ManagePositions() {
  const { allPositions, setAllPositions } = useUserSettings();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const resetForm = () => setFormData(INITIAL_FORM);

  const handleCreate = async () => {
    const newPosition = {
      name: formData.name,
      color: formData.color,
      type: formData.type,
      enforceSync: formData.enforceSync,
      ...(formData.positionId && { positionId: formData.positionId }),
    };

    try {
      const createdPosition = await createPosition(newPosition);
      setAllPositions([...allPositions, createdPosition]);
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success("Position created successfully.");
    } catch (error) {
      console.error("Error creating position:", error);
      toast.error("Failed to create position.");
    }
  };

  const handleEdit = (position: Position) => {
    setEditingPosition(position);
    setFormData({
      name: position.name,
      color: position.color,
      type: position.type,
      positionId: position.positionId || "",
      enforceSync: position.enforceSync || false,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingPosition) return;

    const updatedPosition: Position = {
      ...editingPosition,
      name: formData.name,
      color: formData.color,
      type: formData.type,
      enforceSync: formData.enforceSync,
      ...(formData.positionId && { positionId: formData.positionId }),
    };

    try {
      await updatePosition(updatedPosition);
      setAllPositions(
        allPositions.map((p) =>
          p._id === editingPosition._id ? updatedPosition : p
        )
      );
      setIsEditDialogOpen(false);
      setEditingPosition(null);
      resetForm();
      toast.success("Position updated successfully.");
    } catch (error) {
      console.error("Error updating position:", error);
      toast.error("Failed to update position.");
    }
  };

  const handleDelete = (positionId: string) => {
    try {
      deletePosition(positionId);
      setAllPositions(allPositions.filter((p) => p._id !== positionId));
      toast.success("Position deleted successfully.");
    } catch (error) {
      console.error("Error deleting position:", error);
      toast.error("Failed to delete position.");
    }
  };

  const columns: ColumnDef<Position>[] = [
    {
      accessorKey: "color",
      header: "Color",
      enableSorting: false,
      cell: ({ row }) => (
        <div
          className="w-4 h-4 rounded-full border"
          style={{ backgroundColor: row.original.color }}
        />
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2 font-medium">
          {row.original.name}
          {row.original.enforceSync && (
            <Badge variant="secondary" className="text-xs">
              Enforced
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Type
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="capitalize">{row.original.type}</span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEdit(row.original)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Position</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{row.original.name}"? This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleDelete(row.original._id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: allPositions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Positions Management</CardTitle>
            <CardDescription>
              Manage support agent positions and their assignments
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Position
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Position</DialogTitle>
                <DialogDescription>
                  Add a new position for support agents
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Position Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Live Chat Support"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type">Position Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: Position["type"]) =>
                      setFormData({ ...formData, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITION_TYPES.map((type, idx) => (
                        <SelectItem
                          className="capitalize"
                          key={`${type}-${idx}`}
                          value={type}
                        >
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="color">Color</Label>
                  <div className="flex gap-2 flex-wrap">
                    {DEFAULT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 ${
                          formData.color === color
                            ? "border-gray-900"
                            : "border-gray-300"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                  <Input
                    type="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="w-20 h-10"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="positionId">
                    Legacy Position ID (Optional)
                  </Label>
                  <Input
                    id="positionId"
                    value={formData.positionId}
                    onChange={(e) =>
                      setFormData({ ...formData, positionId: e.target.value })
                    }
                    placeholder="e.g., SLING_001"
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the legacy ID if this position exists in Sling
                  </p>
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enforceSync"
                      checked={formData.enforceSync}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          enforceSync: checked as boolean,
                        })
                      }
                    />
                    <Label htmlFor="enforceSync">
                      Enforce sync for all users
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Always sync this position to every user&apos;s Google
                    Calendar. Users can&apos;t opt out. Applies to future syncs.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!formData.name.trim()}>
                  Create Position
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center py-4">
          <Input
            placeholder="Filter positions by name..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn("name")?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No positions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="flex-1 text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length} position(s)
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Position</DialogTitle>
              <DialogDescription>Update the position details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Position Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Live Chat Support"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-type">Position Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: Position["type"]) =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_TYPES.map((type, idx) => (
                      <SelectItem
                        className="capitalize"
                        key={`${type}-${idx}`}
                        value={type}
                      >
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-color">Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {DEFAULT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 ${
                        formData.color === color
                          ? "border-gray-900"
                          : "border-gray-300"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                    />
                  ))}
                </div>
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData({ ...formData, color: e.target.value })
                  }
                  className="w-20 h-10"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-positionId">
                  Legacy Position ID (Optional)
                </Label>
                <Input
                  id="edit-positionId"
                  value={formData.positionId}
                  onChange={(e) =>
                    setFormData({ ...formData, positionId: e.target.value })
                  }
                  placeholder="e.g., SLING_001"
                />
                <p className="text-sm text-muted-foreground">
                  Enter the legacy ID if this position exists in Sling
                </p>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-enforceSync"
                    checked={formData.enforceSync}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        enforceSync: checked as boolean,
                      })
                    }
                  />
                  <Label htmlFor="edit-enforceSync">
                    Enforce sync for all users
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Always sync this position to every user&apos;s Google Calendar.
                  Users can&apos;t opt out. Applies to future syncs.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={!formData.name.trim()}>
                Update Position
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
