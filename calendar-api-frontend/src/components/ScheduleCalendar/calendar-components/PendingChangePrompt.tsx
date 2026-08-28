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
import { Shift } from "@/types/shiftTypes";
import { isDraft } from "../scheduleUtils";
import {
  applyShiftChanges,
  deleteShift,
  updateShift,
} from "../shift-dialogs/shiftRequests";

/**
 * The one question a grid gesture cannot answer: does this change reach the agent's
 * calendar, or stay a plan?
 *
 * Dragging a shift to a new time and resizing it by an edge are both unambiguous about
 * *what* they did and silent about whether it is committed. Rather than guessing — the
 * first attempt forced every drag to draft with no explanation — the gesture parks itself
 * on `pendingChange` and this asks.
 *
 * **It only asks about a shift that is already published.** Re-timing a draft has nothing
 * at stake — it stays a draft, nothing syncs — so it saves straight away and says so in a
 * toast. See `autoKeepDraft`.
 *
 * **Dismissing saves as a draft.** The gesture already happened and the user meant it; the
 * only open question is commitment, and a draft touches no calendar, so the quiet outcome
 * is the safe one.
 *
 * **A delete is the exact opposite: dismissing cancels.** Shrinking a shift out of
 * existence is a plausible accident, and the safe outcome there is to keep the shift. The
 * asymmetry is deliberate — in both cases dismissal is the reversible option.
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
  } = useSchedule();
  const [busy, setBusy] = useState(false);

  /**
   * Guards against resolving twice. Both buttons close the dialog, and closing is itself
   * the "keep as draft" path — without this, clicking the draft button would save once for
   * the click and again for the close it causes.
   */
  const resolved = useRef(false);

  const isDelete = pendingChange?.intent === "delete";

  /**
   * Re-timing a shift that is *already* a draft needs no question.
   *
   * The prompt exists to ask whether a change reaches the agent's calendar. For a draft the
   * answer is already no — it stays a draft, nothing syncs, and asking "publish or keep as
   * draft?" turns every nudge of an unpublished day into a dialog. Only a *published* shift
   * has something at stake, because re-timing it either moves the agent's calendar event or
   * quietly pulls it back to draft.
   *
   * Deleting still asks, whatever the status: that one is irreversible.
   */
  const autoKeepDraft =
    !!pendingChange && !isDelete && isDraft(pendingChange.shift);

  const finish = () => {
    setBusy(false);
    setPendingChange(null);
  };

  const patchGrid = (removed: Shift[], created: Shift[]) => {
    const next = applyShiftChanges({ shifts, events, removed, created });
    setShifts(next.shifts);
    setEvents(next.events);
  };

  const saveRetime = async (status: "draft" | "published") => {
    if (!pendingChange || resolved.current) return;
    resolved.current = true;
    const { shift, startTime, endTime, userId } = pendingChange;
    setBusy(true);
    try {
      const updated = await updateShift(shift._id, {
        startTime,
        endTime,
        userId,
        positionId: String(shift.positionId),
        status,
      });
      // The response carries the fresh sync state, so swapping the whole shift keeps the
      // Google Calendar under-lane honest.
      patchGrid(
        [shift],
        [updated ?? { ...shift, startTime, endTime, userId, status }]
      );
      toast.success(
        status === "published" ? "Change published" : "Saved as draft",
        // A draft retime saves without a dialog, so the toast is the only place left to
        // mention what the prompt would have — that the shift now crosses midnight, or
        // moved to a different agent.
        autoKeepDraft && pendingChange.detail
          ? { description: pendingChange.detail }
          : undefined
      );
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
   * Throw the gesture away — Cancel, Escape, or a click outside.
   *
   * Nothing has been written at this point: the block is holding its dragged shape locally
   * and clearing the pending change releases it, so it snaps back to its stored times.
   *
   * Dismissing used to save as a draft, on the reasoning that the drag had already happened
   * and was meant. That made sense while "keep as draft" was the *only* alternative to
   * publishing. Now that Cancel is a button in its own right, a dialog whose Escape key
   * does something different from its Cancel button is just a trap — so both discard, and
   * "Keep as draft" is the explicit way to save without publishing.
   */
  const onCancel = () => {
    if (busy) return;
    resolved.current = true;
    setPendingChange(null);
  };

  useEffect(() => {
    if (pendingChange) resolved.current = false;
  }, [pendingChange]);

  // Declared after saveRetime so it can call it, and after the reset above so the guard is
  // already cleared for this change. Saves without ever showing the dialog.
  useEffect(() => {
    if (!autoKeepDraft) return;
    void saveRetime("draft");
  }, [autoKeepDraft, pendingChange]);

  if (!pendingChange || autoKeepDraft) return null;

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
          <AlertDialogTitle>
            {isDelete ? "Delete this shift?" : "Publish this change?"}
          </AlertDialogTitle>
          {/* "Might", not "will": whether an event actually appears depends on the agent
              having that position switched on in their sync settings, or an admin having
              enforced it. Publishing a position an agent has disabled succeeds and creates
              nothing, which is correct and would otherwise read as a failure. */}
          <AlertDialogDescription>
            {isDelete
              ? "You shrank the shift past its minimum length, which is taken as wanting it gone. This cannot be undone."
              : "Cancel to undo the change. Publishing might also update the agent's Google Calendar, depending on their sync settings."}
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
          {/* Three ways out of a retime: undo it, save it unpublished, or publish it.
              Cancel sits leftmost and quietest — it is the one that throws work away. */}
          <Button
            variant="ghost"
            className="h-[34px] rounded-lg px-3.5 text-[13px] font-medium text-muted-foreground"
            disabled={busy}
            onClick={onCancel}
          >
            {isDelete ? "Keep shift" : "Cancel"}
          </Button>
          {!isDelete && (
            <Button
              variant="outline"
              className="h-[34px] rounded-lg px-3.5 text-[13px] font-medium"
              disabled={busy}
              onClick={() => saveRetime("draft")}
            >
              {busy ? "Saving…" : "Keep as draft"}
            </Button>
          )}
          {isDelete ? (
            <Button
              className="h-[34px] rounded-lg bg-destructive px-3.5 text-[13px] font-semibold text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={confirmDelete}
            >
              {busy ? "Deleting…" : "Delete shift"}
            </Button>
          ) : (
            <Button
              className="h-[34px] rounded-lg px-3.5 text-[13px] font-semibold"
              disabled={busy}
              onClick={() => saveRetime("published")}
            >
              {busy ? "Saving…" : "Publish change"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default PendingChangePrompt;
