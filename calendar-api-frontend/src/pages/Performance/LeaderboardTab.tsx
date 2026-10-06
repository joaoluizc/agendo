import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Scores, ScoreRow } from "./api";
import { benchmarkText, channelLabel, int, num, pct, prodNote } from "./format";
import { Delta, FlagsHint, GradeBadge, NUM, ZBadge, DENSE_TABLE } from "./parts";
import ScoreBreakdown from "./ScoreBreakdown";
import type { RegionFilter } from "./regionFilter";

/** Flags that only explain a number; the rest get the warning icon on the row. */
const QUIET_FLAGS = new Set(["lowSample", "volumeProxy"]);

/**
 * One card per cohort, ranked by APS, in the columns of the CRO's leaderboard. Each
 * cohort is benchmarked against itself, so the header shows what "average" means there.
 */
export default function LeaderboardTab({
  scores,
  previousLabel,
  regionFilter,
}: {
  scores: Scores;
  previousLabel: string | null;
  regionFilter: RegionFilter;
}) {
  const config = scores.methodology.config;
  const [open, setOpen] = useState<string | null>(null);
  const cohorts = Object.entries(scores.benchmarks);
  const rateChannels = config.interactionChannels;

  return (
    <div className="grid gap-3">
      {cohorts.map(([cohortKey, bench]) => {
        const rows = scores.rows.filter(
          (r) => r.board === "leaderboard" && r.cohort === cohortKey && regionFilter.shows(r.region),
        );
        // Filtered down to other regions: the whole card goes, not just its rows.
        if (regionFilter.filtered && rows.length === 0) return null;
        const columnCount = 15 + rateChannels.length * 2 + (previousLabel ? 2 : 0);
        return (
          <Card key={cohortKey}>
            <CardHeader className="space-y-1 p-3">
              <CardTitle className="text-base">{bench.label}</CardTitle>
              <CardDescription className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {rateChannels.map((ch) => (
                  <span key={ch} className={cn(!bench.productivityChannels.includes(ch) && "opacity-60")}>
                    {channelLabel(config, ch)}: {benchmarkText(bench.channels[ch], config.dispersion.minN)}
                    {!bench.productivityChannels.includes(ch) && " (not scored here)"}
                  </span>
                ))}
                <span>Interactions mean {num(bench.interactions.mean, 0)}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-3 pt-0">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody on this leaderboard yet.</p>
              ) : (
                <Table className={DENSE_TABLE}>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-6" />
                      <TableHead className={NUM}>#</TableHead>
                      <TableHead className={NUM} title="Rank within the region">
                        Reg
                      </TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className={NUM}>Total</TableHead>
                      {rateChannels.map((ch) => (
                        <TableHead key={ch} className={NUM}>
                          {channelLabel(config, ch)}
                        </TableHead>
                      ))}
                      <TableHead className={NUM} title="Screen-shares (not scored)">
                        SS
                      </TableHead>
                      {rateChannels.map((ch) => (
                        <TableHead key={ch} className={NUM}>
                          {channelLabel(config, ch)}/h
                        </TableHead>
                      ))}
                      <TableHead className={NUM}>Prod</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className={NUM}>CSAT</TableHead>
                      <TableHead className={NUM}>Surveys</TableHead>
                      <TableHead className={NUM}>Quality</TableHead>
                      <TableHead className={NUM}>APS</TableHead>
                      <TableHead>Grade</TableHead>
                      {previousLabel && (
                        <>
                          <TableHead className={NUM} title={`APS change since ${previousLabel}`}>
                            ΔAPS
                          </TableHead>
                          <TableHead className={NUM} title={`Interactions change since ${previousLabel}`}>
                            ΔVol
                          </TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <Fragment key={row.clerkId}>
                        <LeaderRow
                          row={row}
                          striped={i % 2 === 1}
                          expanded={open === row.clerkId}
                          onToggle={() => setOpen(open === row.clerkId ? null : row.clerkId)}
                          scores={scores}
                          showPrevious={Boolean(previousLabel)}
                        />
                        {open === row.clerkId && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={columnCount}>
                              <ScoreBreakdown
                                row={row}
                                config={config}
                                benchmark={bench}
                                previousLabel={previousLabel}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function LeaderRow({
  row,
  striped,
  expanded,
  onToggle,
  scores,
  showPrevious,
}: {
  row: ScoreRow;
  striped: boolean;
  expanded: boolean;
  onToggle: () => void;
  scores: Scores;
  showPrevious: boolean;
}) {
  const config = scores.methodology.config;
  const ch = row.inputs.channels;
  const loudFlags = row.flags.filter((f) => !QUIET_FLAGS.has(f.split(":")[0]));
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <TableRow className={cn("cursor-pointer", striped && "bg-muted/20")} onClick={onToggle}>
      <TableCell>
        <Chevron className="h-3.5 w-3.5 text-muted-foreground" />
      </TableCell>
      <TableCell className={NUM}>{row.ranks.cohort ?? "—"}</TableCell>
      <TableCell className={cn(NUM, "text-muted-foreground")}>{row.ranks.region ?? "—"}</TableCell>
      <TableCell className="whitespace-nowrap font-medium">
        {row.name ?? row.clerkId}
        <FlagsHint flags={loudFlags} config={config} />
      </TableCell>
      <TableCell>{row.region ?? "—"}</TableCell>
      <TableCell className="whitespace-nowrap">{row.roleLabel}</TableCell>
      <TableCell className={NUM}>{int(row.inputs.totalInteractions)}</TableCell>
      {config.interactionChannels.map((c) => (
        <TableCell key={c} className={NUM}>
          {int(ch[c]?.count)}
        </TableCell>
      ))}
      <TableCell className={cn(NUM, "text-muted-foreground")}>{int(ch.screenshares?.count)}</TableCell>
      {config.interactionChannels.map((c) => {
        const scored = row.productivity.channels[c]?.index != null;
        return (
          <TableCell key={c} className={cn(NUM, "whitespace-nowrap", !scored && "text-muted-foreground")}>
            {num(ch[c]?.rate, 2)}
            {scored && <ZBadge z={row.z[c]} outlierZ={config.dispersion.outlierZ} />}
          </TableCell>
        );
      })}
      <TableCell className={NUM}>{num(row.productivity.value)}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{prodNote(row, config)}</TableCell>
      <TableCell className={NUM}>{pct(row.quality.weightedCsat)}</TableCell>
      <TableCell className={cn(NUM, row.quality.penalized && "text-amber-600 dark:text-amber-400")}>
        {int(row.quality.surveys)}
      </TableCell>
      <TableCell className={NUM}>{num(row.quality.value)}</TableCell>
      <TableCell className={cn(NUM, "font-semibold")}>{num(row.apsRounded)}</TableCell>
      <TableCell>
        <GradeBadge grade={row.grade} />
      </TableCell>
      {showPrevious && (
        <>
          <TableCell className={NUM}>
            <Delta
              value={
                row.previous?.apsRounded != null && row.apsRounded != null
                  ? row.apsRounded - row.previous.apsRounded
                  : null
              }
              digits={1}
            />
          </TableCell>
          <TableCell className={NUM}>
            <Delta
              value={
                row.previous ? row.inputs.totalInteractions - row.previous.inputs.totalInteractions : null
              }
            />
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
