import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDialogContentElement } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Position } from "@/types/positionTypes";
import { CoverageMeter } from "@/types/coverageTypes";
import { cn } from "@/lib/utils";
import { positionDisplay } from "../scheduleUtils";

type PositionComboboxProps = {
  positions: Position[];
  value: string;
  onChange: (positionId: string) => void;
  meters: CoverageMeter[];
};

/**
 * Single-select position picker, showing which coverage meter each position feeds.
 *
 * The meter note is the reason this isn't a plain `Select`: picking a position is
 * really picking what the shift will count toward, and that used to be invisible until
 * the coverage row moved after saving.
 */
const PositionCombobox = ({
  positions,
  value,
  onChange,
  meters,
}: PositionComboboxProps) => {
  const [open, setOpen] = useState(false);
  // Null outside a dialog (the Settings page), where portalling to body is correct.
  const dialogElement = useDialogContentElement();

  /** Position id -> the first meter counting it. */
  const meterNames = useMemo(() => {
    const byPosition = new Map<string, string>();
    meters.forEach((meter) =>
      meter.positionIds.forEach((positionId) => {
        const key = String(positionId);
        if (!byPosition.has(key)) byPosition.set(key, meter.name);
      })
    );
    return byPosition;
  }, [meters]);

  const selected = positions.find((position) => String(position._id) === String(value));
  const display = positionDisplay(selected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center gap-[9px] rounded-lg border px-2.5 text-[12.5px] font-semibold",
            open ? "border-primary" : "border-border hover:bg-muted"
          )}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
            style={{
              backgroundColor: display.color,
              opacity: display.tone === "quiet" ? 0.5 : 1,
            }}
          />
          <span className="min-w-0 flex-1 truncate text-left">
            {selected ? display.name : "Select a position"}
          </span>
          <ChevronsUpDown size={13} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] rounded-[10px] p-0"
        align="start"
        // Portalled into the dialog rather than to body, so the wheel isn't blocked by
        // the dialog's scroll lock and focus can settle in the search input. The dialog
        // then also becomes the collision boundary: it is a containing block (it has a
        // transform) and clips overflow, so without this the list could be positioned
        // into viewport space that the dialog cuts off. Flipping upward from a trigger
        // near the bottom of the rail is exactly what we want.
        container={dialogElement}
        collisionBoundary={dialogElement ?? undefined}
        collisionPadding={8}
      >
        <Command>
          <CommandInput placeholder="Search positions…" className="text-[13px]" />
          <CommandList className="max-h-[216px]">
            <CommandEmpty>No position matches that search.</CommandEmpty>
            <CommandGroup className="p-1.5">
              {positions.map((position) => {
                const id = String(position._id);
                const isSelected = id === String(value);
                const option = positionDisplay(position);
                const meterName = meterNames.get(id);
                return (
                  <CommandItem
                    key={id}
                    value={position.name}
                    onSelect={() => {
                      onChange(id);
                      setOpen(false);
                    }}
                    className={cn(
                      "gap-[9px] rounded-[7px] px-2.5 py-2",
                      isSelected && "bg-muted"
                    )}
                  >
                    <span
                      className="h-[9px] w-[9px] shrink-0 rounded-[2px]"
                      style={{
                        backgroundColor: option.color,
                        opacity: option.tone === "quiet" ? 0.5 : 1,
                      }}
                    />
                    <span
                      className={cn(
                        "truncate text-[12.5px]",
                        isSelected && "font-semibold"
                      )}
                      title={position.name}
                    >
                      {position.name}
                    </span>
                    {meterName && (
                      <span className="ml-auto shrink-0 truncate text-[10.5px] text-muted-foreground">
                        {meterName}
                      </span>
                    )}
                    {isSelected && (
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0 text-primary",
                          !meterName && "ml-auto"
                        )}
                      />
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

export default PositionCombobox;
