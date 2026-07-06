import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ApiError, taskApi } from "./api";
import { TaskStatus } from "./types";

/**
 * Manage the Bug Tasks kanban columns (task statuses): reorder them, pick the one new tasks
 * start in (the "default" — an explicit flag so reordering/deleting never silently changes
 * it), and add / remove columns. A column can't be removed while it still has tasks (the
 * backend returns 409 STATUS_IN_USE). Every change asks the parent to reload so the board
 * and the task editor stay in sync.
 */
export function TaskStatusManagerDialog({
  open,
  onOpenChange,
  statuses,
  reload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: TaskStatus[];
  reload: () => Promise<void>;
}) {
  // Local copy so reordering feels instant; re-seeded from the server list on open/refresh.
  const [items, setItems] = useState<TaskStatus[]>(statuses);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    if (open) setItems(statuses);
  }, [open, statuses]);

  const move = async (index: number, delta: number) => {
    const j = index + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next); // optimistic
    setReordering(true);
    try {
      await taskApi.reorderStatuses(next.map((s) => s._id));
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reorder statuses");
      setItems(statuses); // revert to the server truth
    } finally {
      setReordering(false);
    }
  };

  const setDefault = async (id: string) => {
    setBusyId(id);
    try {
      await taskApi.updateStatus(id, { isDefault: true });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set default status");
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await taskApi.createStatus(name);
      setNewName("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add status");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await taskApi.deleteStatus(id);
      await reload();
      toast.success("Status deleted");
    } catch (e) {
      // 409 STATUS_IN_USE carries a friendly message from the server.
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not delete status";
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[70]">
        <DialogHeader>
          <DialogTitle>Manage task statuses</DialogTitle>
          <DialogDescription>
            Reorder the kanban columns, choose which status new tasks start in (★), and add or
            remove columns. A column can’t be removed while it still has tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No statuses yet.</p>
          ) : (
            items.map((s, i) => (
              <div key={s._id} className="flex items-center gap-2 rounded-md border px-2.5 py-2">
                <div className="flex flex-col">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || reordering}
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    aria-label={`Move ${s.name} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1 || reordering}
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    aria-label={`Move ${s.name} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <span className="flex-1 truncate text-sm font-medium">{s.name}</span>

                <button
                  onClick={() => !s.isDefault && setDefault(s._id)}
                  disabled={busyId === s._id || s.isDefault}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium",
                    s.isDefault
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  title={s.isDefault ? "Default for new tasks" : "Set as default for new tasks"}
                >
                  <Star className={cn("h-4 w-4", s.isDefault && "fill-amber-400 text-amber-500")} />
                  {s.isDefault && "Default"}
                </button>

                <button
                  onClick={() => remove(s._id)}
                  disabled={busyId === s._id}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                  aria-label={`Delete ${s.name}`}
                  title="Delete status"
                >
                  {busyId === s._id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Input
            placeholder="New status name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button variant="outline" size="sm" onClick={add} disabled={adding || !newName.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
