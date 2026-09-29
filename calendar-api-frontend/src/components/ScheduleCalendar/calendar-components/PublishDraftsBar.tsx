import { useState } from "react";
import { CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSchedule } from "@/providers/useSchedule";
import { SortedCalendar } from "@/types/shiftTypes";
import { collectDrafts } from "../scheduleUtils";
import {
  BatchProgress,
  publishShiftsInBatches,
} from "../shift-dialogs/shiftRequests";

type PublishDraftsBarProps = {
  shifts: SortedCalendar;
  /**
   * Refetch the day, so the published shifts come back with their calendar events. Called
   * whatever the outcome — see `handlePublish` — and awaited, so the bar keeps its progress
   * up until the grid it describes is the fresh one.
   */
  onPublished: () => Promise<unknown>;
};

/**
 * The day's unpublished count, and the button that commits it.
 *
 * This exists because creating a shift no longer syncs it. Without something loud saying
 * "nine shifts are not on anyone's calendar yet", the new behaviour reads as agendo
 * quietly having stopped working: the shift is on the grid, the agent never sees it, and
 * nothing on screen explains why. So it is a full-width bar rather than a chip in the
 * toolbar, and it disappears entirely once there is nothing left to publish.
 *
 * **With drafts selected, it publishes only those** — "10 of 86 unpublished shifts
 * selected", "Publish selected". Selecting is how you say "these are ready, the rest are
 * still being worked on", and a bar that could only publish the whole day made that
 * impossible from the one place that counts drafts. A selection holding no drafts leaves
 * the bar as it was.
 *
 * Admin-only, like every other write control on this page — the caller decides whether to
 * render it.
 */
const PublishDraftsBar = ({ shifts, onPublished }: PublishDraftsBarProps) => {
  const { isBulkSelectorActive, selectedShiftIds, exitBulkSelect } =
    useSchedule();
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const publishing = progress !== null;
  const drafts = collectDrafts(shifts);
  const draftCount = drafts.length;

  // Read off the day's shifts rather than the selection itself: the selection holds the
  // shift objects as they were when clicked, while these carry the current status, and
  // they already exclude agents the location filter is hiding.
  const selectedDrafts = isBulkSelectorActive
    ? drafts.filter((shift) => selectedShiftIds.has(shift._id))
    : [];
  const publishingSelection = selectedDrafts.length > 0;

  if (draftCount === 0 && !publishing) return null;

  /**
   * Publish the day in small batches, then refetch — always.
   *
   * This once published 92 drafts in one request. The server synced every one of them,
   * but the request outlived the proxy in front of it, so the browser got a 504, reported
   * a failure, and — refetching only on success — left the bar saying "92 unpublished"
   * over a day that was fully published. Batches keep each request short, and the refetch
   * in `finally` means that whatever the network says, the grid ends up showing what the
   * server actually holds.
   *
   * The ids are taken once, here, so the counter runs against what was clicked: "3 of 10"
   * for a selection of ten, however the selection changes while it runs. And progress is
   * only cleared once the refetch has landed. Clearing it first left the bar, for as long
   * as the refetch took, announcing the pre-publish count with a live Publish all button —
   * over a day that had just been published.
   */
  const handlePublish = async () => {
    const fromSelection = publishingSelection;
    const ids = (fromSelection ? selectedDrafts : drafts).map((shift) => shift._id);
    setProgress({ done: 0, total: ids.length });
    try {
      const result = await publishShiftsInBatches(ids, setProgress);
      const unconfirmed = result.unconfirmed?.length ?? 0;
      const syncFailures = result.errors?.length ?? 0;

      if (unconfirmed && result.published === 0) {
        toast.error("Could not confirm the publish", {
          description:
            "The server did not answer. The day has been refreshed to show what was saved.",
        });
      } else if (unconfirmed) {
        // Not "failed": in the incident this fixes, every "failed" shift had in fact
        // published. The refetch below settles which is which.
        toast.warning(`${result.published} published, ${unconfirmed} not confirmed`, {
          description:
            "The server did not answer for some of them. The day has been refreshed to show what was saved.",
        });
      } else if (syncFailures) {
        // A shift can publish and still fail to reach a calendar. Saying so matters: the
        // shift is real either way, so silence would leave an agent without the event and
        // nobody aware of it.
        toast.warning(
          `${result.published} published, ${syncFailures} did not reach Google Calendar`,
          { description: result.errors?.[0]?.message }
        );
      } else {
        toast.success(result.message);
      }
    } catch (error) {
      console.error("Error publishing shifts:", error);
      toast.error("Failed to publish shifts");
    } finally {
      // The selection's job is done, the same way a publish from the selection toolbar
      // ends select mode.
      if (fromSelection) exitBulkSelect();
      try {
        await onPublished();
      } finally {
        setProgress(null);
      }
    }
  };

  const unpublished = `${draftCount} unpublished ${draftCount === 1 ? "shift" : "shifts"}`;

  return (
    <div className="mx-3 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-warn/35 bg-warn-bg px-3.5 py-2.5 md:mx-5">
      <CloudUpload size={16} className="shrink-0 text-warn" />
      <div className="min-w-0 text-[12.5px] leading-tight">
        <span className="font-semibold">
          {publishing
            ? `Publishing ${progress.done} of ${progress.total}…`
            : publishingSelection
              ? `${selectedDrafts.length} of ${unpublished} selected`
              : unpublished}
        </span>
        {/* The why, for a screen with room for it; a phone keeps the count and the button
            on one line instead. */}
        <span className="hidden text-muted-foreground sm:inline">
          {" "}
          — not on anyone&apos;s calendar until you publish.
        </span>
      </div>
      <Button
        className="ml-auto h-[30px] px-3 text-[12.5px]"
        onClick={handlePublish}
        disabled={publishing}
      >
        {publishing
          ? "Publishing…"
          : publishingSelection
            ? "Publish selected"
            : "Publish all"}
      </Button>
    </div>
  );
};

export default PublishDraftsBar;
