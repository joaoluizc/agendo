import { Eye, EyeOff, ListEnd, RotateCcw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HoursReportRow } from "./api";
import {
  CopyLayout,
  EMPTY_LAYOUT,
  addBlankAfter,
  buildCopyEntries,
  removeBlank,
  toggleHidden,
} from "./copyLayout";

type CopyLayoutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rows in the order they are on screen — the copy follows the visible sort. */
  rows: HoursReportRow[];
  layout: CopyLayout;
  onLayoutChange: (layout: CopyLayout) => void;
  /**
   * Label of the column being copied, e.g. "Tickets" — or null when opened from "Adjust",
   * where confirming saves the layout without touching the clipboard.
   */
  columnLabel: string | null;
  onConfirm: () => void;
};

/** Fixed-width so the controls, line numbers and names stay in columns down the list. */
const ACTIONS = "flex w-11 shrink-0 items-center gap-1";
const LINE_NO = "w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground";
const ICON_BUTTON = "text-muted-foreground hover:text-foreground";

/**
 * Line-by-line preview of what the clipboard is about to receive, with controls to pad it
 * out so it lines up with a sheet that has more rows than the report does.
 *
 * The list is a preview of *positions*, not of values: it always shows agent names even
 * when the column being copied is numeric, because names are what you match against the
 * sheet when deciding where a gap belongs. The count in the footer is the thing to check
 * against the sheet's own row count.
 *
 * Opened only for the first copy of a given view — after that the layout is reused
 * silently, so the common case (paste each column in turn) stays at one click per column.
 */
export default function CopyLayoutDialog({
  open,
  onOpenChange,
  rows,
  layout,
  onLayoutChange,
  columnLabel,
  onConfirm,
}: CopyLayoutDialogProps) {
  const entries = buildCopyEntries(rows, layout);
  const hidden = new Set(layout.hidden);
  const blankCount = entries.filter((e) => e.kind === "blank").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-full max-w-sm flex-col gap-3 p-4">
        <div className="grid gap-1">
          <DialogTitle className="text-base">
            {columnLabel ? `Line up the ${columnLabel} copy` : "Adjust copy layout"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Add blank lines where your sheet has rows this report doesn’t. Only the copy
            changes — the report is untouched.
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <ol className="divide-y">
            {entries.map((entry, i) => {
              const lineNumber = i + 1;

              if (entry.kind === "blank") {
                return (
                  <li
                    key={`blank-${entry.after}-${entry.index}`}
                    className="flex items-center gap-2 bg-muted/40 px-2 py-1"
                  >
                    <span className={ACTIONS}>
                      <button
                        type="button"
                        onClick={() => onLayoutChange(removeBlank(layout, entry.after))}
                        aria-label="Remove this blank line"
                        title="Remove this blank line"
                        className={ICON_BUTTON}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                    <span className={LINE_NO}>{lineNumber}</span>
                    <span className="flex-1 text-xs italic text-muted-foreground">blank</span>
                  </li>
                );
              }

              const { row } = entry;
              return (
                <li key={row.id} className="flex items-center gap-2 px-2 py-1">
                  <span className={ACTIONS}>
                    <button
                      type="button"
                      onClick={() => onLayoutChange(addBlankAfter(layout, row.id))}
                      aria-label={`Add a blank line below ${row.name}`}
                      title={`Add a blank line below ${row.name}`}
                      className={ICON_BUTTON}
                    >
                      <ListEnd className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onLayoutChange(toggleHidden(layout, row.id))}
                      aria-label={`Leave ${row.name} out of the copy`}
                      title={`Leave ${row.name} out of the copy`}
                      className={ICON_BUTTON}
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className={LINE_NO}>{lineNumber}</span>
                  <span className="flex-1 truncate text-xs">{row.name}</span>
                </li>
              );
            })}

            {/* Hidden agents keep a place in the list so they can be brought back. */}
            {rows
              .filter((row) => hidden.has(row.id))
              .map((row) => (
                <li
                  key={`hidden-${row.id}`}
                  className="flex items-center gap-2 bg-muted/20 px-2 py-1"
                >
                  <span className={ACTIONS}>
                    <button
                      type="button"
                      onClick={() => onLayoutChange(toggleHidden(layout, row.id))}
                      aria-label={`Put ${row.name} back in the copy`}
                      title={`Put ${row.name} back in the copy`}
                      className={ICON_BUTTON}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className={LINE_NO}>—</span>
                  <span className="flex-1 truncate text-xs text-muted-foreground line-through">
                    {row.name}
                  </span>
                </li>
              ))}
          </ol>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              {entries.length} line{entries.length === 1 ? "" : "s"}
              {blankCount > 0 && ` · ${blankCount} blank`}
              {hidden.size > 0 && ` · ${hidden.size} out`}
            </span>
            <button
              type="button"
              onClick={() => onLayoutChange(EMPTY_LAYOUT)}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
          <Button type="button" size="sm" onClick={onConfirm}>
            {columnLabel ? `Copy ${entries.length}` : `Save (${entries.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
