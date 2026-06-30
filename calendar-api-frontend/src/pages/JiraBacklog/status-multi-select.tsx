import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { badgeClasses } from "./badges";

/**
 * A dropdown checklist of statuses, used to choose which statuses the "To Review" view
 * shows. Generic: takes the available statuses + the current selection. Toggling a row
 * keeps the menu open (onSelect preventDefault) so several can be flipped at once.
 */
export function StatusMultiSelect({
  options,
  selected,
  onChange,
  className,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const toggle = (status: string) =>
    onChange(
      selected.includes(status)
        ? selected.filter((s) => s !== status)
        : [...selected, status],
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <ListFilter className="h-4 w-4" />
          Statuses
          <span className="ml-1 rounded bg-muted px-1.5 text-xs font-medium tabular-nums">
            {selected.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[70] w-56">
        <DropdownMenuLabel>Statuses to show</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={selected.includes(status)}
            onCheckedChange={() => toggle(status)}
            onSelect={(e) => e.preventDefault()}
          >
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                badgeClasses("status", status) || "text-foreground",
              )}
            >
              {status}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onChange([...options]);
          }}
          className="justify-center text-xs text-muted-foreground"
        >
          Select all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
