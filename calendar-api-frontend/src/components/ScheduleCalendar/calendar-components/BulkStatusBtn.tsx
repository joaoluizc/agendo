import { useEffect, useMemo, useState } from "react";
import { CloudOff, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSchedule } from "@/providers/useSchedule";
import { isDraft } from "../scheduleUtils";
import {
  applyShiftChanges,
  publishShifts,
  unpublishShifts,
} from "../shift-dialogs/shiftRequests";

type BulkStatusBtnProps = {
  mode: "publish" | "unpublish";
};

/**
 * Publish or unpublish the selected shifts.
 *
 * One component for both directions: the two differ only in which half of the selection
 * they apply to and which endpoint they call, and splitting them into two files would have
 * meant maintaining the same grid-patching and error handling twice.
 *
 * Only the applicable half of the selection is sent — drafts to publish, published shifts
 * to unpublish — so a mixed selection does the sensible thing instead of being refused. The
 * count in the tooltip is that half, not the whole selection, which is also why the button
 * disables when there is nothing of its own kind selected.
 */
const BulkStatusBtn = ({ mode }: BulkStatusBtnProps) => {
  const {
    isBulkSelectorActive,
    bulkSelectedShifts,
    shifts,
    events,
    setShifts,
    setEvents,
    exitBulkSelect,
  } = useSchedule();
  const [busy, setBusy] = useState(false);

  const publishing = mode === "publish";

  const applicable = useMemo(
    () =>
      bulkSelectedShifts.filter((shift) =>
        publishing ? isDraft(shift) : !isDraft(shift)
      ),
    [bulkSelectedShifts, publishing]
  );

  const run = async () => {
    if (busy || applicable.length === 0) return;
    setBusy(true);
    const ids = applicable.map((shift) => shift._id);

    try {
      const result = publishing
        ? await publishShifts(ids)
        : await unpublishShifts(ids);

      // Patch from the response rather than refetching: it carries each shift's fresh sync
      // state, which is what the Google Calendar under-lane renders.
      const next = applyShiftChanges({
        shifts,
        events,
        removed: applicable,
        created: result.data,
      });
      setShifts(next.shifts);
      setEvents(next.events);

      if (result.errors?.length) {
        toast.warning(
          publishing
            ? `Published, but ${result.errors.length} did not reach Google Calendar`
            : `Back to draft, but ${result.errors.length} calendar event(s) could not be removed`
        );
      } else {
        toast.success(result.message);
      }
    } catch (error) {
      console.error(`Error ${mode}ing shifts:`, error);
      toast.error(
        publishing ? "Could not publish shifts" : "Could not unpublish shifts",
        { description: error instanceof Error ? error.message : undefined }
      );
    } finally {
      setBusy(false);
      exitBulkSelect();
    }
  };

  const Icon = publishing ? CloudUpload : CloudOff;
  const label = publishing ? "Publish selected" : "Unpublish selected";
  const hotkey = publishing ? "p" : "u";

  /**
   * `p` publishes, `u` unpublishes, matching the existing `esc` and `delete` shortcuts.
   *
   * These need a guard the other two never bothered with: a single printable letter would
   * otherwise fire while you are typing it into the agent search box or a time field. So it
   * bails out on any editable target, and on any modifier combination — `Ctrl+P` is print
   * and must stay that way.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isBulkSelectorActive) return;
      if (event.key.toLowerCase() !== hotkey) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      ) {
        return;
      }

      event.preventDefault();
      if (applicable.length === 0) {
        toast.error(
          publishing
            ? "Select at least one draft to publish."
            : "Select at least one published shift to unpublish."
        );
        return;
      }
      void run();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            className="h-5 w-fit"
            disabled={busy || applicable.length === 0}
            onClick={run}
          >
            <Icon style={{ height: "0.9rem", width: "0.9rem" }} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col items-center justify-center gap-1">
            <p>{label}</p>
            <div className="flex items-center gap-1.5">
              <div className="h-fit w-fit rounded-md border border-solid border-zinc-400 px-1 text-zinc-400">
                {hotkey}
              </div>
              <span className="text-zinc-400">
                {applicable.length === 0
                  ? publishing
                    ? "no drafts selected"
                    : "no published selected"
                  : `${applicable.length} shift${applicable.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default BulkStatusBtn;
