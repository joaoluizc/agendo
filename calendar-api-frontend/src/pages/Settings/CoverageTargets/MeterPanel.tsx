import { ChevronRight, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CoverageMeter } from "@/types/coverageTypes";
import { Position } from "@/types/positionTypes";
import { DEFAULT_COLORS } from "../ManagePositions/ManagePositions";
import { utcTargetsToLocal, localTargetsToUtc } from "@/utils/coverageTargets";
import PositionPicker from "./PositionPicker";
import TargetGrid from "./TargetGrid";
import { cn } from "@/lib/utils";

type MeterPanelProps = {
  meter: CoverageMeter;
  positions: Position[];
  claimedBy: Map<string, string>;
  isOpen: boolean;
  onToggleOpen: () => void;
  onChange: (meter: CoverageMeter) => void;
  onDelete: () => void;
};

const MeterPanel = ({
  meter,
  positions,
  claimedBy,
  isOpen,
  onToggleOpen,
  onChange,
  onDelete,
}: MeterPanelProps) => {
  const positionsById = new Map(positions.map((p) => [String(p._id), p]));
  // A position deleted in Manage Positions leaves its id behind on the meter; drop
  // those here rather than rendering a chip for something that no longer exists.
  const chips = meter.positionIds
    .map((id) => positionsById.get(String(id)))
    .filter((p): p is Position => Boolean(p));

  const summary =
    chips.length === 0
      ? "no positions assigned yet"
      : `${chips.length} position${chips.length === 1 ? "" : "s"} · ${chips
          .map((p) => p.name)
          .join(", ")}`;

  const togglePosition = (positionId: string) => {
    const has = meter.positionIds.some((id) => String(id) === positionId);
    onChange({
      ...meter,
      positionIds: has
        ? meter.positionIds.filter((id) => String(id) !== positionId)
        : [...meter.positionIds, positionId],
    });
  };

  return (
    <div
      className={cn(
        "rounded-[10px] border border-border",
        isOpen ? "bg-card" : "bg-band"
      )}
    >
      <div className="relative flex items-center gap-3 p-4">
        <button
          type="button"
          aria-label={isOpen ? "Collapse meter" : "Expand meter"}
          className="flex h-[22px] w-[22px] items-center justify-center text-muted-foreground"
          onClick={onToggleOpen}
        >
          <ChevronRight
            size={16}
            className={cn("transition-transform duration-150", isOpen && "rotate-90")}
          />
        </button>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Meter color"
              className="h-[15px] w-[15px] shrink-0 cursor-pointer rounded-[5px] border border-black/20"
              style={{ backgroundColor: meter.color }}
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto rounded-[10px] p-3" align="start">
            <div className="mb-2 text-[12px] font-semibold">Meter color</div>
            <div className="flex gap-2">
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  className={cn(
                    "h-[30px] w-[30px] rounded-full",
                    meter.color.toLowerCase() === color.toLowerCase() &&
                      "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => onChange({ ...meter, color })}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Input
          value={meter.name}
          aria-label="Meter name"
          className="h-8 w-[220px] rounded-[7px] border-transparent bg-transparent text-[14px] font-semibold"
          onChange={(e) => onChange({ ...meter, name: e.target.value })}
        />

        <div className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
          {summary}
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Delete meter"
              className="h-[30px] w-[30px] shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete meter</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{meter.name}&quot;? Its
                coverage row will stop appearing on the schedule page once you
                save.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {isOpen && (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-[18px]">
          <div className="flex flex-col gap-2">
            <div>
              <div className="text-[12.5px] font-semibold">
                Positions counted
              </div>
              <div className="text-[11.5px] text-muted-foreground">
                shifts on these positions add to this meter
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {chips.length === 0 && (
                <span className="text-[12px] text-muted-foreground">
                  No positions yet
                </span>
              )}
              {chips.map((position) => (
                <span
                  key={String(position._id)}
                  className="flex h-[30px] items-center gap-2 rounded-lg border py-0 pl-[11px] pr-1.5 text-[12px] font-semibold"
                  style={{
                    borderColor: position.color,
                    backgroundColor: `color-mix(in srgb, ${position.color} 14%, transparent)`,
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: position.color }}
                  />
                  {position.name}
                  <button
                    type="button"
                    aria-label={`Remove ${position.name}`}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded text-muted-foreground hover:bg-foreground/10"
                    onClick={() => togglePosition(String(position._id))}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <PositionPicker
                positions={positions}
                selectedIds={meter.positionIds.map(String)}
                claimedBy={claimedBy}
                onToggle={togglePosition}
              />
            </div>
          </div>

          <TargetGrid
            local={utcTargetsToLocal(meter.targets)}
            color={meter.color}
            onChange={(local) =>
              onChange({ ...meter, targets: localTargetsToUtc(local) })
            }
          />
        </div>
      )}
    </div>
  );
};

export default MeterPanel;
