/**
 * The scoring engine: one quarter's facts and hours, read through one methodology
 * config. Pure (no I/O, no clock), so any period can be scored with any methodology
 * version and the same inputs always give the same scores. See ../README.md for the
 * methodology and seeds/methodologyV1.js for what each config knob means.
 *
 * Full precision throughout; only `apsRounded` is rounded, because the grade is read
 * from the score as displayed.
 */
import { describe, zScore } from "./stats.js";
import { deriveAgent } from "./interactions.js";
import { round1, gradeFor } from "./grades.js";

// Bump when a change here would score the same inputs and config differently.
export const ENGINE_VERSION = 1;

const BOARD_ORDER = ["leaderboard", "leadsBilling"];

function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

/** The cohort's productivity channels, narrowed by the role's own list if it has one. */
function productivityChannelsFor(role, cohortConfig) {
  const channels = cohortConfig?.productivityChannels || [];
  return role?.productivityChannels
    ? channels.filter((c) => role.productivityChannels.includes(c))
    : channels;
}

function computeBenchmarks(prepared, config) {
  const { benchmark } = config.productivity;
  const benchmarks = {};
  for (const [cohort, cohortConfig] of Object.entries(config.cohorts)) {
    const members = prepared.filter((p) => p.cohort === cohort);
    // Agents with no imported data at all would only add zero rates: missing data, not
    // zero work.
    const benchmarkMembers = members.filter(
      (p) => benchmark.roles.includes(p.roleKey) && p.derived.hasFacts,
    );
    const channels = {};
    for (const channel of config.interactionChannels) {
      const stats = describe(benchmarkMembers.map((p) => p.derived.channels[channel]?.rate));
      let value = stats.mean;
      if (benchmark.stat === "median") value = stats.median;
      if (benchmark.stat === "fixed") value = benchmark.fixed?.[channel] ?? null;
      channels[channel] = { ...stats, value };
    }
    const volumeMembers = members.filter(
      (p) => config.volume.referenceRoles.includes(p.roleKey) && p.derived.totalInteractions > 0,
    );
    benchmarks[cohort] = {
      label: cohortConfig.label,
      productivityChannels: cohortConfig.productivityChannels,
      channels,
      interactions: describe(volumeMembers.map((p) => p.derived.totalInteractions)),
    };
  }
  return benchmarks;
}

function scoreProductivity(p, bench, config, flags) {
  const cap = config.productivity.index.capMultiple;
  const channels = {};
  let shareBase = 0;
  for (const channel of productivityChannelsFor(p.role, config.cohorts[p.cohort])) {
    const c = p.derived.channels[channel];
    const count = c?.count ?? 0;
    const benchmark = bench.channels[channel]?.value ?? null;
    let ratio = null;
    let index = null;
    if (c?.rate == null) {
      // Interactions with no time logged in the channel can't make a rate: the channel
      // drops out of the blend rather than scoring as infinitely fast or zero.
      if (count > 0) flags.push(`channelNoHours:${channel}`);
    } else if (!(benchmark > 0)) {
      flags.push(`noBenchmark:${channel}`);
    } else {
      ratio = c.rate / benchmark;
      index = (Math.min(ratio, cap) / cap) * 100;
      shareBase += count;
    }
    channels[channel] = {
      count,
      hours: c?.hours ?? null,
      rate: c?.rate ?? null,
      benchmark,
      ratio,
      index,
      share: null,
    };
  }

  const usable = Object.values(channels).filter((s) => s.index != null);
  if (usable.length && shareBase > 0) {
    let value = 0;
    for (const s of usable) {
      s.share = s.count / shareBase;
      value += s.index * s.share;
    }
    return { mode: "rates", value, channels };
  }
  if (usable.length) {
    // Time logged in the scored channels but nothing handled there.
    flags.push("noScoredInteractions");
    return { mode: "rates", value: 0, channels };
  }
  const noHours = config.productivity.noHours;
  const reference = bench.interactions.mean;
  if (p.derived.totalInteractions > 0 && noHours?.mode === "volumeProxy" && reference > 0) {
    flags.push("volumeProxy");
    const ratio = p.derived.totalInteractions / reference;
    const proxyCap = noHours.capMultiple;
    return {
      mode: "volumeProxy",
      ratio,
      reference,
      value: (Math.min(ratio, proxyCap) / proxyCap) * 100,
      channels,
    };
  }
  return { mode: "none", value: null, channels };
}

function scoreVolume(p, bench, config) {
  const reference = bench.interactions.mean;
  if (!(reference > 0)) return { total: p.derived.totalInteractions, reference: null, ratio: null, value: null };
  const ratio = p.derived.totalInteractions / reference;
  return {
    total: p.derived.totalInteractions,
    reference,
    ratio,
    value: Math.min(ratio, config.volume.cap) * 100,
  };
}

function scoreQuality(p, config, flags) {
  const q = config.quality;
  const { weightedCsat, totalSurveys } = p.derived;
  if (weightedCsat == null) {
    flags.push("noSurveys");
    return { weightedCsat: null, surveys: totalSurveys, raw: null, value: null, penalized: false };
  }
  const raw = clamp(((weightedCsat - q.floor) / q.span) * 100, 0, 100);
  const penalized = totalSurveys < q.minSurveys;
  if (penalized) flags.push("lowSample");
  return {
    weightedCsat,
    surveys: totalSurveys,
    raw,
    value: penalized ? raw * q.lowSamplePenalty : raw,
    penalized,
  };
}

/** Competition ranking (1, 2, 2, 4) on the displayed score. */
function assignRanks(rows, keyFn, field) {
  const groups = new Map();
  for (const row of rows) {
    if (row.apsRounded == null) continue;
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const members of groups.values()) {
    members.sort((a, b) => b.apsRounded - a.apsRounded);
    members.forEach((row, i) => {
      const prev = members[i - 1];
      row.ranks[field] = prev && prev.apsRounded === row.apsRounded ? prev.ranks[field] : i + 1;
    });
  }
}

/**
 * agents:  [{ clerkId, region, role, cohortOverride }]
 * facts:   { [clerkId]: { [channel]: { count, csat, surveys, good?, bad? } } }
 * minutes: { [clerkId]: { [channel]: minutes } }
 *
 * Returns { benchmarks: { [cohort]: … }, rows: [...], warnings: [...], engineVersion }.
 */
export function scorePeriod({ agents, facts, minutes, config }) {
  const cohortKeys = Object.keys(config.cohorts);
  const prepared = agents.map((agent) => {
    const flags = [];
    const roleKey = config.roles[agent.role] ? agent.role : null;
    if (!roleKey) flags.push("unknownRole");
    let cohort =
      agent.cohortOverride && config.cohorts[agent.cohortOverride]
        ? agent.cohortOverride
        : config.cohortByRegion[agent.region];
    if (!cohort) {
      cohort = cohortKeys[0];
      flags.push("noRegion");
    }
    return {
      agent,
      roleKey,
      role: roleKey ? config.roles[roleKey] : null,
      cohort,
      derived: deriveAgent(facts[agent.clerkId], minutes[agent.clerkId], config),
      flags,
    };
  });

  const benchmarks = computeBenchmarks(prepared, config);
  const warnings = [];
  for (const [cohort, bench] of Object.entries(benchmarks)) {
    const needed = new Set(
      prepared
        .filter((p) => p.cohort === cohort && p.role?.weights?.productivity > 0)
        .flatMap((p) => productivityChannelsFor(p.role, config.cohorts[cohort])),
    );
    for (const channel of needed) {
      if (!(bench.channels[channel]?.value > 0)) {
        warnings.push({ code: "noBenchmark", cohort, channel });
      }
    }
  }

  const rows = prepared.map((p) => {
    const flags = [...p.flags];
    const bench = benchmarks[p.cohort];
    const weights = p.role?.weights || {};
    const graded = Boolean(p.role) && p.role.graded !== false;

    const z = {};
    for (const channel of config.interactionChannels) {
      z[channel] = zScore(
        p.derived.channels[channel]?.rate,
        bench.channels[channel],
        config.dispersion.minN,
      );
      if (z[channel] != null && Math.abs(z[channel]) >= config.dispersion.outlierZ) {
        flags.push(`outlier:${channel}`);
      }
    }

    // Computed for every role, so a team lead's productivity can be shown as reference
    // even though their formula doesn't use it (`inAps`).
    const productivity = {
      ...scoreProductivity(p, bench, config, flags),
      inAps: weights.productivity > 0,
    };
    const volume = scoreVolume(p, bench, config);
    if (weights.volume > 0 && volume.value == null) flags.push("noVolumeReference");
    const quality = scoreQuality(p, config, flags);
    if (!p.derived.hasFacts) flags.push("noFacts");

    let aps = null;
    if (graded && p.derived.hasFacts) {
      const parts = { productivity: productivity.value, volume: volume.value, quality: quality.value };
      let sum = 0;
      let complete = true;
      for (const [part, weight] of Object.entries(weights)) {
        if (!(weight > 0)) continue;
        if (parts[part] == null) {
          complete = false;
          break;
        }
        sum += weight * parts[part];
      }
      if (complete) aps = sum;
    }
    const apsRounded = round1(aps);

    return {
      clerkId: p.agent.clerkId,
      region: p.agent.region ?? null,
      role: p.roleKey,
      roleLabel: p.role?.label ?? null,
      cohort: p.cohort,
      board: p.role?.board ?? "leadsBilling",
      graded,
      inputs: p.derived,
      productivity,
      volume,
      quality,
      weights,
      aps,
      apsRounded,
      grade: gradeFor(apsRounded, config.grades),
      z,
      ranks: { cohort: null, region: null },
      flags,
    };
  });

  const ranked = rows.filter((r) => r.board === "leaderboard" && r.graded);
  assignRanks(ranked, (r) => r.cohort, "cohort");
  assignRanks(ranked, (r) => `${r.cohort}|${r.region}`, "region");

  rows.sort(
    (a, b) =>
      BOARD_ORDER.indexOf(a.board) - BOARD_ORDER.indexOf(b.board) ||
      cohortKeys.indexOf(a.cohort) - cohortKeys.indexOf(b.cohort) ||
      (b.aps ?? -Infinity) - (a.aps ?? -Infinity) ||
      String(a.clerkId).localeCompare(String(b.clerkId)),
  );

  return { benchmarks, rows, warnings, engineVersion: ENGINE_VERSION };
}
