import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSchedule } from "@/providers/useSchedule";
import { useUserSettings } from "@/providers/useUserSettings";
import { Shift } from "@/types/shiftTypes";
import { isDraft } from "../scheduleUtils";
import {
  applyShiftChanges,
  deleteShift,
  updateShift,
} from "../shift-dialogs/shiftRequests";
import { showUndoToast } from "../undoToast";

/**
 * Where a grid gesture — dragging a shift to a new time, resizing it by an edge — gets
 * saved, and the one gesture that still asks first.
 *
 * **A retime always saves as a draft, straight away.** This used to ask "Publish this
 * change?" whenever the shift was already published. Now every edit made on the grid is a
 * plan until someone publishes it, from the drafts bar or a selection, so there is nothing
 * left to ask. What the prompt's Cancel used to offer — a way back from a drag that went
 * wrong — is the toast's Undo (and Ctrl/Cmd+Z while it shows), which puts back the old
 * time *and* the old status.
 *
 * For a published shift that has a cost worth saying out loud: going back to draft takes
 * the shift's event off the agent's Google Calendar (the server removes it on any update
 * to draft), and it stays off until the day is published again. The toast says so.
 *
 * **A delete still asks.** Shrinking a shift past its opposite edge is taken as wanting it
 * gone, which is a plausible accident and cannot be undone.
 *
 * Rendered once by ScheduleCalendar, not per shift: there are 384 EmptySlots on a full
 * roster and any of them can raise one of these.
 */
const PendingChangePrompt = () => {
  const {
    pendingChange,
    setPendingChange,
    shifts,
    events,
    setShifts,
    setEvents,
    reloadSchedule,
  } = useSchedule();
  const { allUsers } = useUserSettings();
  const [busy, setBusy] = useState(false);

  /**
   * Guards against resolving twice: the delete button closes the dialog, and closing is
   * itself the cancel path.
   */
  const resolved = useRef(false);

  const isDelete = pendingChange?.intent === "delete";

  const finish = () => {
    setBusy(false);
    setPendingChange(null);
  };

  const patchGrid = (removed: Shift[], created: Shift[]) => {
    const next = applyShiftChanges({ shifts, events, removed, created });
    setShifts(next.shifts);
    setEvents(next.events);
  };

  const saveAsDraft = async () => {
    if (!pendingChange || resolved.current) return;
    resolved.current = true;
    const { shift, startTime, endTime, userId, detail } = pendingChange;
    const wasPublished = !isDraft(shift);
    setBusy(true);
    try {
      const updated = await updateShift(shift._id, {
        startTime,
        endTime,
        userId,
        positionId: String(shift.positionId),
        status: "draft",
      });
      // The response carries the fresh sync state, so swapping the whole shift keeps the
      // Google Calendar under-lane honest.
      patchGrid(
        [shift],
        [updated ?? { ...shift, startTime, endTime, userId, status: "draft" }]
      );

      const agent = allUsers.find((user) => String(user.id) === String(userId));
      const publishHint = wasPublished
        ? `Publish to send the new time to ${agent?.firstName ?? "the agent"}'s calendar.`
        : undefined;
      showUndoToast({
        message: "Saved as draft",
        // A draft retime says nothing more than it used to, apart from what the drag did
        // that the grid cannot show — a new agent, or crossing midnight.
        description: [publishHint, detail].filter(Boolean).join(" ") || undefined,
        // Puts back exactly what the gesture replaced — time, agent and status, so a
        // published shift is published (and synced) again. Refetches rather than patching:
        // the day on screen may no longer be the one this change was made on.
        undo: async () => {
          await updateShift(shift._id, {
            startTime: shift.startTime,
            endTime: shift.endTime,
            userId: String(shift.userId),
            positionId: String(shift.positionId),
            status: wasPublished ? "published" : "draft",
          });
          reloadSchedule();
        },
      });
    } catch (error) {
      console.error("Error saving shift change:", error);
      toast.error("Could not save the change", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      finish();
    }
  };

  const confirmDelete = async () => {
    if (!pendingChange || resolved.current) return;
    resolved.current = true;
    const { shift } = pendingChange;
    setBusy(true);
    try {
      await deleteShift(shift._id);
      patchGrid([shift], []);
      toast.success("Shift deleted");
    } catch (error) {
      console.error("Error deleting shift:", error);
      toast.error("Could not delete the shift", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      finish();
    }
  };

  /**
   * Keep the shift — the button, Escape, or a click outside.
   *
   * Nothing has been written at this point: the block is holding its dragged shape locally
   * and clearing the pending change releases it, so it snaps back to its stored times.
   */
  const onCancel = () => {
    if (busy) return;
    resolved.current = true;
    setPendingChange(null);
  };

  useEffect(() => {
    if (pendingChange) resolved.current = false;
  }, [pendingChange]);

  // Declared after the reset above so the guard is already cleared for this change.
  // A retime saves without ever showing the dialog.
  useEffect(() => {
    if (!pendingChange || isDelete) return;
    void saveAsDraft();
  }, [pendingChange, isDelete]);

  if (!pendingChange || !isDelete) return null;

  const { summary, detail } = pendingChange;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
          <AlertDialogDescription>
            You shrank the shift past its minimum length, which is taken as wanting it
            gone. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border border-border bg-band px-3.5 py-2.5">
          <div className="text-[12.5px] font-semibold tabular-nums">
            {summary}
          </div>
          {detail && (
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              {detail}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          {/* Keep sits leftmost and quietest; it is also what Escape does. */}
          <Button
            variant="ghost"
            className="h-[34px] rounded-lg px-3.5 text-[13px] font-medium text-muted-foreground"
            disabled={busy}
            onClick={onCancel}
          >
            Keep shift
          </Button>
          <Button
            className="h-[34px] rounded-lg bg-destructive px-3.5 text-[13px] font-semibold text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={confirmDelete}
          >
            {busy ? "Deleting…" : "Delete shift"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default PendingChangePrompt;
