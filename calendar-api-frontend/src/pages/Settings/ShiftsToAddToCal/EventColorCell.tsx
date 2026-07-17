import { useState } from "react";
import { Row } from "@tanstack/react-table";
import { Position } from "@/types/positionTypes.ts";
import { useUserSettings } from "@/providers/useUserSettings.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ColorSwatch, ColorPickerContent } from "./ColorPicker.tsx";
import { hexForColorId } from "./eventColors.ts";

// The "Event color" cell. A row's sync state is driven by the live table
// selection (rowSelection), not row.original.sync, so we read row.getIsSelected().
export function EventColorCell({ row }: { row: Row<Position> }) {
  const { positionsToSync, setPositionsToSync, defaultEventColorId } =
    useUserSettings();
  const [pickerOpen, setPickerOpen] = useState(false);
  const position = row.original;

  const isSynced = row.getIsSelected() || !!position.enforceSync;
  const defaultActive = !!defaultEventColorId;
  const disabled = !isSynced || defaultActive;

  // What the circle shows: crossed-off when unsynced; the account default when
  // the "one color for all" override is on; otherwise this row's chosen color.
  const shownColorId = !isSynced
    ? null
    : defaultActive
      ? defaultEventColorId
      : (position.colorId ?? null);
  const hex = hexForColorId(shownColorId);

  const updateColor = (colorId: string | null) => {
    setPositionsToSync(
      positionsToSync.map((p) =>
        p._id === position._id ? { ...p, colorId } : p
      )
    );
    setPickerOpen(false);
  };

  if (disabled) {
    const reason = !isSynced
      ? "This shift isn't synced, so it has no calendar color. Enable sync to pick one."
      : "One color is applied to all shifts. Change it from the ⋯ menu at the top of this panel.";
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-not-allowed opacity-70">
              <ColorSwatch hex={hex} />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{reason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose event color"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ColorSwatch hex={hex} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <ColorPickerContent
          value={position.colorId ?? null}
          excludeId={position._id}
          positionsToSync={positionsToSync}
          onSelect={updateColor}
        />
      </PopoverContent>
    </Popover>
  );
}
