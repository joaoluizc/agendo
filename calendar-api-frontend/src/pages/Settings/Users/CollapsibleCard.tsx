import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CollapsibleCardProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Shown in the header while collapsed, so a closed card still says what's inside. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  titleClassName?: string;
  /** The card's body: CardContent, a footer band — whatever would follow a CardHeader. */
  children: ReactNode;
};

/**
 * A Card whose header toggles its body, for the agent detail on Settings → Users.
 *
 * Collapsed, it's a single row (title, summary, chevron) and the whole row is the button.
 * Open, it reads like a plain CardHeader; the description sits outside the button so a
 * screen reader announces the toggle by its title alone.
 *
 * The body stays mounted while hidden. The preferences card depends on that: its draft
 * lives in Users, but the editor only reads `initialHtml` on mount, so unmounting it would
 * show the saved note over an unsaved draft on reopen. It also keeps each card's fetches
 * and local state where they were.
 *
 * Hand-rolled like JiraBacklog's CollapsibleSection — Radix Collapsible isn't installed.
 */
export default function CollapsibleCard({
  title,
  description,
  summary,
  defaultOpen = false,
  className,
  titleClassName,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <Card className={cn("overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={cn(
          "group flex w-full items-center gap-3 px-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          open ? "pt-6" : "py-5 transition-colors hover:bg-muted/40"
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-semibold leading-none tracking-tight",
            titleClassName
          )}
        >
          {title}
        </span>
        {!open && summary && (
          <span className="min-w-0 max-w-[60%] truncate text-[12px] text-muted-foreground">
            {summary}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
            !open && "-rotate-90"
          )}
        />
      </button>
      <div id={bodyId} hidden={!open}>
        <div className="px-6 pb-6 pt-1.5">
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {children}
      </div>
    </Card>
  );
}
