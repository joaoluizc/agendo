import type { ImportSource, MethodologyConfig, ScoreRow } from "./api";

export const SOURCE_LABELS: Record<ImportSource, string> = {
  tickets: "Tickets",
  chats: "Chats",
  screenshares: "Screen-shares",
  hours: "Hours",
};

const DASH = "—";

export const num = (x: number | null | undefined, digits = 1) =>
  x == null || !Number.isFinite(x) ? DASH : x.toFixed(digits);

export const int = (x: number | null | undefined) =>
  x == null || !Number.isFinite(x) ? DASH : Math.round(x).toLocaleString("en-US");

export const pct = (x: number | null | undefined, digits = 1) =>
  x == null || !Number.isFinite(x) ? DASH : `${(x * 100).toFixed(digits)}%`;

/** A config fraction as a clean percentage number: 0.3 → 30 (not 30.000000000000004). */
export const p100 = (x: number) => Math.round(x * 1000) / 10;

export const signed =(x: number | null | undefined, digits = 0) =>
  x == null || !Number.isFinite(x) ? DASH : `${x > 0 ? "+" : ""}${x.toFixed(digits)}`;

/** Relative change as a signed percentage, e.g. +12.5%. */
export const change = (now: number | null | undefined, before: number | null | undefined) =>
  now == null || before == null || !before ? null : (now - before) / before;

export const hoursFromMinutes = (minutes: number) => Math.floor(minutes / 60 + 1e-9);

export function channelLabel(config: MethodologyConfig, channel: string) {
  return config.channels[channel]?.label ?? channel;
}

const PART_LABELS: Record<string, string> = {
  productivity: "productivity",
  volume: "volume",
  quality: "quality",
};

/** { productivity: 0.6, quality: 0.4 } → "60% productivity + 40% quality" */
export function weightsText(weights: Record<string, number> | undefined) {
  const parts = Object.entries(weights || {}).filter(([, w]) => w > 0);
  if (!parts.length) return "not graded";
  return parts.map(([k, w]) => `${Math.round(w * 100)}% ${PART_LABELS[k] ?? k}`).join(" + ");
}

/** The leaderboard's "Prod notes" column. */
export function prodNote(row: ScoreRow, config: MethodologyConfig) {
  if (row.productivity.mode === "volumeProxy") return "Volume proxy (no shift hours)";
  if (row.productivity.mode === "none") return "No data";
  const scored = Object.entries(row.productivity.channels)
    .filter(([, c]) => c.index != null)
    .map(([ch]) => channelLabel(config, ch));
  const all = config.interactionChannels.length;
  if (scored.length === all) return "Full data";
  return `${scored.join(" + ")} only`;
}

export function flagText(flag: string, config: MethodologyConfig): string {
  const [code, channel] = flag.split(":");
  const ch = channel ? channelLabel(config, channel) : "";
  switch (code) {
    case "setupDefaulted":
      return "Not in this quarter's agent setup yet — scored with defaults (regular, region from Location).";
    case "userMissing":
      return "No agendo user with this id any more.";
    case "hoursOverridden":
      return "Hours were imported for this agent and replace their agendo shifts.";
    case "lowSample":
      return `Fewer than ${config.quality.minSurveys} surveys — quality ×${config.quality.lowSamplePenalty}.`;
    case "noSurveys":
      return "No CSAT surveys — quality can't be scored, so no APS.";
    case "noFacts":
      return "Nothing imported for this agent this quarter.";
    case "volumeProxy":
      return "No shift hours — productivity scored from volume against the cohort instead.";
    case "channelNoHours":
      return `${ch} handled without ${ch.toLowerCase()} hours — left out of productivity.`;
    case "noBenchmark":
      return `No ${ch.toLowerCase()} benchmark in this cohort.`;
    case "outlier":
      return `${ch} rate is ${config.dispersion.outlierZ}σ or more from the cohort mean.`;
    case "noScoredInteractions":
      return "Hours logged in the scored channels, but no interactions there.";
    case "noVolumeReference":
      return "No regular agents in the cohort to compare volume with.";
    case "unknownRole":
      return "Role not defined in this methodology version.";
    case "noRegion":
      return "No region set — scored in the first cohort.";
    default:
      return flag;
  }
}

export const WARNING_TEXT: Record<string, (w: { source?: string; count?: number; cohort?: string; channel?: string }) => string> = {
  noFactsForSource: (w) => `No ${w.source} imported yet for this quarter.`,
  skippedUnmatched: (w) => `${w.count} shift(s) belong to no agendo user and were left out of the hours.`,
  setupDefaulted: (w) => `${w.count} agent(s) aren't in this quarter's setup yet and are scored with defaults.`,
  userMissing: (w) => `${w.count} agent(s) have data but no agendo user any more.`,
  noBenchmark: (w) => `No ${w.channel} benchmark for the ${w.cohort} cohort — no regular agent there has a rate.`,
};

export function gradeClass(grade: string | null) {
  switch (grade) {
    case "A+":
    case "A":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "B":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300";
    case "C":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "D":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Shown under a cohort's title: "Chats 2.42/h · σ 0.45 · n 11". */
export function benchmarkText(
  stats: { value: number | null; sd: number | null; n: number },
  minN: number,
) {
  const parts = [stats.value == null ? "no benchmark" : `${num(stats.value, 2)}/h`];
  parts.push(stats.n >= minN && stats.sd != null ? `σ ${num(stats.sd, 2)}` : "σ n/a");
  parts.push(`n ${stats.n}`);
  return parts.join(" · ");
}
