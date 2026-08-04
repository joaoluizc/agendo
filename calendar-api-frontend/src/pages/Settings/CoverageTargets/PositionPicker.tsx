import { useState } from "react";
import { Check, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Position } from "@/types/positionTypes";
import { cn } from "@/lib/utils";

type PositionPickerProps = {
  positions: Position[];
  selectedIds: string[];
  /** Position id -> the name of another meter already counting it, for the hint. */
  claimedBy: Map<string, string>;
  onToggle: (positionId: string) => void;
};

/**
 * Searchable multi-select for a meter's positions.
 *
 * A position may belong to more than one meter — the "in <meter>" note is a heads-up,
 * not a lock, since the same shift can legitimately count toward two things.
 */
const PositionPicker = ({
  positions,
  selectedIds,
  claimedBy,
  onToggle,
}: PositionPickerProps) => {
  const [open, setOpen] = useState(false);
  const selected = new Set(selectedIds);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-[30px] items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-[12px] text-muted-foreground hover:bg-muted"
        >
          <Plus size={13} />
          Add position
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] rounded-[10px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search positions…" className="text-[13px]" />
          <CommandList className="max-h-[224px]">
            <CommandEmpty>No position matches that search.</CommandEmpty>
            <CommandGroup className="p-1.5">
              {positions.map((position) => {
                const id = String(position._id);
                const isSelected = selected.has(id);
                const otherMeter = claimedBy.get(id);
                return (
                  <CommandItem
                    key={id}
                    value={position.name}
                    // Keep the list open so several can be picked in one go.
                    onSelect={() => onToggle(id)}
                    className={cn(
                      "gap-[9px] rounded-[7px] px-2.5 py-2",
                      isSelected && "bg-muted"
                    )}
                  >
                    <span
                      className="h-[9px] w-[9px] shrink-0 rounded-full"
                      style={{ backgroundColor: position.color }}
                    />
                    <span
                      className={cn(
                        "truncate text-[12.5px]",
                        isSelected && "font-semibold"
                      )}
                    >
                      {position.name}
                    </span>
                    {otherMeter && !isSelected && (
                      <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground">
                        in {otherMeter}
                      </span>
                    )}
                    {isSelected && (
                      <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default PositionPicker;
