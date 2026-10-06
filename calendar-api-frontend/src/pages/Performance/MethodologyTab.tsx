import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Methodology, PeriodSummary } from "./api";
import { channelLabel, p100, weightsText } from "./format";
import { GradeBadge } from "./parts";

/**
 * The methodology, written out from its stored config rather than from hard-coded prose,
 * so a later version describes itself correctly with no change here.
 */
export default function MethodologyTab({
  methodology,
  period,
  official,
}: {
  methodology: Methodology;
  period: PeriodSummary;
  official: boolean;
}) {
  const c = methodology.config;
  const cap = c.productivity.index.capMultiple;
  const list = (keys: string[]) => keys.map((k) => channelLabel(c, k)).join(" + ");
  const benchmark = c.productivity.benchmark;
  const benchmarkStat =
    benchmark.stat === "fixed"
      ? `fixed values (${Object.entries(benchmark.fixed || {})
          .map(([k, v]) => `${channelLabel(c, k)} ${v}/h`)
          .join(", ")})`
      : `the ${benchmark.stat} of each agent's rate, over the cohort's ${benchmark.roles
          .map((r) => c.roles[r]?.label ?? r)
          .join(", ")} agents`;

  return (
    <div className="grid gap-3">
      <Card>
        <CardHeader className="space-y-1 p-3">
          <CardTitle className="text-base">
            {methodology.name} <span className="text-sm font-normal text-muted-foreground">({methodology.key})</span>
          </CardTitle>
          <CardDescription>
            {methodology.summary}
            {!official && ` Shown as a what-if: ${period.label} is officially scored with ${period.methodologyKey}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 p-3 pt-0 text-sm sm:p-6 sm:pt-0 md:grid-cols-2">
          <section className="space-y-1.5">
            <h3 className="font-semibold">Productivity</h3>
            <p>
              Each channel’s rate is interactions per worked hour (
              {c.hours.rounding === "floor" ? "hours truncated to whole hours" : "exact hours"}; at least{" "}
              {c.hours.minChannelHours}h needed for a rate).
            </p>
            <p>
              Channel index = min(rate ÷ benchmark, {cap}) ÷ {cap} × 100 — the benchmark scores{" "}
              {Math.round(100 / cap)}, and {cap}× the benchmark or more scores 100.
            </p>
            <p>Benchmark: {benchmarkStat}, recomputed for every quarter.</p>
            <p>
              The channel indexes are blended by each channel’s share of the agent’s interactions (
              {list(c.interactionChannels)}).
            </p>
            {c.productivity.noHours?.mode === "volumeProxy" && (
              <p>
                With interactions but no usable hours, productivity falls back to volume: total ÷ cohort mean, capped at{" "}
                {c.productivity.noHours.capMultiple}×.
              </p>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="font-semibold">Quality</h3>
            <p>
              Weighted CSAT across {list(c.interactionChannels)} (each channel’s CSAT weighted by its surveys).
            </p>
            <p>
              Quality = (CSAT − {p100(c.quality.floor)}%) ÷ {p100(c.quality.span)}% × 100, kept within 0–100:{" "}
              {p100(c.quality.floor)}% scores 0, {p100(c.quality.floor + c.quality.span)}% scores 100.
            </p>
            <p>
              Fewer than {c.quality.minSurveys} surveys: × {c.quality.lowSamplePenalty}. No surveys: not graded.
            </p>
            <h3 className="pt-2 font-semibold">Volume</h3>
            <p>
              Total interactions ÷ the mean of the cohort’s{" "}
              {c.volume.referenceRoles.map((r) => c.roles[r]?.label ?? r).join(", ")} agents, capped at{" "}
              {p100(c.volume.cap)}%.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="font-semibold">Cohorts</h3>
            <p className="text-muted-foreground">Each cohort has its own leaderboard and its own benchmarks.</p>
            <ul className="list-disc space-y-1 pl-5">
              {Object.entries(c.cohorts).map(([key, cohort]) => (
                <li key={key}>
                  <b>{cohort.label}</b> — regions{" "}
                  {Object.entries(c.cohortByRegion)
                    .filter(([, k]) => k === key)
                    .map(([region]) => region)
                    .join(", ")}
                  ; productivity on {list(cohort.productivityChannels)}.
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-1.5">
            <h3 className="font-semibold">Roles</h3>
            <ul className="list-disc space-y-1 pl-5">
              {Object.entries(c.roles).map(([key, role]) => (
                <li key={key}>
                  <b>{role.label}</b> —{" "}
                  {role.graded === false ? "shown, not graded" : `APS = ${weightsText(role.weights)}`}
                  {role.productivityChannels && `; productivity on ${list(role.productivityChannels)} only`}
                  {role.board === "leadsBilling" ? " (Leads & billing tab)" : " (leaderboard)"}.
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-1.5">
            <h3 className="font-semibold">Grades</h3>
            <p className="flex flex-wrap items-center gap-2">
              {c.grades.map((band) => (
                <span key={band.grade} className="inline-flex items-center gap-1">
                  <GradeBadge grade={band.grade} />
                  {band.min == null ? "below" : `≥ ${band.min}`}
                </span>
              ))}
            </p>
            <p className="text-muted-foreground">Read from the APS rounded to one decimal.</p>
          </section>

          <section className="space-y-1.5">
            <h3 className="font-semibold">Spread</h3>
            <p>
              σ (standard deviation) is shown for cohorts of {c.dispersion.minN} or more agents; a rate {c.dispersion.outlierZ}σ
              or more from the mean is highlighted. It is context only — scores use the ratio to the benchmark.
            </p>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1 p-3">
          <CardTitle className="text-base">{period.label}: methodology history</CardTitle>
          <CardDescription>
            Which version officially scores this quarter, and when that was decided.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 text-sm sm:p-6 sm:pt-0">
          <ul className="space-y-1">
            {period.methodologyHistory.map((h, i) => (
              <li key={i}>
                <b>{h.key}</b> since {format(new Date(h.setAt), "MMM d, yyyy")}
                {h.note && <span className="text-muted-foreground"> — {h.note}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
