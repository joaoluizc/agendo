/**
 * Per-agent figures before any scoring: what the quarterly sheet's "Total Support
 * Interactions" tab shows. Pure — the inputs are already-loaded facts and minutes.
 */

/**
 * Minutes to the hours the methodology works in. The epsilon keeps a float like
 * 179.99999999 minutes (shift edges are whole minutes, the division isn't) from flooring
 * an hour short.
 */
export function hoursFrom(minutes, rounding) {
  const hours = (minutes || 0) / 60;
  return rounding === "floor" ? Math.floor(hours + 1e-9) : hours;
}

/**
 * facts:   { [channel]: { count, csat (0..1|null), surveys, good?, bad? } }
 * minutes: { [channel]: minutes worked in that channel's report group }
 *
 * Weighted CSAT = Σ good ÷ Σ surveys over the interaction channels, where good is the
 * imported good-ratings count or csat × surveys. Unrounded, that equals the sheet's
 * Σ(csat × surveys) ÷ Σ surveys exactly.
 */
export function deriveAgent(facts, minutes, config) {
  const channels = {};
  for (const [key, def] of Object.entries(config.channels)) {
    const fact = facts?.[key];
    const count = fact?.count ?? null;
    const csat = fact?.csat ?? null;
    const surveys = fact?.surveys ?? null;
    const good = fact?.good ?? (csat != null && surveys != null ? csat * surveys : null);
    const bad = fact?.bad ?? (good != null && surveys != null ? surveys - good : null);
    const hours = def.hoursGroup ? hoursFrom(minutes?.[key], config.hours.rounding) : null;
    // A rate needs real time in the channel; below the minimum there is no rate at all,
    // rather than a huge one from dividing by a sliver of an hour.
    const rate =
      def.hoursGroup && hours >= config.hours.minChannelHours ? (count ?? 0) / hours : null;
    channels[key] = { count, hours, rate, csat, surveys, good, bad, imported: Boolean(fact) };
  }

  let totalInteractions = 0;
  let totalSurveys = 0;
  let good = 0;
  let bad = 0;
  for (const key of config.interactionChannels) {
    const c = channels[key];
    if (!c) continue;
    totalInteractions += c.count ?? 0;
    if (c.surveys > 0 && c.good != null) {
      totalSurveys += c.surveys;
      good += c.good;
      bad += c.bad ?? c.surveys - c.good;
    }
  }

  return {
    channels,
    totalInteractions,
    totalSurveys,
    good,
    bad,
    weightedCsat: totalSurveys > 0 ? good / totalSurveys : null,
    pctRated: totalInteractions > 0 ? totalSurveys / totalInteractions : null,
    hasFacts: Object.values(channels).some((c) => c.imported),
  };
}
