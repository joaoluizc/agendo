import { useMemo, useState } from "react";
import { Info, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUserSettings } from "@/providers/useUserSettings";
import { CoverageMeter } from "@/types/coverageTypes";
import { DEFAULT_COLORS } from "../ManagePositions/ManagePositions";
import { emptyTargets } from "@/utils/coverageTargets";
import { saveCoverageMeters } from "./coverageUtils";
import MeterPanel from "./MeterPanel";

/** Positions nobody expects a coverage row for, so they don't trip the notice. */
const UNWATCHED_EXEMPT = /break|lunch|unavailab|meeting/i;

/**
 * The notice names the positions no meter counts. This instance has ~66 positions, so
 * naming them all turns a one-line hint into a paragraph — list a handful and count
 * the rest.
 */
const UNWATCHED_SHOWN = 8;

/**
 * Settings → Coverage Targets. Admin-only; the parent gates on `type === "admin"`
 * and the API refuses non-admins independently.
 *
 * Every edit is local until Save, which replaces the whole list in one request —
 * that is why the meters live in `useUserSettings` alongside `positionsToSync`:
 * the page's existing unsaved-changes blocker diffs them against the saved baseline.
 */
export default function CoverageTargets() {
  const {
    allPositions,
    coverageMeters,
    originalCoverageMeters,
    setCoverageMeters,
    setOriginalCoverageMeters,
  } = useUserSettings();

  const [openMeterIds, setOpenMeterIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty =
    JSON.stringify(coverageMeters) !== JSON.stringify(originalCoverageMeters);

  /** position id -> the first meter counting it, for the picker's "in <meter>" note. */
  const claimedBy = useMemo(() => {
    const map = new Map<string, string>();
    coverageMeters.forEach((meter) => {
      meter.positionIds.forEach((id) => {
        if (!map.has(String(id))) map.set(String(id), meter.name);
      });
    });
    return map;
  }, [coverageMeters]);

  const unwatched = useMemo(() => {
    const counted = new Set(
      coverageMeters.flatMap((meter) => meter.positionIds.map(String))
    );
    return allPositions.filter(
      (position) =>
        !counted.has(String(position._id)) &&
        !UNWATCHED_EXEMPT.test(position.name)
    );
  }, [allPositions, coverageMeters]);

  const addMeter = () => {
    // Temporary id: the server treats any non-ObjectId as "insert this one".
    const _id = `new-${Date.now()}`;
    const meter: CoverageMeter = {
      _id,
      name: `Meter ${coverageMeters.length + 1}`,
      color: DEFAULT_COLORS[coverageMeters.length % DEFAULT_COLORS.length],
      positionIds: [],
      targets: emptyTargets(),
    };
    setCoverageMeters([...coverageMeters, meter]);
    setOpenMeterIds([...openMeterIds, _id]);
  };

  const updateMeter = (updated: CoverageMeter) =>
    setCoverageMeters(
      coverageMeters.map((meter) =>
        meter._id === updated._id ? updated : meter
      )
    );

  const deleteMeter = (meterId: string) =>
    setCoverageMeters(coverageMeters.filter((meter) => meter._id !== meterId));

  const reset = () => setCoverageMeters(originalCoverageMeters);

  const save = async () => {
    const unnamed = coverageMeters.find((meter) => !meter.name.trim());
    if (unnamed) {
      toast.error("Every meter needs a name.");
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveCoverageMeters(coverageMeters);
      setCoverageMeters(saved);
      setOriginalCoverageMeters(saved);
      toast.success("Coverage targets saved.");
    } catch (error) {
      console.error("Error saving coverage targets:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save coverage targets."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="scroll-mt-20 overflow-hidden" id="coverage-targets">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Coverage Targets</CardTitle>
          <CardDescription>
            Define what the schedule watches. Each meter groups the positions
            that count toward it and sets how many agents you want on it, hour by
            hour. The schedule page flags any half hour that falls below the
            target.
          </CardDescription>
        </div>
        <Button className="shrink-0 gap-1.5" onClick={addMeter}>
          <Plus size={16} />
          Add Meter
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {coverageMeters.length === 0 && (
          <div className="rounded-[9px] border border-dashed border-border px-3.5 py-6 text-center text-[12.5px] text-muted-foreground">
            No coverage meters yet. Add one to start tracking coverage on the
            schedule page.
          </div>
        )}

        {coverageMeters.map((meter) => (
          <MeterPanel
            key={meter._id}
            meter={meter}
            positions={allPositions}
            claimedBy={claimedBy}
            isOpen={openMeterIds.includes(meter._id)}
            onToggleOpen={() =>
              setOpenMeterIds((prev) =>
                prev.includes(meter._id)
                  ? prev.filter((id) => id !== meter._id)
                  : [...prev, meter._id]
              )
            }
            onChange={updateMeter}
            onDelete={() => deleteMeter(meter._id)}
          />
        ))}

        {unwatched.length > 0 && (
          <div className="flex items-start gap-2 rounded-[9px] border border-dashed border-border px-3.5 py-[11px] text-[12px] text-muted-foreground">
            <Info size={14} className="mt-px shrink-0" />
            <span>
              {unwatched
                .slice(0, UNWATCHED_SHOWN)
                .map((position) => position.name)
                .join(", ")}
              {unwatched.length > UNWATCHED_SHOWN &&
                ` and ${unwatched.length - UNWATCHED_SHOWN} more`}{" "}
              {unwatched.length === 1 ? "is" : "are"} not counted by any meter,
              so {unwatched.length === 1 ? "it won't" : "they won't"} appear in
              the schedule&apos;s coverage rows.
            </span>
          </div>
        )}
      </CardContent>

      <div className="flex items-center justify-between gap-4 border-t border-border bg-band px-[22px] py-3.5">
        <span className="text-[12px] text-muted-foreground">
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={reset} disabled={!isDirty || isSaving}>
            Reset
          </Button>
          <Button onClick={save} disabled={!isDirty || isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
