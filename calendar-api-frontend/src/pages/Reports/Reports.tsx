import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Copy, Info, RefreshCw, Rows3 } from "lucide-react";
import { endOfDay, format, formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTimeFormat } from "@/utils/timeFormat";
import DateRangePicker, { DateRangeValue, PresetKey, presetRange, shiftRange } from "./DateRangePicker";
import { reportsApi, HoursReportRow } from "./api";
import { usePageTitle } from "./use-page-title";
import CopyLayoutDialog from "./CopyLayoutDialog";
import {
  CopyLayout,
  EMPTY_LAYOUT,
  buildCopyEntries,
  copyText,
  isEmptyLayout,
  viewKey,
} from "./copyLayout";

type ColumnKey = "name" | "Tickets" | "Chats" | "Other" | "totalHours";
type SortState = { key: ColumnKey; direction: "asc" | "desc" } | null;

const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Agent",
  Tickets: "Tickets",
  Chats: "Chats",
  Other: "Other",
  totalHours: "Total",
};

function defaultRange(): DateRangeValue {
  return presetRange("currentQuarter", new Date())!;
}

function nextSort(current: SortState, key: ColumnKey): SortState {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null; // third click resets to the backend's default order (name asc)
}

function columnValue(row: HoursReportRow, key: ColumnKey): string | number {
  if (key === "name") return row.name;
  if (key === "totalHours") return row.totalHours;
  return row.hours[key];
}

/**
 * Header cell with two independent controls: clicking the label/chevron cycles sort
 * (asc/desc/reset), clicking the copy icon copies that column's values — as raw numbers,
 * not "12h" strings — one per line, so pasting into Google Sheets drops them straight
 * into a single column ready for SUM/AVERAGE.
 */
function SortableHead({
  columnKey,
  sort,
  onSort,
  onCopy,
  align = "left",
}: {
  columnKey: ColumnKey;
  sort: SortState;
  onSort: (key: ColumnKey) => void;
  onCopy: (key: ColumnKey) => void;
  align?: "left" | "right";
}) {
  const label = COLUMN_LABELS[columnKey];
  const active = sort?.key === columnKey;
  const SortIcon = active ? (sort!.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <div className={cn("inline-flex items-center gap-2", align === "right" && "w-full justify-end")}>
        <button
          type="button"
          onClick={() => onSort(columnKey)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground",
            align === "right" && "flex-row-reverse",
            active && "font-medium text-foreground",
          )}
        >
          {label}
          <SortIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
        <button
          type="button"
          onClick={() => onCopy(columnKey)}
          aria-label={`Copy ${label} column`}
          title={`Copy ${label} column`}
          className="text-muted-foreground opacity-70 hover:text-foreground hover:opacity-100"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </TableHead>
  );
}

/**
 * Admin-only "agent hours" report: total hours worked per agent over a date range,
 * broken into Tickets/Chats/Other, from agendo shifts only (the backend stopped reading
 * Sling once its history was copied into agendo — see the backend's
 * src/reports/README.md). Location
 * grouping is off: it was hidden while the report still merged in Sling, whose shifts
 * that didn't match an agendo user by email never joined a Location and left most
 * agents under "Unassigned". That cause is gone, but the toggle hasn't been brought
 * back; the backend still supports groupByLocation for when it is.
 */
export default function Reports() {
  usePageTitle("Reports");

  const [preset, setPreset] = useState<PresetKey>("currentQuarter");
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [rows, setRows] = useState<HoursReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);
  // Clipboard padding for the sheet these numbers get pasted into. Scoped to one view:
  // `layoutView` records the period+sort the layout was built against, so changing either
  // drops it and the next copy starts from a clean list — blanks placed against one order
  // mean nothing in another.
  const [layout, setLayout] = useState<CopyLayout>(EMPTY_LAYOUT);
  const [layoutView, setLayoutView] = useState<string | null>(null);
  // Opened either to set up a copy (and then run it) or, from "Adjust", to edit the
  // layout on its own — the second must not put anything on the clipboard.
  const [dialog, setDialog] = useState<
    { mode: "copy"; column: ColumnKey } | { mode: "adjust" } | null
  >(null);

  /** When the figures on screen were computed, per the server. Null if it couldn't say. */
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const { clock } = useTimeFormat();

  /**
   * `?refresh=true` on this page's own URL makes every fetch recompute server-side rather
   * than read the backend's 10-minute cache. Read once at mount, so it stays on for the
   * whole visit and every range change pays for a recompute — the blunt lever, for when
   * you are actively changing shifts. The Refresh button is the per-press one.
   */
  const [forceRefresh] = useState(
    () => new URLSearchParams(window.location.search).get("refresh") === "true",
  );

  /**
   * Last-request-wins, so a Refresh landing after a range change can't overwrite the
   * newer range's figures. A ref rather than the effect's `cancelled` flag because the
   * button fetches outside the effect and the two have to agree on which is current.
   */
  const latestRequest = useRef(0);

  /**
   * `refresh` is per-call rather than state: one press recomputes once, and the range
   * navigation that follows goes back to cached reads. Sticky refreshing is what the URL
   * parameter is for.
   */
  const load = useCallback(
    (refresh: boolean) => {
      const requestId = ++latestRequest.current;
      setLoading(true);
      setError(null);
      reportsApi
        .getHours(range.start, range.end, false, refresh)
        .then((data) => {
          if (requestId !== latestRequest.current) return;
          setRows(data.rows);
          setComputedAt(data.computedAt);
        })
        .catch((err: unknown) => {
          if (requestId !== latestRequest.current) return;
          setError(err instanceof Error ? err.message : "Failed to load report");
        })
        .finally(() => {
          if (requestId === latestRequest.current) setLoading(false);
        });
    },
    [range],
  );

  useEffect(() => {
    load(forceRefresh);
    // `forceRefresh` is read once at mount and never changes, so it adds no refetches.
  }, [load, forceRefresh]);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = columnValue(a, sort.key);
      const bv = columnValue(b, sort.key);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, sort]);

  const currentView = viewKey(
    range.start,
    range.end,
    sort ? `${sort.key}:${sort.direction}` : "default",
  );
  const layoutIsCurrent = layoutView === currentView;

  const writeColumn = async (key: ColumnKey, withLayout: CopyLayout) => {
    const entries = buildCopyEntries(sortedRows, withLayout);
    if (entries.length === 0) {
      toast.error("Nothing to copy — every row is left out.");
      return;
    }
    const blanks = entries.filter((entry) => entry.kind === "blank").length;
    try {
      await navigator.clipboard.writeText(copyText(entries, key));
      toast.success(
        `Copied ${entries.length} ${COLUMN_LABELS[key]} line${entries.length === 1 ? "" : "s"}` +
          (blanks > 0 ? ` (${blanks} blank).` : "."),
      );
    } catch (err) {
      console.error("Failed to copy column to clipboard:", err);
      toast.error("Failed to copy to clipboard.");
    }
  };

  /**
   * The first copy of a view opens the dialog so the padding can be set against the sheet;
   * every copy after that reuses it silently, which is what keeps "paste each column in
   * turn" at one click per column. "Adjust" in the header reopens it.
   */
  const copyColumn = (key: ColumnKey) => {
    if (sortedRows.length === 0) {
      toast.error("Nothing to copy — the report is empty.");
      return;
    }
    if (!layoutIsCurrent) {
      setLayout(EMPTY_LAYOUT);
      setDialog({ mode: "copy", column: key });
      return;
    }
    void writeColumn(key, layout);
  };

  // The backend never counts time past the end of today, so any range running into the
  // future (every "current" preset does, most of the way through the period) covers less
  // than its label implies. Say so inline rather than leaving the numbers looking short.
  const cutoff = endOfDay(new Date());
  const rangeRunsPastToday = range.end > cutoff;

  const canNavigate = preset !== "custom";

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex min-h-[calc(100vh_-_theme(spacing.16))] flex-1 flex-col gap-4 bg-muted/40 p-4 md:gap-8 md:p-10">
        <div className="mx-auto grid w-full max-w-5xl gap-2">
          <h1 className="text-3xl font-semibold">Reports</h1>
        </div>
        <div className="mx-auto w-full max-w-5xl">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-1.5">
                <CardTitle>Agent hours</CardTitle>
                {rangeRunsPastToday && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    Counted through today, {format(cutoff, "MMM d")} — shifts scheduled after
                    today aren’t included.
                  </p>
                )}
                {layoutIsCurrent && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Rows3 className="h-3.5 w-3.5 shrink-0" />
                    Copy layout: {buildCopyEntries(sortedRows, layout).length} lines
                    {!isEmptyLayout(layout) && " (padded)"}
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "adjust" })}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Adjust
                    </button>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DateRangePicker
                  value={range}
                  preset={preset}
                  onChange={(value, newPreset) => {
                    setRange(value);
                    setPreset(newPreset);
                  }}
                />
                <div className="inline-flex -space-x-px">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Previous period"
                    className="rounded-r-none focus:z-10"
                    disabled={!canNavigate}
                    onClick={() => setRange((r) => shiftRange(preset, r, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Next period"
                    className="rounded-l-none focus:z-10"
                    disabled={!canNavigate}
                    onClick={() => setRange((r) => shiftRange(preset, r, 1))}
                  >
                    <ChevronRight />
                  </Button>
                </div>

                {/* The figures can be up to 10 minutes behind the shifts, because the
                    backend caches them and nothing clears that cache when a shift is
                    published. Rather than hide that, the tooltip states when they were
                    computed and the button recomputes on demand. */}
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Recalculate the report"
                        disabled={loading}
                        onClick={() => load(true)}
                      >
                        <RefreshCw className={cn(loading && "animate-spin")} />
                      </Button>
                    </TooltipTrigger>
                    {/* Rendered on open, so the relative age is current each time rather
                        than frozen at the last fetch. */}
                    <TooltipContent className="max-w-[240px]">
                      <p>
                        {computedAt
                          ? `Calculated at ${clock.time(computedAt)} — ${formatDistanceToNow(new Date(computedAt))} ago. Click to recalculate.`
                          : "Age of these figures is unknown. Click to recalculate."}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <SortableHead columnKey="name" sort={sort} onSort={(k) => setSort(nextSort(sort, k))} onCopy={copyColumn} />
                      <SortableHead
                        columnKey="Tickets"
                        sort={sort}
                        onSort={(k) => setSort(nextSort(sort, k))}
                        onCopy={copyColumn}
                        align="right"
                      />
                      <SortableHead
                        columnKey="Chats"
                        sort={sort}
                        onSort={(k) => setSort(nextSort(sort, k))}
                        onCopy={copyColumn}
                        align="right"
                      />
                      <SortableHead
                        columnKey="Other"
                        sort={sort}
                        onSort={(k) => setSort(nextSort(sort, k))}
                        onCopy={copyColumn}
                        align="right"
                      />
                      <SortableHead
                        columnKey="totalHours"
                        sort={sort}
                        onSort={(k) => setSort(nextSort(sort, k))}
                        onCopy={copyColumn}
                        align="right"
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : sortedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No shifts in this range.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedRows.map((row, i) => (
                        <TableRow key={row.id} className={i % 2 === 1 ? "bg-muted/20" : undefined}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums",
                              row.hours.Tickets === 0 && "text-muted-foreground",
                            )}
                          >
                            {row.hours.Tickets}h
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums",
                              row.hours.Chats === 0 && "text-muted-foreground",
                            )}
                          >
                            {row.hours.Chats}h
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums",
                              row.hours.Other === 0 && "text-muted-foreground",
                            )}
                          >
                            {row.hours.Other}h
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {row.totalHours}h
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <CopyLayoutDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        rows={sortedRows}
        layout={layout}
        onLayoutChange={setLayout}
        columnLabel={dialog?.mode === "copy" ? COLUMN_LABELS[dialog.column] : null}
        onConfirm={() => {
          const current = dialog;
          setDialog(null);
          setLayoutView(currentView);
          if (current?.mode === "copy") void writeColumn(current.column, layout);
        }}
      />
    </div>
  );
}
