import type { CohortBenchmark, MethodologyConfig, ScoreRow } from "./api";
import { channelLabel, flagText, int, num, p100, pct, weightsText } from "./format";
import { GradeBadge } from "./parts";

/**
 * The whole calculation for one agent, step by step with their own numbers — so any
 * score can be explained without opening a spreadsheet.
 */
export default function ScoreBreakdown({
  row,
  config,
  benchmark,
  previousLabel,
}: {
  row: ScoreRow;
  config: MethodologyConfig;
  benchmark: CohortBenchmark | undefined;
  previousLabel: string | null;
}) {
  const cap = config.productivity.index.capMultiple;
  const q = config.quality;
  const parts: Record<string, number | null> = {
    productivity: row.productivity.value,
    volume: row.volume.value,
    quality: row.quality.value,
  };
  const weighted = Object.entries(row.weights).filter(([, w]) => w > 0);

  return (
    <div className="grid gap-4 py-2 text-xs md:grid-cols-2">
      <section className="space-y-1">
        <h4 className="font-semibold">
          Productivity{" "}
          {!row.productivity.inAps && (
            <span className="font-normal text-muted-foreground">(reference only — not in this role’s APS)</span>
          )}
        </h4>
        {row.productivity.mode === "volumeProxy" ? (
          <p>
            No shift hours: {int(row.volume.total)} interactions ÷ cohort mean {num(row.productivity.reference)} ={" "}
            {num(row.productivity.ratio, 2)}×, capped at {config.productivity.noHours?.capMultiple}× →{" "}
            <b>{num(row.productivity.value)}</b>
          </p>
        ) : row.productivity.mode === "none" ? (
          <p className="text-muted-foreground">No interactions to score.</p>
        ) : (
          <>
            {Object.entries(row.productivity.channels).map(([channel, c]) => (
              <p key={channel}>
                {channelLabel(config, channel)}: {int(c.count)} in {int(c.hours)}h ={" "}
                {c.rate == null ? "no rate" : `${num(c.rate, 2)}/h`}
                {c.index != null && (
                  <>
                    {" "}
                    ÷ benchmark {num(c.benchmark, 2)} = {num(c.ratio, 2)}× (cap {cap}×) → index {num(c.index)} ·
                    share {pct(c.share)}
                  </>
                )}
              </p>
            ))}
            <p>
              Blended by share of interactions → <b>{num(row.productivity.value)}</b>
            </p>
          </>
        )}
      </section>

      <section className="space-y-1">
        <h4 className="font-semibold">Quality</h4>
        {row.quality.weightedCsat == null ? (
          <p className="text-muted-foreground">No CSAT surveys.</p>
        ) : (
          <>
            <p>
              Weighted CSAT {pct(row.quality.weightedCsat)} on {int(row.quality.surveys)} surveys → (
              {num(row.quality.weightedCsat * 100)} − {p100(q.floor)}) ÷ {p100(q.span)} × 100, kept within 0–100 ={" "}
              {num(row.quality.raw)}
            </p>
            {row.quality.penalized && (
              <p>
                Fewer than {q.minSurveys} surveys: × {q.lowSamplePenalty} = {num(row.quality.value)}
              </p>
            )}
            <p>
              Quality → <b>{num(row.quality.value)}</b>
            </p>
          </>
        )}
      </section>

      {(row.weights.volume > 0 || !row.productivity.inAps) && (
        <section className="space-y-1">
          <h4 className="font-semibold">Volume</h4>
          <p>
            {int(row.volume.total)} interactions ÷ cohort regular mean {num(row.volume.reference)} ={" "}
            {num(row.volume.ratio, 2)}×, capped at {p100(config.volume.cap)}% → <b>{num(row.volume.value)}</b>
          </p>
        </section>
      )}

      <section className="space-y-1">
        <h4 className="font-semibold">
          APS — {row.roleLabel ?? row.role}: {weightsText(row.weights)}
        </h4>
        {row.graded ? (
          <p className="flex flex-wrap items-center gap-1">
            {weighted.map(([part, w], i) => (
              <span key={part}>
                {i > 0 && "+ "}
                {w} × {num(parts[part])}
              </span>
            ))}
            = <b>{num(row.apsRounded)}</b> <GradeBadge grade={row.grade} />
          </p>
        ) : (
          <p className="text-muted-foreground">Not graded in this role.</p>
        )}
        {benchmark && (
          <p className="text-muted-foreground">
            Cohort {benchmark.label}, region {row.region ?? "not set"}
            {row.note && ` · ${row.note}`}
          </p>
        )}
        {previousLabel && row.previous && (
          <p className="text-muted-foreground">
            {previousLabel}: APS {num(row.previous.apsRounded)} ({row.previous.grade ?? "—"}),{" "}
            {int(row.previous.inputs.totalInteractions)} interactions
          </p>
        )}
      </section>

      {row.flags.length > 0 && (
        <section className="space-y-1 md:col-span-2">
          <h4 className="font-semibold">Notes</h4>
          <ul className="list-disc space-y-0.5 pl-4">
            {row.flags.map((flag) => (
              <li key={flag}>{flagText(flag, config)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
