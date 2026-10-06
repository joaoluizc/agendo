import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Scores } from "./api";
import { channelLabel, int, num, pct, weightsText } from "./format";
import { FlagsHint, GradeBadge, NUM, DENSE_TABLE } from "./parts";
import ScoreBreakdown from "./ScoreBreakdown";
import type { RegionFilter } from "./regionFilter";

/**
 * The roles the CRO scored on their own models — team leads (overflow work at peak
 * times, so per-hour productivity would flatter them) and billing (tickets not
 * comparable to general support) — plus agents shown but not graded.
 */
export default function LeadsBillingTab({
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
  const roles = Object.entries(config.roles).filter(([, role]) => role.board === "leadsBilling");
  const columnCount = 12 + config.interactionChannels.length;

  return (
    <div className="grid gap-3">
      {roles.map(([roleKey, role]) => {
        const rows = scores.rows.filter(
          (r) => r.board === "leadsBilling" && r.role === roleKey && regionFilter.shows(r.region),
        );
        if (regionFilter.filtered && rows.length === 0) return null;
        return (
          <Card key={roleKey}>
            <CardHeader className="space-y-1 p-3">
              <CardTitle className="text-base">{role.label}</CardTitle>
              <CardDescription>
                {role.graded === false
                  ? "Shown for completeness, not graded."
                  : `APS = ${weightsText(role.weights)}. Volume is compared with the regular agents of the same cohort.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-3 pt-0">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody in this role this quarter.</p>
              ) : (
                <Table className={DENSE_TABLE}>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-6" />
                      <TableHead>Agent</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead className={NUM}>Total</TableHead>
                      {config.interactionChannels.map((ch) => (
                        <TableHead key={ch} className={NUM}>
                          {channelLabel(config, ch)}
                        </TableHead>
                      ))}
                      <TableHead className={NUM}>SS</TableHead>
                      <TableHead className={NUM} title="Total interactions ÷ the cohort's regular-agent mean">
                        Volume
                      </TableHead>
                      <TableHead className={NUM} title="Per-hour productivity — reference only for these roles">
                        Prod (ref.)
                      </TableHead>
                      <TableHead className={NUM}>CSAT</TableHead>
                      <TableHead className={NUM}>Surveys</TableHead>
                      <TableHead className={NUM}>Quality</TableHead>
                      <TableHead className={NUM}>APS</TableHead>
                      <TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => {
                      const expanded = open === row.clerkId;
                      const Chevron = expanded ? ChevronDown : ChevronRight;
                      return (
                        <Fragment key={row.clerkId}>
                          <TableRow
                            className={cn("cursor-pointer", i % 2 === 1 && "bg-muted/20")}
                            onClick={() => setOpen(expanded ? null : row.clerkId)}
                          >
                            <TableCell>
                              <Chevron className="h-3.5 w-3.5 text-muted-foreground" />
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-medium">
                              {row.name ?? row.clerkId}
                              <FlagsHint flags={row.flags.filter((f) => f !== "lowSample")} config={config} />
                            </TableCell>
                            <TableCell>{row.region ?? "—"}</TableCell>
                            <TableCell className={NUM}>{int(row.inputs.totalInteractions)}</TableCell>
                            {config.interactionChannels.map((ch) => (
                              <TableCell key={ch} className={NUM}>
                                {int(row.inputs.channels[ch]?.count)}
                              </TableCell>
                            ))}
                            <TableCell className={cn(NUM, "text-muted-foreground")}>
                              {int(row.inputs.channels.screenshares?.count)}
                            </TableCell>
                            <TableCell className={NUM} title={`${num(row.volume.ratio, 2)}× the cohort mean`}>
                              {num(row.volume.value)}
                            </TableCell>
                            <TableCell
                              className={cn(NUM, !row.productivity.inAps && "italic text-muted-foreground")}
                            >
                              {num(row.productivity.value)}
                            </TableCell>
                            <TableCell className={NUM}>{pct(row.quality.weightedCsat)}</TableCell>
                            <TableCell className={NUM}>{int(row.quality.surveys)}</TableCell>
                            <TableCell className={NUM}>{num(row.quality.value)}</TableCell>
                            <TableCell className={cn(NUM, "font-semibold")}>{num(row.apsRounded)}</TableCell>
                            <TableCell>
                              <GradeBadge grade={row.grade} />
                            </TableCell>
                          </TableRow>
                          {expanded && (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={columnCount}>
                                <ScoreBreakdown
                                  row={row}
                                  config={config}
                                  benchmark={scores.benchmarks[row.cohort]}
                                  previousLabel={previousLabel}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
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
