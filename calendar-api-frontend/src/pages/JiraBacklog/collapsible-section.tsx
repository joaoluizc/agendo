import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A titled, collapsible section for the detail panel. The whole header row is the toggle;
 * the title is rendered prominently (foreground, slightly larger) and a chevron rotates to
 * show open/closed. Hand-rolled to match the panel's other native controls (no Radix), so
 * there's no portal/scroll-lock to fight inside the fixed slide-over.
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t pt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h3>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open ? "" : "-rotate-90",
          )}
        />
      </button>
      {open && <div className="pt-4">{children}</div>}
    </section>
  );
}
