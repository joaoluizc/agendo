import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, taskApi } from "./api";
import { CollapsibleSection } from "./collapsible-section";
import { PrettySelect } from "./pretty-select";
import { JiraIssue, JiraTableMeta, Task, TaskStatus } from "./types";

/**
 * Tasks area for the detail panel — rendered only inside DetailPanel, so it shows only
 * when a ticket is expanded. Admins can add unlimited tasks and set each task's status
 * from the shared, customizable status set; non-admins see a read-only list. Native
 * <select> (like SelectField) avoids the Radix scroll-lock issue inside the fixed panel.
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

  const changeStatus = useCallback(
    async (taskId: string, statusId: string) => {
      const prev = tasks;
      setTasks((cur) => cur.map((t) => (t._id === taskId ? { ...t, statusId } : t)));
      try {
        await taskApi.updateTask(taskId, { statusId });
      } catch (e) {
        setTasks(prev); // revert
        toast.error(e instanceof Error ? e.message : "Could not update task");
      }
    },
    [tasks],
  );

  const removeTask = useCallback(
    async (taskId: string) => {
      const prev = tasks;
      setTasks((cur) => cur.filter((t) => t._id !== taskId));
      try {
        await taskApi.deleteTask(taskId);
      } catch (e) {
        setTasks(prev); // revert
        toast.error(e instanceof Error ? e.message : "Could not delete task");
      }
    },
    [tasks],
  );

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
        <div className="space-y-2">
          {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}

          {tasks.map((task) => (
            <div key={task._id} className="flex items-center gap-2">
              <span className="flex-1 break-words text-sm">{task.title}</span>
              {meta.canEdit ? (
                <>
                  <PrettySelect
                    value={task.statusId}
                    options={statuses.map((s) => ({ value: s._id, label: s.name }))}
                    onChange={(v) => changeStatus(task._id, v)}
                    triggerClassName="h-8 w-36"
                  />
                  <button
                    onClick={() => removeTask(task._id)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                    aria-label="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {statusName(task.statusId)}
                </span>
              )}
            </div>
          ))}

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
    </CollapsibleSection>
  );
}
