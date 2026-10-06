import { useMemo } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AgentInputs, Scores } from "./api";
import { change, int, num, pct } from "./format";
import { Delta, NUM, DENSE_TABLE } from "./parts";
import type { RegionFilter } from "./regionFilter";

type Line = {
  key: string;
  name: string;
  region: string;
  now: AgentInputs;
  before: AgentInputs | null;
};

const c = (inputs: AgentInputs, channel: string) => inputs.channels[channel] ?? null;

/** Σ/Σ over everyone — a team rate, which is not the same as the benchmark's mean of rates. */
function pooled(lines: Line[]) {
  const sum = (f: (i: AgentInputs) => number | null | undefined) =>
    lines.reduce((total, l) => total + (f(l.now) ?? 0), 0);
  const chats = sum((i) => c(i, "chats")?.count);
  const chatHours = sum((i) => c(i, "chats")?.hours);
  const tickets = sum((i) => c(i, "tickets")?.count);
  const ticketHours = sum((i) => c(i, "tickets")?.hours);
  const surveys = sum((i) => i.totalSurveys);
  const good = sum((i) => i.good);
  const total = sum((i) => i.totalInteractions);
  return {
    chats,
    chatHours,
    chatRate: chatHours ? chats / chatHours : null,
    tickets,
    ticketHours,
    ticketRate: ticketHours ? tickets / ticketHours : null,
    screenshares: sum((i) => c(i, "screenshares")?.count),
    total,
    surveys,
    csat: surveys ? good / surveys : null,
    good,
    pctRated: total ? surveys / total : null,
    bad: sum((i) => i.bad),
  };
}

/**
 * The quarterly sheet's "Total Support Interactions" tab: raw counts, hours, per-hour
 * productivity, weighted CSAT and the change since the previous quarter. "Copy as TSV"
 * pastes it into a sheet as-is.
 */
export default function InteractionsTab({
  scores,
  previousLabel,
  regionFilter,
}: {
  scores: Scores;
  previousLabel: string | null;
  regionFilter: RegionFilter;
}) {
  const lines: Line[] = useMemo(
    () =>
      scores.rows
        .filter((r) => regionFilter.shows(r.region))
        .map((r) => ({
          key: r.clerkId,
          name: r.name ?? r.clerkId,
          region: r.region ?? "",
          now: r.inputs,
          before: r.previous?.inputs ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [scores.rows, regionFilter],
  );
  const team = useMemo(() => pooled(lines), [lines]);
  const withPrevious = Boolean(previousLabel);

  const copyTsv = async () => {
    const header = [
      "Agent", "Region", "Chats", "Chat hours", "Chat prod", "Tickets", "Ticket hours", "Ticket prod",
      "Screen-shares", "Total interactions", "Total surveys", "Weighted CSAT", "Good ratings", "% Rated", "Bad ratings",
    ];
    const fmt = (x: number | null | undefined, digits = 0) => (x == null ? "" : x.toFixed(digits));
    const rows = lines.map((l) => [
      l.name, l.region,
      fmt(c(l.now, "chats")?.count), fmt(c(l.now, "chats")?.hours), fmt(c(l.now, "chats")?.rate, 2),
      fmt(c(l.now, "tickets")?.count), fmt(c(l.now, "tickets")?.hours), fmt(c(l.now, "tickets")?.rate, 2),
      fmt(c(l.now, "screenshares")?.count), fmt(l.now.totalInteractions), fmt(l.now.totalSurveys),
      l.now.weightedCsat == null ? "" : `${(l.now.weightedCsat * 100).toFixed(1)}%`,
      fmt(l.now.good), l.now.pctRated == null ? "" : `${(l.now.pctRated * 100).toFixed(1)}%`, fmt(l.now.bad),
    ]);
    try {
      await navigator.clipboard.writeText([header, ...rows].map((r) => r.join("\t")).join("\n"));
      toast.success(`Copied ${rows.length} rows.`);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 space-y-0 p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1.5">
          <CardTitle className="text-base">Total support interactions</CardTitle>
          <CardDescription>
            Productivity is interactions per worked hour ({scores.methodology.config.hours.rounding === "floor" ? "hours truncated, as in the sheet" : "exact hours"}).
            Totals and CSAT count chats and tickets; screen-shares are shown on their own.
            {withPrevious && ` Changes are against ${previousLabel}.`}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={copyTsv}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy as TSV
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto p-3 pt-0">
        <Table className={DENSE_TABLE}>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Agent</TableHead>
              <TableHead>Region</TableHead>
              <TableHead className={NUM}>Chats</TableHead>
              <TableHead className={NUM}>Chat h</TableHead>
              <TableHead className={NUM}>Chat/h</TableHead>
              <TableHead className={NUM}>Tickets</TableHead>
              <TableHead className={NUM}>Ticket h</TableHead>
              <TableHead className={NUM}>Ticket/h</TableHead>
              <TableHead className={NUM}>SS</TableHead>
              <TableHead className={NUM}>Total</TableHead>
              <TableHead className={NUM}>Surveys</TableHead>
              <TableHead className={NUM}>CSAT</TableHead>
              <TableHead className={NUM}>Good</TableHead>
              <TableHead className={NUM}>% Rated</TableHead>
              <TableHead className={NUM}>Bad</TableHead>
              {withPrevious && (
                <>
                  <TableHead className={cn(NUM, "border-l")}>ΔChats</TableHead>
                  <TableHead className={NUM}>ΔChat/h</TableHead>
                  <TableHead className={NUM}>ΔTickets</TableHead>
                  <TableHead className={NUM}>ΔTicket/h</TableHead>
                  <TableHead className={NUM}>ΔTotal</TableHead>
                  <TableHead className={NUM}>ΔCSAT</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => {
              const chats = c(l.now, "chats");
              const tickets = c(l.now, "tickets");
              const bChats = l.before ? c(l.before, "chats") : null;
              const bTickets = l.before ? c(l.before, "tickets") : null;
              return (
                <TableRow key={l.key} className={i % 2 === 1 ? "bg-muted/20" : undefined}>
                  <TableCell className="whitespace-nowrap font-medium">{l.name}</TableCell>
                  <TableCell>{l.region || "—"}</TableCell>
                  <TableCell className={NUM}>{int(chats?.count)}</TableCell>
                  <TableCell className={NUM}>{int(chats?.hours)}</TableCell>
                  <TableCell className={NUM}>{num(chats?.rate, 2)}</TableCell>
                  <TableCell className={NUM}>{int(tickets?.count)}</TableCell>
                  <TableCell className={NUM}>{int(tickets?.hours)}</TableCell>
                  <TableCell className={NUM}>{num(tickets?.rate, 2)}</TableCell>
                  <TableCell className={NUM}>{int(c(l.now, "screenshares")?.count)}</TableCell>
                  <TableCell className={cn(NUM, "font-semibold")}>{int(l.now.totalInteractions)}</TableCell>
                  <TableCell className={NUM}>{int(l.now.totalSurveys)}</TableCell>
                  <TableCell className={NUM}>{pct(l.now.weightedCsat)}</TableCell>
                  <TableCell className={NUM}>{int(l.now.good)}</TableCell>
                  <TableCell className={NUM}>{pct(l.now.pctRated)}</TableCell>
                  <TableCell className={NUM}>{int(l.now.bad)}</TableCell>
                  {withPrevious && (
                    <>
                      <TableCell className={cn(NUM, "border-l")}>
                        <Delta value={l.before ? (chats?.count ?? 0) - (bChats?.count ?? 0) : null} />
                      </TableCell>
                      <TableCell className={NUM}>
                        <Delta value={pctChange(chats?.rate, bChats?.rate)} digits={1} suffix="%" />
                      </TableCell>
                      <TableCell className={NUM}>
                        <Delta value={l.before ? (tickets?.count ?? 0) - (bTickets?.count ?? 0) : null} />
                      </TableCell>
                      <TableCell className={NUM}>
                        <Delta value={pctChange(tickets?.rate, bTickets?.rate)} digits={1} suffix="%" />
                      </TableCell>
                      <TableCell className={NUM}>
                        <Delta value={l.before ? l.now.totalInteractions - l.before.totalInteractions : null} />
                      </TableCell>
                      <TableCell className={NUM}>
                        <Delta
                          value={
                            l.now.weightedCsat != null && l.before?.weightedCsat != null
                              ? (l.now.weightedCsat - l.before.weightedCsat) * 100
                              : null
                          }
                          digits={1}
                          suffix="pp"
                        />
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
            <TableRow className="border-t-2 bg-muted/40 font-semibold hover:bg-muted/40">
              <TableCell>{regionFilter.filtered ? "Selected regions (pooled)" : "Team (pooled)"}</TableCell>
              <TableCell />
              <TableCell className={NUM}>{int(team.chats)}</TableCell>
              <TableCell className={NUM}>{int(team.chatHours)}</TableCell>
              <TableCell className={NUM}>{num(team.chatRate, 2)}</TableCell>
              <TableCell className={NUM}>{int(team.tickets)}</TableCell>
              <TableCell className={NUM}>{int(team.ticketHours)}</TableCell>
              <TableCell className={NUM}>{num(team.ticketRate, 2)}</TableCell>
              <TableCell className={NUM}>{int(team.screenshares)}</TableCell>
              <TableCell className={NUM}>{int(team.total)}</TableCell>
              <TableCell className={NUM}>{int(team.surveys)}</TableCell>
              <TableCell className={NUM}>{pct(team.csat)}</TableCell>
              <TableCell className={NUM}>{int(team.good)}</TableCell>
              <TableCell className={NUM}>{pct(team.pctRated)}</TableCell>
              <TableCell className={NUM}>{int(team.bad)}</TableCell>
              {withPrevious && <TableCell colSpan={6} className="border-l" />}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function pctChange(now: number | null | undefined, before: number | null | undefined) {
  const ratio = change(now, before);
  return ratio == null ? null : ratio * 100;
}
