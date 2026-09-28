import { Markup } from "interweave";
import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Typography for preferences HTML, shared by the hover card and the editor so a note reads
 * the same in both. Written as arbitrary variants because the Tailwind typography plugin
 * isn't installed and preflight strips list bullets.
 */
export const PREFERENCES_PROSE = cn(
  "text-[12.5px] leading-snug",
  "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5 [&_li>p]:my-0",
  "[&_strong]:font-semibold [&_em]:italic"
);

/** Whether an agent has a note worth showing. `preferences` only reaches admins. */
export const hasPreferences = (user?: { preferences?: string }) =>
  !!user?.preferences?.trim();

/**
 * A preferences note, rendered.
 *
 * Through interweave's `Markup`, as Google event descriptions already are, which parses
 * the HTML into React elements and drops tags and attributes outside its allowlist — so a
 * stored note can never run script, whatever ends up in the field.
 */
export const PreferencesContent = ({
  html,
  className,
}: {
  html: string;
  className?: string;
}) => (
  <Markup
    content={html}
    tagName="div"
    className={cn(PREFERENCES_PROSE, "break-words", className)}
  />
);

/** The small cue beside a name that has a note to hover. */
export const PreferencesIcon = ({ className }: { className?: string }) => (
  <StickyNote
    aria-label="Has preferences"
    className={cn("h-3 w-3 shrink-0 text-muted-foreground", className)}
  />
);
