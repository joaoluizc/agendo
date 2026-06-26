import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

/**
 * A select styled to match the app's shadcn dropdowns, but built on Radix Popover rather
 * than Radix Select on purpose: Select locks body scroll (react-remove-scroll), which inside
 * the fixed detail panel shifts the layout and misplaces the options on classic (Windows)
 * scrollbars. Popover is non-modal (no scroll lock) and its content sits above the panel via
 * z-[70]. Options may be plain strings or {value,label} pairs; pass `clearable` to offer a
 * blank "—" choice.
 */
export function PrettySelect({
  value,
  options,
  onChange,
  placeholder = "—",
  clearable = false,
  triggerClassName,
}: {
  value: string;
  options: readonly (string | Opt)[];
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const opts: Opt[] = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const current = opts.find((o) => o.value === value);

  const select = (v: string) => {
    if (v !== value) onChange(v);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring",
            triggerClassName,
          )}
        >
          <span className={cn("truncate", !current && "text-muted-foreground")}>
            {current ? current.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="z-[70] max-h-72 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
      >
        {clearable && (
          <OptionRow selected={!value} onSelect={() => select("")}>
            <span className="text-muted-foreground">{placeholder}</span>
          </OptionRow>
        )}
        {opts.map((o) => (
          <OptionRow key={o.value} selected={o.value === value} onSelect={() => select(o.value)}>
            {o.label}
          </OptionRow>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function OptionRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        selected && "bg-accent/50 font-medium",
      )}
    >
      <span className="truncate">{children}</span>
      {selected && <Check className="absolute right-2 h-4 w-4" />}
    </button>
  );
}
