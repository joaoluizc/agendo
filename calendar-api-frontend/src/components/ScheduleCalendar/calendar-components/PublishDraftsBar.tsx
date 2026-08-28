import { useState } from "react";
import { CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SortedCalendar } from "@/types/shiftTypes";
import { collectDrafts, countDrafts } from "../scheduleUtils";
import { publishShifts } from "../shift-dialogs/shiftRequests";

type PublishDraftsBarProps = {
  shifts: SortedCalendar;
  /** Refetch the day, so the published shifts come back with their calendar events. */
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
  const [publishing, setPublishing] = useState(false);
  const draftCount = countDrafts(shifts);

  if (draftCount === 0) return null;

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const result = await publishShifts(
        collectDrafts(shifts).map((shift) => shift._id)
      );

      // A shift can publish and still fail to reach a calendar. Saying so matters: the
      // shift is real either way, so silence would leave an agent without the event and
      // nobody aware of it.
      if (result.errors?.length) {
        toast.warning(
          `${result.published} published, ${result.errors.length} did not reach Google Calendar`
        );
      } else {
        toast.success(result.message || `${result.published} shifts published`);
      }
      onPublished();
    } catch (error) {
      console.error("Error publishing shifts:", error);
      toast.error("Failed to publish shifts");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="mx-5 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-warn/35 bg-warn-bg px-3.5 py-2.5">
      <CloudUpload size={16} className="shrink-0 text-warn" />
      <div className="min-w-0 text-[12.5px] leading-tight">
        <span className="font-semibold">
          {draftCount} unpublished {draftCount === 1 ? "shift" : "shifts"}
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
