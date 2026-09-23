import { useState } from "react";
import { CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SortedCalendar } from "@/types/shiftTypes";
import { collectDrafts, countDrafts } from "../scheduleUtils";
import {
  BatchProgress,
  publishShiftsInBatches,
} from "../shift-dialogs/shiftRequests";

type PublishDraftsBarProps = {
  shifts: SortedCalendar;
  /**
   * Refetch the day, so the published shifts come back with their calendar events. Called
   * whatever the outcome — see `handlePublish`.
   */
  onPublished: () => void;
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
 * Admin-only, like every other write control on this page — the caller decides whether to
 * render it.
 */
const PublishDraftsBar = ({ shifts, onPublished }: PublishDraftsBarProps) => {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const publishing = progress !== null;
  const draftCount = countDrafts(shifts);

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
   */
  const handlePublish = async () => {
    const ids = collectDrafts(shifts).map((shift) => shift._id);
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
      setProgress(null);
      onPublished();
    }
  };

  return (
    <div className="mx-5 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-warn/35 bg-warn-bg px-3.5 py-2.5">
      <CloudUpload size={16} className="shrink-0 text-warn" />
      <div className="min-w-0 text-[12.5px] leading-tight">
        <span className="font-semibold">
          {publishing
            ? `Publishing ${progress.done} of ${progress.total}…`
            : `${draftCount} unpublished ${draftCount === 1 ? "shift" : "shifts"}`}
        </span>
        <span className="text-muted-foreground">
          {" "}
          — not on anyone&apos;s calendar until you publish.
        </span>
      </div>
      <Button
        className="ml-auto h-[30px] px-3 text-[12.5px]"
        onClick={handlePublish}
        disabled={publishing}
      >
        {publishing ? "Publishing…" : "Publish all"}
      </Button>
    </div>
  );
};

export default PublishDraftsBar;
