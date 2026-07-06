import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Calendar as CalendarIcon, CalendarClock, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PrettySelect } from "./pretty-select";
import { jiraApi, taskApi } from "./api";
import { NO_ETA_STATUS } from "./constants";
import { JiraIssue, NoEtaReview, Task, TaskStatus, TaskWithIssue } from "./types";
import {
  dateToInputValue,
  deadlineRelative,
  formatDeadline,
  inputValueToDate,
  relativeToNow,
  toDateInputValue,
} from "./dates";

/**
 * Shared task editor — used both inside an issue's detail panel (editing a linked task) and
 * on the Tasks page (creating a standalone task or editing any card). Built on the Radix
 * Dialog primitives directly (not the shadcn wrapper) so the overlay + content sit above the
 * z-[60] issue panel. The "Evaluate now" step is rendered inline (a view swap) rather than a
 * nested modal, which keeps stacking simple.
 *
 * Fields auto-nothing — edits are committed on Save. The No-ETA candidate card + its actions
 * (re-evaluate / set No-ETA) are immediate, server-authoritative calls.
 */

const inputClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

type EditableTask = Task | TaskWithIssue;

export function TaskEditDialog({
  open,
  onOpenChange,
  mode,
  task,
  issueId,
  statuses,
  onChanged,
  onIssueUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** The task being edited (edit mode). */
  task?: EditableTask | null;
  /** Link target for create mode; omit/null for a standalone task. */
  issueId?: string | null;
  statuses: TaskStatus[];
  /** Refresh the parent list after any create/update/delete/No-ETA action. */
  onChanged: () => void;
  /** Optional: sync the linked issue after a "Set as No-ETA" (issue-panel context). */
  onIssueUpdated?: (issue: JiraIssue) => void;
}) {
  const [title, setTitle] = useState("");
  const [statusId, setStatusId] = useState("");
  const [deadline, setDeadline] = useState(""); // yyyy-MM-dd or ""
  const [dateOpen, setDateOpen] = useState(false);
  const [noEta, setNoEta] = useState<NoEtaReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  // Re-seed the draft whenever the dialog opens (or targets a different task).
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    // New tasks default to the flagged default status; editing keeps the task's own status.
    setStatusId(task?.statusId ?? statuses.find((s) => s.isDefault)?._id ?? statuses[0]?._id ?? "");
    setDeadline(toDateInputValue(task?.deadline));
    setNoEta(task?.noEtaReview ?? null);
    setEvaluating(false);
    setBusy(false);
  }, [open, task, statuses]);

  const issueKey = task && "issueKey" in task ? task.issueKey : "";
  const reviewIssueId = task?.issueId || null;

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const body = { title: trimmed, statusId, deadline: deadline || null };
      if (mode === "create") {
        if (issueId) await taskApi.createTask(issueId, body);
        else await taskApi.createStandaloneTask(body);
        toast.success("Task created.");
      } else if (task) {
        await taskApi.updateTask(task._id, body);
        toast.success("Task saved.");
      }
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save task");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await taskApi.deleteTask(task._id);
      toast.success("Task deleted.");
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete task");
    } finally {
      setBusy(false);
    }
  };

  const reevaluate = async () => {
    if (!task) return;
    setBusy(true);
    try {
      const updated = await taskApi.noEtaAction(task._id, "reevaluate");
      setNoEta(updated.noEtaReview ?? null);
      setDeadline(toDateInputValue(updated.deadline));
      setEvaluating(false);
      onChanged();
      toast.success("Re-evaluation scheduled 30 days out.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not re-evaluate");
    } finally {
      setBusy(false);
    }
  };

  const setNoEtaFinal = async () => {
    if (!task || !reviewIssueId) return;
    setBusy(true);
    try {
      const issue = await jiraApi.updateIssue(reviewIssueId, { status: NO_ETA_STATUS });
      await taskApi.noEtaAction(task._id, "resolve");
      onIssueUpdated?.(issue);
      onChanged();
      onOpenChange(false);
      toast.success("Bug marked as No-ETA.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set No-ETA");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[71] w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-5 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mb-4 flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold">
              {evaluating ? "Evaluate No-ETA candidate" : mode === "create" ? "New task" : "Edit task"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {evaluating && noEta ? (
            <div className="space-y-4">
              <DialogPrimitive.Description className="text-sm text-muted-foreground">
                It’s been {relativeToNow(noEta.flaggedAt).replace(/^about /, "")} since this bug was
                flagged as a possible No-ETA
                {noEta.cycles > 0 ? ` (${noEta.cycles} re-evaluation${noEta.cycles === 1 ? "" : "s"} so far)` : ""}.
                What next?
              </DialogPrimitive.Description>
              <div className="grid gap-2">
                <Button onClick={setNoEtaFinal} disabled={busy}>
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Set as No-ETA
                </Button>
                <Button variant="outline" onClick={reevaluate} disabled={busy}>
                  Re-evaluate in 30 more days
                </Button>
                <Button variant="ghost" onClick={() => setEvaluating(false)} disabled={busy}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Title</span>
                <input
                  className={inputClass}
                  value={title}
                  autoFocus
                  placeholder="Task title…"
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && title.trim()) save();
                  }}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <PrettySelect
                  value={statusId}
                  options={statuses.map((s) => ({ value: s._id, label: s.name }))}
                  onChange={setStatusId}
                />
              </label>

              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Deadline</span>
                <div className="flex items-center gap-2">
                  <Popover open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          inputClass,
                          "flex items-center justify-between gap-2 text-left",
                          !deadline && "text-muted-foreground",
                        )}
                      >
                        {deadline ? formatDeadline(deadline) : "Pick a date"}
                        <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="z-[80] w-auto p-0">
                      <Calendar
                        mode="single"
                        autoFocus
                        selected={inputValueToDate(deadline)}
                        onSelect={(d) => {
                          setDeadline(d ? dateToInputValue(d) : "");
                          setDateOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  {deadline && (
                    <button
                      type="button"
                      onClick={() => setDeadline("")}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Clear deadline"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {issueKey && (
                <p className="text-xs text-muted-foreground">
                  Linked bug: <span className="font-medium text-foreground">{issueKey}</span>
                </p>
              )}

              {mode === "edit" && noEta && (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4" /> Evaluating as a No-ETA candidate
                  </div>
                  <p className="text-xs">
                    Flagged {relativeToNow(noEta.flaggedAt)}
                    {noEta.cycles > 0 ? ` · ${noEta.cycles} re-evaluation${noEta.cycles === 1 ? "" : "s"}` : ""}.
                    {deadline && (
                      <>
                        {" "}
                        Next review <span className="font-medium">{deadlineRelative(deadline)}</span> (
                        {formatDeadline(deadline)}).
                      </>
                    )}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-amber-500/50 bg-background/60"
                    onClick={() => setEvaluating(true)}
                    disabled={busy}
                  >
                    <CalendarClock className="mr-1 h-3.5 w-3.5" /> Evaluate now
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                {mode === "edit" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={remove}
                    disabled={busy}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                ) : (
                  <span />
                )}
                <Button onClick={save} disabled={busy || !title.trim()}>
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  {mode === "create" ? "Create" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
