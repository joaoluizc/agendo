import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Copy, Info } from "lucide-react";
import { endOfDay, format } from "date-fns";
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
import DateRangePicker, { DateRangeValue, PresetKey, presetRange, shiftRange } from "./DateRangePicker";
import { reportsApi, HoursReportRow } from "./api";
import { usePageTitle } from "./use-page-title";

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
 * broken into Tickets/Chats/Other. Location grouping is temporarily off — with the
 * current Sling data most agents resolve to "Unassigned" (Sling shifts that don't match
 * an agendo user by email never join a Location), so it's more confusing than useful
 * until Sling is retired; the backend still supports groupByLocation for when that's
 * revisited.
 */
export default function Reports() {
  usePageTitle("Reports");

  const [preset, setPreset] = useState<PresetKey>("currentQuarter");
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [rows, setRows] = useState<HoursReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    reportsApi
      .getHours(range.start, range.end, false)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load report");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

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

  const copyColumn = async (key: ColumnKey) => {
    if (sortedRows.length === 0) {
      toast.error("Nothing to copy — the report is empty.");
      return;
    }
    const text = sortedRows.map((row) => columnValue(row, key)).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${sortedRows.length} ${COLUMN_LABELS[key]} value${sortedRows.length === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error("Failed to copy column to clipboard:", err);
      toast.error("Failed to copy to clipboard.");
    }
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
    </div>
  );
}
