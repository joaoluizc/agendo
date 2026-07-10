import { Columns3 } from "lucide-react";
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
import { ColumnDesc } from "./types";

/**
 * A dropdown checklist of table columns, used to choose which columns the "Open" / "All"
 * views show. Same interaction pattern as StatusMultiSelect (toggling keeps the menu open).
 * State is a list of *hidden* column ids — empty means everything visible, so new columns
 * added later show up by default for everyone. At least one column always stays visible.
 */
export function ColumnsSelect({
  options,
  hidden,
  onChange,
  className,
}: {
  options: readonly ColumnDesc[];
  hidden: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const visibleCount = options.length - hidden.length;

  const toggle = (id: string) => {
    if (hidden.includes(id)) onChange(hidden.filter((h) => h !== id));
    else if (visibleCount > 1) onChange([...hidden, id]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Columns3 className="h-4 w-4" />
          Columns
          <span className="ml-1 rounded bg-muted px-1.5 text-xs font-medium tabular-nums">
            {visibleCount}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[70] w-56">
        <DropdownMenuLabel>Columns to show</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((desc) => (
          <DropdownMenuCheckboxItem
            key={desc.id}
            checked={!hidden.includes(desc.id)}
            onCheckedChange={() => toggle(desc.id)}
            onSelect={(e) => e.preventDefault()}
          >
            {desc.header}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onChange([]);
          }}
          className="justify-center text-xs text-muted-foreground"
        >
          Show all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
