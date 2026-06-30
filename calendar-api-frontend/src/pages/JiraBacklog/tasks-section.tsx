import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError, taskApi } from "./api";
import { CollapsibleSection } from "./collapsible-section";
import { TaskEditDialog } from "./task-edit-dialog";
import { formatDeadline, isDeadlineReached, isPastDue } from "./dates";
import { JiraIssue, JiraTableMeta, Task, TaskStatus } from "./types";

/**
 * Tasks area for the detail panel — rendered only inside DetailPanel, so it shows only when
 * a ticket is expanded. Admins quick-add tasks and click any task to open the full editor
 * (title / status / deadline / delete, plus the No-ETA card when applicable); non-admins see
 * a read-only list. A red dot marks tasks whose deadline has been reached.
 */

const inputClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

export function TasksSection({ issue, meta }: { issue: JiraIssue; meta: JiraTableMeta }) {
  const issueId = issue._id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, s] = await Promise.all([taskApi.getTasksForIssue(issueId), taskApi.getStatuses()]);
      setTasks(t);
      setStatuses(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    load();
  }, [load]);

  const statusName = useMemo(() => {
    const m = new Map(statuses.map((s) => [s._id, s.name] as const));
    return (id: string) => m.get(id) || "—";
  }, [statuses]);

  const addTask = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const created = await taskApi.createTask(issueId, { title });
      setTasks((prev) => [...prev, created]);
      setNewTitle("");
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 403
          ? "Only admins can add tasks."
          : e instanceof Error
            ? e.message
            : "Could not add task";
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  }, [issueId, newTitle]);

  const openEditor = (task: Task) => {
    setEditing(task);
    setEditorOpen(true);
  };

  return (
    <CollapsibleSection title="Tasks">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-destructive">{error}</span>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}

          {tasks.map((task) => {
            const sName = statusName(task.statusId);
            const done = /^done$/i.test(sName);
            const pastDue = !done && isPastDue(task.deadline);
            const reached = !done && isDeadlineReached(task.deadline);
            return (
              <button
                key={task._id}
                type="button"
                onClick={() => meta.canEdit && openEditor(task)}
                disabled={!meta.canEdit}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                  meta.canEdit && "hover:bg-muted/50",
                )}
              >
                {pastDue && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Past due" />
                )}
                <span className="flex-1 break-words text-sm">{task.title}</span>
                {task.deadline && (
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      reached ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
                    )}
                  >
                    {formatDeadline(task.deadline)}
                  </span>
                )}
                <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {sName}
                </span>
              </button>
            );
          })}

          {meta.canEdit && (
            <div className="flex items-center gap-2 pt-1">
              <input
                className={inputClass}
                placeholder="Add a task…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTask();
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addTask}
                disabled={adding || !newTitle.trim()}
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </Button>
            </div>
          )}
        </div>
      )}

      {meta.canEdit && (
        <TaskEditDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          mode="edit"
          task={editing}
          statuses={statuses}
          onChanged={load}
          onIssueUpdated={meta.onIssueUpdated}
        />
      )}
    </CollapsibleSection>
  );
}
