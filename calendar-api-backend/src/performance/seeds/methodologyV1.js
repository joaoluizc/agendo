/**
 * Methodology v1: the CRO's Agent Performance Score ("Support APS score v2", built on Q1
 * 2026 data), with two decisions made when it moved into agendo:
 *   - APAC is its own cohort with its own benchmark (its volume per hour is much lower,
 *     so comparing it to US/BR/IL would skew both), still chat-only as the CRO had it.
 *   - Benchmarks are each quarter's cohort mean of per-agent rates, not the CRO's fixed
 *     Q1 numbers (2.61 chats/h, 0.87 tickets/h).
 *
 * Config only — never names or real numbers (this repository is public). Who is a team
 * lead, a billing specialist and so on is set per quarter in the Performance page.
 *
 * Seeded once by methodologyService and immutable from then on: to change the rules, add
 * a new version file (aps-v2) next to this one, never edit this one. See ../README.md.
 */
export const METHODOLOGY_V1 = {
  key: "aps-v1",
  name: "APS v1",
  summary:
    "The CRO's Agent Performance Score: productivity against the cohort average plus CSAT quality, " +
    "with role-specific formulas for team leads and billing. APAC is scored as its own cohort, on chats only.",
  config: {
    channels: {
      chats: { label: "Chats", hoursGroup: "Chats" },
      tickets: { label: "Tickets", hoursGroup: "Tickets" },
      screenshares: { label: "Screen-shares" },
    },
    // Channels that count toward total interactions and weighted CSAT. Screen-shares are
    // shown but scored nowhere, as in the CRO's sheet.
    interactionChannels: ["chats", "tickets"],
    // Whole hours, truncated: what the quarterly sheet used (it copied agendo's hours report).
    hours: { rounding: "floor", minChannelHours: 1 },
    productivity: {
      // index = min(rate / benchmark, capMultiple) / capMultiple × 100
      index: { method: "ratio", capMultiple: 1.5 },
      // channel indexes weighted by each channel's share of the agent's interactions
      blend: "interactionShare",
      // stat: "mean" | "median" | "fixed" (fixed reads `fixed: { chats, tickets }`)
      benchmark: { stat: "mean", roles: ["regular"] },
      // interactions but no usable hours at all: score volume against the cohort instead
      noHours: { mode: "volumeProxy", capMultiple: 1.5 },
    },
    quality: { floor: 0.7, span: 0.3, minSurveys: 5, lowSamplePenalty: 0.8 },
    // volume = min(total interactions / mean of these roles in the same cohort, cap) × 100
    volume: { referenceRoles: ["regular"], cap: 1 },
    cohorts: {
      core: { label: "US · BR · IL", productivityChannels: ["chats", "tickets"] },
      apac: { label: "APAC", productivityChannels: ["chats"] },
    },
    cohortByRegion: { US: "core", BR: "core", IL: "core", APAC: "apac" },
    roles: {
      regular: {
        label: "Agent",
        weights: { productivity: 0.6, quality: 0.4 },
        board: "leaderboard",
      },
      billingSplit: {
        label: "Billing split",
        weights: { productivity: 0.6, quality: 0.4 },
        productivityChannels: ["chats"],
        board: "leaderboard",
      },
      billingSpecialist: {
        label: "Billing specialist",
        weights: { volume: 0.5, quality: 0.5 },
        board: "leadsBilling",
      },
      teamLead: {
        label: "Team lead",
        weights: { volume: 0.3, quality: 0.7 },
        board: "leadsBilling",
      },
      excluded: { label: "Not graded", graded: false, board: "leadsBilling" },
    },
    // Graded on APS rounded to one decimal; the last band has no minimum.
    grades: [
      { grade: "A+", min: 90 },
      { grade: "A", min: 80 },
      { grade: "B", min: 70 },
      { grade: "C", min: 60 },
      { grade: "D", min: null },
    ],
    // σ is shown only for cohorts this big; |z| at or above outlierZ is flagged.
    dispersion: { minN: 5, outlierZ: 2 },
  },
};

export const METHODOLOGY_SEEDS = [METHODOLOGY_V1];
