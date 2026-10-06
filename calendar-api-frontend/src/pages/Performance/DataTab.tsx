import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Lock, LockOpen, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTimeFormat } from "@/utils/timeFormat";
import { cn } from "@/lib/utils";
import {
  performanceApi,
  REGIONS,
  type AgentSetup,
  type ImportSource,
  type MethodologySummary,
  type Overview,
  type Region,
} from "./api";
import { hoursFromMinutes, SOURCE_LABELS, WARNING_TEXT } from "./format";
import ImportDialog from "./ImportDialog";
import AddAgentDialog from "./AddAgentDialog";
import { DENSE_TABLE } from "./parts";
import type { RegionFilter } from "./regionFilter";

const AUTO = "__auto";
const NONE = "__none";
const SOURCES: ImportSource[] = ["tickets", "chats", "screenshares", "hours"];

function importSummaryText(summary: Overview["imports"][number]["summary"]) {
  const parts = [`${summary.imported ?? 0} imported`];
  if (summary.removed) parts.push(`${summary.removed} removed`);
  if (summary.skipped) parts.push(`${summary.skipped} skipped`);
  return parts.join(", ");
}

/**
 * Everything that feeds the scores: where the hours come from, the pasted imports, who
 * is scored how this quarter, and the lock that freezes it all.
 */
export default function DataTab({
  overview,
  methodologies,
  onChanged,
  regionFilter,
}: {
  overview: Overview;
  methodologies: MethodologySummary[];
  onChanged: () => void;
  regionFilter: RegionFilter;
}) {
  const { clock } = useTimeFormat();
  const period = overview.period;
  const locked = period.status === "locked";
  const roles = overview.methodology.roles;
  const cohorts = overview.methodology.cohorts;

  const [importing, setImporting] = useState<ImportSource | null>(null);
  const [addingAgent, setAddingAgent] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<Map<string, AgentSetup>>(new Map());

  const initialSetup = useMemo(
    () =>
      new Map(
        overview.agents.map((a) => [
          a.clerkId,
          { clerkId: a.clerkId, region: a.region, role: a.role, cohortOverride: a.cohortOverride, note: a.note },
        ]),
      ),
    [overview.agents],
  );
  useEffect(() => setSetup(new Map(initialSetup)), [initialSetup]);

  const dirty =
    overview.agents.some((a) => !a.inSetup) ||
    [...setup.values()].some((s) => JSON.stringify(s) !== JSON.stringify(initialSetup.get(s.clerkId)));

  const update = (clerkId: string, patch: Partial<AgentSetup>) =>
    setSetup((prev) => {
      const next = new Map(prev);
      const current = next.get(clerkId);
      if (current) next.set(clerkId, { ...current, ...patch });
      return next;
    });

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const hours = overview.hours;
  const hoursText =
    hours.source === "import"
      ? "Hours are imported for this quarter (it predates agendo's shifts)."
      : hours.source === "snapshot"
        ? `Hours frozen from agendo's shifts when the quarter was locked${hours.computedAt ? ` (${clock.dateTime(hours.computedAt, { month: "short", day: "numeric", year: "numeric" })})` : ""}.`
        : `Hours read live from agendo's shifts${hours.computedAt ? `, computed ${formatDistanceToNow(new Date(hours.computedAt))} ago` : ""}.`;

  return (
    <div className="grid gap-3">
      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1.5">
            <CardTitle className="text-base">{period.label}</CardTitle>
            <CardDescription className="space-y-1">
              <span className="block">{hoursText}</span>
              {hours.skippedUnmatched > 0 && (
                <span className="block">
                  {hours.skippedUnmatched} shift(s) belong to no agendo user and are left out (dev data or departed
                  accounts — same rule as the hours report).
                </span>
              )}
              <span className="block">
                Imported:{" "}
                {SOURCES.map((s) => `${SOURCE_LABELS[s]} ${overview.factCounts[s] ?? 0}`).join(" · ")}
              </span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!locked && (
              <Select
                value={period.hoursSource}
                onValueChange={(v) =>
                  run("Hours source updated.", () =>
                    performanceApi.updatePeriod(period.key, { hoursSource: v as "agendo" | "import" }),
                  )
                }
                disabled={busy}
              >
                <SelectTrigger className="h-9 w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendo">Hours from agendo</SelectItem>
                  <SelectItem value="import">Hours imported only</SelectItem>
                </SelectContent>
              </Select>
            )}
            {methodologies.length > 1 && (
              <Select
                value={period.methodologyKey}
                onValueChange={(v) =>
                  run(`${period.label} is now scored with ${v}.`, () =>
                    performanceApi.updatePeriod(period.key, { methodologyKey: v, note: "changed in the Data tab" }),
                  )
                }
                disabled={busy}
              >
                <SelectTrigger className="h-9 w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methodologies.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      Official: {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant={locked ? "outline" : "default"}
              onClick={() => (locked ? run("Unlocked.", () => performanceApi.unlock(period.key)) : setConfirmLock(true))}
              disabled={busy}
            >
              {locked ? <LockOpen className="mr-1.5 h-4 w-4" /> : <Lock className="mr-1.5 h-4 w-4" />}
              {locked ? "Unlock" : "Lock quarter"}
            </Button>
          </div>
        </CardHeader>
        {overview.warnings.length > 0 && (
          <CardContent className="p-3 pt-0 text-sm sm:p-6 sm:pt-0">
            <ul className="list-disc space-y-0.5 pl-5 text-amber-700 dark:text-amber-400">
              {overview.warnings.map((w, i) => (
                <li key={i}>{WARNING_TEXT[w.code]?.(w) ?? w.code}</li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="space-y-1 p-3">
          <CardTitle className="text-base">Import</CardTitle>
          <CardDescription>
            Paste each source’s per-agent rows. Each import replaces that source for the quarter, so re-paste the
            whole list to correct it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-3 pt-0">
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <Button key={s} variant="outline" size="sm" disabled={locked} onClick={() => setImporting(s)}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {SOURCE_LABELS[s]}
              </Button>
            ))}
          </div>
          {overview.imports.length > 0 && (
            <Table className={DENSE_TABLE}>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>When</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.imports.slice(0, 10).map((imp) => (
                  <TableRow key={imp._id}>
                    <TableCell className="whitespace-nowrap">{clock.dateTime(imp.createdAt, { month: "short", day: "numeric" })}</TableCell>
                    <TableCell>{SOURCE_LABELS[imp.source]}</TableCell>
                    <TableCell className={cn(imp.status !== "committed" && "text-destructive")}>
                      {imp.status === "committed" ? importSummaryText(imp.summary) : `${imp.status}: ${imp.error ?? ""}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1.5">
            <CardTitle className="text-base">Agents</CardTitle>
            <CardDescription>
              Everyone with data or chat/ticket hours this quarter. Role and region are kept per quarter; a new quarter
              starts from the previous one’s. The cohort follows the region unless overridden.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={locked || busy} onClick={() => setAddingAgent(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" /> Add without account
            </Button>
            <Button
              disabled={!dirty || locked || busy}
              onClick={() =>
                run("Agent setup saved.", () => performanceApi.saveAgents(period.key, [...setup.values()]))
              }
            >
              Save setup
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-3 pt-0">
          <Table className={DENSE_TABLE}>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Agent</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Cohort</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Chat h</TableHead>
                <TableHead className="text-right">Ticket h</TableHead>
                <TableHead className="text-right" title="Shift time outside the Tickets and Chats report groups">
                  Other h
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Filtered on the saved region, so changing a region in the row doesn't make
                  the row vanish mid-edit. The save always sends every agent. */}
              {overview.agents.filter((agent) => regionFilter.shows(agent.region)).map((agent) => {
                const s = setup.get(agent.clerkId);
                if (!s) return null;
                return (
                  <TableRow key={agent.clerkId}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {agent.name ?? agent.clerkId}
                      {!agent.inSetup && <span className="ml-1.5 text-amber-600 dark:text-amber-400">new</span>}
                      {agent.external ? (
                        <span
                          className="ml-1.5 text-muted-foreground"
                          title="No agendo account yet — moves to their account once they sign in"
                        >
                          no account
                        </span>
                      ) : (
                        agent.userMissing && <span className="ml-1.5 text-destructive">no user</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={s.region ?? NONE}
                        disabled={locked}
                        onValueChange={(v) => update(agent.clerkId, { region: v === NONE ? null : (v as Region) })}
                      >
                        <SelectTrigger className="h-8 w-[90px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>—</SelectItem>
                          {REGIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={s.role} disabled={locked} onValueChange={(v) => update(agent.clerkId, { role: v })}>
                        <SelectTrigger className="h-8 w-[160px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(roles).map(([key, role]) => (
                            <SelectItem key={key} value={key}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={s.cohortOverride ?? AUTO}
                        disabled={locked}
                        onValueChange={(v) => update(agent.clerkId, { cohortOverride: v === AUTO ? null : v })}
                      >
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AUTO}>
                            By region
                            {s.region && overview.methodology.cohortByRegion[s.region]
                              ? ` (${cohorts[overview.methodology.cohortByRegion[s.region]]?.label})`
                              : ""}
                          </SelectItem>
                          {Object.entries(cohorts).map(([key, cohort]) => (
                            <SelectItem key={key} value={key}>
                              {cohort.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {SOURCES.map((src) => (
                        <span
                          key={src}
                          title={`${SOURCE_LABELS[src]} ${agent.sources[src] ? "imported" : "not imported"}`}
                          className={cn(
                            "mr-1 inline-block rounded px-1 text-[10px] font-semibold",
                            agent.sources[src] ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground/60",
                          )}
                        >
                          {src === "screenshares" ? "SS" : SOURCE_LABELS[src][0]}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{hoursFromMinutes(agent.minutes.chats)}</TableCell>
                    <TableCell className="text-right tabular-nums">{hoursFromMinutes(agent.minutes.tickets)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {hoursFromMinutes(agent.minutes.other)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddAgentDialog
        open={addingAgent}
        onOpenChange={setAddingAgent}
        periodKey={period.key}
        periodLabel={period.label}
        roles={roles}
        onAdded={onChanged}
      />

      {importing && (
        <ImportDialog
          open
          onOpenChange={(open) => !open && setImporting(null)}
          periodKey={period.key}
          periodLabel={period.label}
          source={importing}
          onImported={onChanged}
        />
      )}

      <AlertDialog open={confirmLock} onOpenChange={setConfirmLock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock {period.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Locking freezes the quarter: the hours are saved as they are now, and imports and setup changes are
              blocked. Scores stay readable, and the quarter can still be scored with another methodology version.
              You can unlock it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(`${period.label} locked.`, () => performanceApi.lock(period.key))}>
              Lock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
