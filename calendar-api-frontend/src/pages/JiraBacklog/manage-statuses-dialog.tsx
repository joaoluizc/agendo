import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { ApiError, bugStatusApi } from "./api";
import { BugStatus } from "./types";

/**
 * Add / remove the bug statuses available on the backlog (the status dropdown). A status
 * can't be removed while issues still use it — the backend returns 409 STATUS_IN_USE and we
 * surface its message. After any change we ask the parent to reload so the dropdown + filter
 * stay in sync.
 */
export function ManageStatusesDialog({
  open,
  onOpenChange,
  statuses,
  reload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: BugStatus[];
  reload: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await bugStatusApi.create(name);
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
      await bugStatusApi.remove(id);
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
          <DialogTitle>Manage bug statuses</DialogTitle>
          <DialogDescription>
            Add or remove the statuses available on the backlog. A status can’t be removed while
            issues still use it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {statuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No statuses yet.</p>
          ) : (
            statuses.map((s) => (
              <div
                key={s._id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="text-sm font-medium">{s.name}</span>
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
