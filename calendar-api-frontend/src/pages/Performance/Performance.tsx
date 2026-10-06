import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Info, Lock, Plus, RefreshCw, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  performanceApi,
  type MethodologySummary,
  type Overview,
  type PeriodListItem,
  type Scores,
} from "./api";
import LocationFilter from "@/components/ScheduleCalendar/calendar-components/LocationFilter";
import { WARNING_TEXT } from "./format";
import { ALL_LOCATIONS, countsByLocation, makeRegionFilter } from "./regionFilter";
import { usePageTitle } from "./use-page-title";
import { usePerformanceAccess } from "./access";
import LeaderboardTab from "./LeaderboardTab";
import LeadsBillingTab from "./LeadsBillingTab";
import InteractionsTab from "./InteractionsTab";
import DataTab from "./DataTab";
import MethodologyTab from "./MethodologyTab";

type TabKey = "leaderboard" | "leads" | "interactions" | "data" | "methodology";
const TABS: { key: TabKey; label: string }[] = [
  { key: "leaderboard", label: "Leaderboard" },
  { key: "leads", label: "Leads & billing" },
  { key: "interactions", label: "Interactions" },
  { key: "data", label: "Data" },
  { key: "methodology", label: "Methodology" },
];

/** "Jul 1 – Sep 30, 2026" in the team's timezone; endsAt is exclusive. */
function periodRange(p: { startsAt: string; endsAt: string; tz: string }) {
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-US", {
      timeZone: p.tz,
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
  return `${fmt(new Date(p.startsAt), false)} – ${fmt(new Date(new Date(p.endsAt).getTime() - 1), true)}`;
}

/** The quarter now, in the team's timezone (UTC-3), as a default for "New quarter". */
function currentQuarter() {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return { year: now.getUTCFullYear(), quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
}

/**
 * Admin-only agent performance per quarter: the CRO's Agent Performance Score computed
 * from imported tickets/chats/screen-shares and agendo's own shift hours, under a
 * versioned methodology. See the backend's src/performance/README.md.
 */
/** The page behind its access check (see access.ts), so nothing loads for anyone else. */
export default function Performance() {
  usePageTitle("Performance");
  const allowed = usePerformanceAccess();
  if (allowed === null) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!allowed) return <Navigate to="/" replace />;
  return <PerformancePage />;
}

function PerformancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === searchParams.get("tab")) ? searchParams.get("tab") : "leaderboard") as TabKey;
  const whatIf = searchParams.get("methodology");
  const includeLeads = searchParams.get("leads") === "included";

  const [periods, setPeriods] = useState<PeriodListItem[] | null>(null);
  const [methodologies, setMethodologies] = useState<MethodologySummary[]>([]);
  const [scores, setScores] = useState<Scores | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Kept across tabs and quarters, like the schedule's location filter.
  const [locations, setLocations] = useState<string[]>(ALL_LOCATIONS);
  const regionFilter = useMemo(() => makeRegionFilter(locations), [locations]);
  const latest = useRef(0);

  const setParam = (key: string, value: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value == null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const loadPeriods = useCallback(async () => {
    try {
      const [list, methods] = await Promise.all([performanceApi.listPeriods(), performanceApi.listMethodologies()]);
      setPeriods(list);
      setMethodologies(methods);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quarters");
      setPeriods([]);
    }
  }, []);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  const periodKey = searchParams.get("period") ?? periods?.[0]?.key ?? null;
  const index = periods?.findIndex((p) => p.key === periodKey) ?? -1;
  const current = index >= 0 ? periods![index] : null;

  const load = useCallback(
    (refresh: boolean) => {
      if (!periodKey) return;
      const requestId = ++latest.current;
      setLoading(true);
      setError(null);
      const work =
        tab === "data"
          ? performanceApi.getOverview(periodKey, refresh).then((o) => {
              if (requestId === latest.current) setOverview(o);
            })
          : performanceApi.getScores(periodKey, whatIf, refresh, includeLeads).then((s) => {
              if (requestId === latest.current) setScores(s);
            });
      work
        .catch((err: unknown) => {
          if (requestId === latest.current) setError(err instanceof Error ? err.message : "Failed to load");
        })
        .finally(() => {
          if (requestId === latest.current) setLoading(false);
        });
    },
    [periodKey, tab, whatIf, includeLeads],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  /** After an import, a setup save or a lock: everything that read the old state reloads. */
  const onDataChanged = () => {
    setScores(null);
    void loadPeriods();
    load(false);
  };

  const previousLabel = useMemo(() => {
    if (!scores?.previousPeriodKey) return null;
    return periods?.find((p) => p.key === scores.previousPeriodKey)?.label ?? scores.previousPeriodKey;
  }, [scores, periods]);

  const scoresForPeriod =
    scores && scores.period.key === periodKey && Boolean(scores.includeLeads) === includeLeads ? scores : null;
  const overviewForPeriod = overview && overview.period.key === periodKey ? overview : null;
  const computedAt = tab === "data" ? overviewForPeriod?.hours.computedAt : scoresForPeriod?.hours.computedAt;
  const locationCounts = useMemo(
    () =>
      countsByLocation(
        tab === "data"
          ? (overviewForPeriod?.agents ?? []).map((a) => a.region)
          : (scoresForPeriod?.rows ?? []).map((r) => r.region),
      ),
    [tab, overviewForPeriod, scoresForPeriod],
  );

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex min-h-[calc(100vh_-_theme(spacing.16))] flex-1 flex-col gap-3 bg-muted/40 p-2 sm:p-3 md:px-6 md:py-4">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-1 max-sm:px-1">
            <h1 className="text-xl font-semibold">Performance</h1>
            {current && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {periodRange(current)}
                {current.status === "locked" && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 text-xs">
                    <Lock className="h-3 w-3" /> locked
                  </span>
                )}
              </p>
            )}
          </div>
          {periods && periods.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={periodKey ?? undefined} onValueChange={(v) => setParam("period", v)}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="inline-flex -space-x-px">
                {/* The list is newest first: "previous" is further down it. */}
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous quarter"
                  className="rounded-r-none focus:z-10"
                  disabled={index < 0 || index >= periods.length - 1}
                  onClick={() => setParam("period", periods[index + 1].key)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next quarter"
                  className="rounded-l-none focus:z-10"
                  disabled={index <= 0}
                  onClick={() => setParam("period", periods[index - 1].key)}
                >
                  <ChevronRight />
                </Button>
              </div>
              {methodologies.length > 1 && current && (
                <Select
                  value={whatIf ?? current.methodologyKey}
                  onValueChange={(v) => setParam("methodology", v === current.methodologyKey ? null : v)}
                >
                  <SelectTrigger className="h-9 w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {methodologies.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.name}
                        {m.key === current.methodologyKey ? " (official)" : " (what-if)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Recalculate"
                      disabled={loading}
                      onClick={() => load(true)}
                    >
                      <RefreshCw className={cn(loading && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px]">
                    {computedAt
                      ? `Hours computed ${formatDistanceToNow(new Date(computedAt))} ago. Click to recompute from the shifts.`
                      : "Click to recompute."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-4 w-4" /> Quarter
              </Button>
            </div>
          )}
        </div>

        <div className="mx-auto w-full max-w-[1680px]">
          {periods === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : periods.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No quarters yet</CardTitle>
                <CardDescription>
                  Create a quarter, then import its tickets, chats and screen-shares in the Data tab. Hours come from
                  agendo’s shifts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setCreating(true)}>
                  <Plus className="mr-1 h-4 w-4" /> New quarter
                </Button>
                {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {TABS.map((t) => (
                    <Button
                      key={t.key}
                      size="sm"
                      variant={tab === t.key ? "default" : "outline"}
                      onClick={() => setParam("tab", t.key === "leaderboard" ? null : t.key)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                {(tab === "leaderboard" || tab === "leads") && (
                  <Button
                    size="sm"
                    variant={includeLeads ? "default" : "outline"}
                    aria-pressed={includeLeads}
                    title="What-if: score team leads as regular agents and count them in the averages"
                    onClick={() => setParam("leads", includeLeads ? null : "included")}
                  >
                    <Users className="mr-1.5 h-3.5 w-3.5" />
                    {includeLeads ? "Leads included" : "Include leads"}
                  </Button>
                )}
                {tab !== "methodology" && (
                  <LocationFilter selected={locations} onChange={setLocations} countsByLocation={locationCounts} />
                )}
                </div>
              </div>

              {scoresForPeriod && !scoresForPeriod.official && tab !== "data" && (
                <p className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <Info className="h-4 w-4 shrink-0" />
                  What-if: {current?.label} scored with {scoresForPeriod.methodology.name}; its official methodology is{" "}
                  {current?.methodologyKey}.
                </p>
              )}

              {scoresForPeriod?.includeLeads && tab !== "data" && (
                <p className="flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
                  <Info className="h-4 w-4 shrink-0" />
                  What-if: team leads are scored as regular agents and counted in the averages and σ, so every
                  score, grade and rank below includes them. The official scores leave them out.
                </p>
              )}

              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : tab === "data" ? (
                overviewForPeriod ? (
                  <DataTab
                    overview={overviewForPeriod}
                    methodologies={methodologies}
                    onChanged={onDataChanged}
                    regionFilter={regionFilter}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                )
              ) : !scoresForPeriod ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  {tab !== "methodology" && scoresForPeriod.warnings.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400">
                      {scoresForPeriod.warnings.map((w, i) => (
                        <li key={i}>{WARNING_TEXT[w.code]?.(w) ?? w.code}</li>
                      ))}
                    </ul>
                  )}
                  {tab === "leaderboard" && (
                    <LeaderboardTab scores={scoresForPeriod} previousLabel={previousLabel} regionFilter={regionFilter} />
                  )}
                  {tab === "leads" && (
                    <LeadsBillingTab scores={scoresForPeriod} previousLabel={previousLabel} regionFilter={regionFilter} />
                  )}
                  {tab === "interactions" && (
                    <InteractionsTab scores={scoresForPeriod} previousLabel={previousLabel} regionFilter={regionFilter} />
                  )}
                  {tab === "methodology" && (
                    <MethodologyTab
                      methodology={scoresForPeriod.methodology}
                      period={scoresForPeriod.period}
                      official={scoresForPeriod.official}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>

      <NewQuarterDialog
        open={creating}
        onOpenChange={setCreating}
        existing={new Set((periods ?? []).map((p) => p.key))}
        onCreated={(key) => {
          setCreating(false);
          void loadPeriods().then(() =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set("period", key);
                next.set("tab", "data");
                return next;
              },
              { replace: true },
            ),
          );
        }}
      />
    </div>
  );
}

function NewQuarterDialog({
  open,
  onOpenChange,
  existing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: Set<string>;
  onCreated: (key: string) => void;
}) {
  const now = currentQuarter();
  const [year, setYear] = useState(now.year);
  const [quarter, setQuarter] = useState(now.quarter);
  const [hoursSource, setHoursSource] = useState<"agendo" | "import">("agendo");
  const [busy, setBusy] = useState(false);
  const key = `${year}-Q${quarter}`;
  const years = [now.year - 1, now.year, now.year + 1];

  const create = async () => {
    setBusy(true);
    try {
      const period = await performanceApi.createPeriod({ year, quarter, hoursSource });
      toast.success(`${period.label} created.`);
      onCreated(period.key);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the quarter");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New quarter</DialogTitle>
          <DialogDescription>
            Starts from the previous quarter’s agent setup and is scored with the newest methodology.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((q) => (
                <SelectItem key={q} value={String(q)}>
                  Q{q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="col-span-2">
            <Select value={hoursSource} onValueChange={(v) => setHoursSource(v as "agendo" | "import")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agendo">Hours from agendo’s shifts</SelectItem>
                <SelectItem value="import">Hours imported (before agendo had the shifts)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {existing.has(key) && <p className="text-sm text-destructive">Q{quarter} {year} already exists.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy || existing.has(key)}>
            Create Q{quarter} {year}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
