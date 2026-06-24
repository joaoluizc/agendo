import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import { ApiError, taskApi } from "@/pages/JiraBacklog/api";
import { TaskStatus, TaskWithIssue } from "@/pages/JiraBacklog/types";

/**
 * Tasks kanban — every task across all Jira-backlog tickets, grouped into status columns.
 * Admins drag cards between columns (which re-assigns the task's status) and add/remove
 * columns; non-admins get a read-only board. Cards link back to the ticket's detail view
 * via the ?issue= deep-link on the Jira Backlog page.
 */

const CARD_PREFIX = "task:";
const COL_PREFIX = "status:";

/** Presentational card body — shared by the in-column card and the drag overlay. */
function CardContent({
  task,
  statusName,
  dragging,
}: {
  task: TaskWithIssue;
  statusName: string;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-1.5 rounded-md border bg-background p-3 shadow-sm",
        dragging && "shadow-lg ring-1 ring-ring",
      )}
    >
      <p className="text-sm font-medium leading-snug break-words">{task.title}</p>
      {task.issueDesc && (
        <p className="line-clamp-2 text-xs text-muted-foreground break-words">{task.issueDesc}</p>
      )}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <Link
          to={`/app/jira-backlog?issue=${task.issueId}`}
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {task.issueKey || "—"} <ExternalLink className="h-3 w-3" />
        </Link>
        <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {statusName}
        </span>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  statusName,
  canEdit,
}: {
  task: TaskWithIssue;
  statusName: string;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${CARD_PREFIX}${task._id}`,
    disabled: !canEdit,
    data: { task },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(canEdit && "cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <CardContent task={task} statusName={statusName} />
    </div>
  );
}

function Column({
  status,
  tasks,
  canEdit,
  onDelete,
}: {
  status: TaskStatus;
  tasks: TaskWithIssue[];
  canEdit: boolean;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${status._id}` });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold">
          {status.name}{" "}
          <span className="text-xs font-normal text-muted-foreground">({tasks.length})</span>
        </span>
        {canEdit && (
          <button
            onClick={() => onDelete(status._id)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
            aria-label={`Delete ${status.name} status`}
            title="Delete status"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </header>
      <div ref={setNodeRef} className={cn("flex-1 space-y-2 p-2", isOver && "bg-accent/40")}>
        {tasks.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">No tasks</p>
        ) : (
          tasks.map((t) => (
            <TaskCard key={t._id} task={t} statusName={status.name} canEdit={canEdit} />
          ))
        )}
      </div>
    </div>
  );
}

export default function Tasks() {
  const { type } = useUserSettings();
  const canEdit = type === "admin";

  const [tasks, setTasks] = useState<TaskWithIssue[]>([]);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskWithIssue | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [addingStatus, setAddingStatus] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [t, s] = await Promise.all([taskApi.getAllTasks(), taskApi.getStatuses()]);
      setTasks(t);
      setStatuses(s);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tasksByStatus = useMemo(() => {
    const m = new Map<string, TaskWithIssue[]>();
    for (const s of statuses) m.set(s._id, []);
    for (const t of tasks) {
      if (!m.has(t.statusId)) m.set(t.statusId, []);
      m.get(t.statusId)!.push(t);
    }
    return m;
  }, [tasks, statuses]);

  const onDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as TaskWithIssue | undefined;
    if (task) setActiveTask(task);
  }, []);

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const taskId = String(active.id).slice(CARD_PREFIX.length);
      const overId = String(over.id);
      if (!overId.startsWith(COL_PREFIX)) return;
      const targetStatusId = overId.slice(COL_PREFIX.length);

      const task = tasks.find((t) => t._id === taskId);
      if (!task || task.statusId === targetStatusId) return;

      const prev = tasks;
      setTasks((cur) => cur.map((t) => (t._id === taskId ? { ...t, statusId: targetStatusId } : t)));
      try {
        await taskApi.updateTask(taskId, { statusId: targetStatusId });
      } catch (e) {
        setTasks(prev); // revert
        const msg =
          e instanceof ApiError && e.status === 403
            ? "Only admins can move tasks."
            : e instanceof Error
              ? e.message
              : "Could not move task";
        toast.error(msg);
      }
    },
    [tasks],
  );

  const addStatus = useCallback(async () => {
    const name = newStatus.trim();
    if (!name) return;
    setAddingStatus(true);
    try {
      const created = await taskApi.createStatus(name);
      setStatuses((prev) => [...prev, created]);
      setNewStatus("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add status");
    } finally {
      setAddingStatus(false);
    }
  }, [newStatus]);

  const removeStatus = useCallback(async (id: string) => {
    try {
      await taskApi.deleteStatus(id);
      setStatuses((prev) => prev.filter((s) => s._id !== id));
      toast.success("Status deleted");
    } catch (e) {
      // 409 STATUS_IN_USE carries a friendly message from the server.
      toast.error(e instanceof Error ? e.message : "Could not delete status");
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 pb-16">
      <div className="pt-6 pb-2">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Every task across the Jira backlog, by status.{" "}
          {canEdit ? "Drag a card to change its status." : "Read-only — ask an admin for edit access."}
        </p>
      </div>

      {canEdit && (
        <div className="flex items-center gap-2 py-2">
          <input
            className="h-9 w-56 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="New status name…"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStatus();
              }
            }}
          />
          <Button variant="outline" size="sm" onClick={addStatus} disabled={addingStatus || !newStatus.trim()}>
            {addingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add status
          </Button>
        </div>
      )}

      <div className="pt-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : statuses.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No statuses yet.</p>
        ) : (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {statuses.map((s) => (
                <Column
                  key={s._id}
                  status={s}
                  tasks={tasksByStatus.get(s._id) || []}
                  canEdit={canEdit}
                  onDelete={removeStatus}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask ? (
                <CardContent
                  task={activeTask}
                  statusName={statuses.find((s) => s._id === activeTask.statusId)?.name || ""}
                  dragging
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
