/**
 * Urgency score (0–100), auto-calculated from six fields. Ported verbatim from the
 * seed export's formula and verified to reproduce all 53 seed scores exactly.
 *
 *   ROUND((scope*0.3 + plan*0.25 + frust*0.25 + wa*0.2) * 10, 0)
 *
 * Returns null when bugType is "Regression" (regressions are triaged separately) or
 * when any of the six inputs is empty.
 *
 * Rounding is half-to-even ("banker's rounding"). The seed was generated that way, so
 * matching it keeps the auto-calc consistent with the imported data — otherwise eight
 * seed rows (the exact .5 cases, e.g. 82.5) would flip by 1 the first time a field is
 * edited and look like spurious "corrections". The frontend mirror in
 * pages/JiraBacklog/urgency.ts MUST stay identical to this file.
 */

const SCOPE_SCORES = {
  "One site, one client": 1,
  "Several sites, one client": 3,
  "Several clients, not confirmed widespread": 6,
  "Confirmed all sites / master": 10,
};

// Includes Basic/Team (score 0/2) even though they aren't selectable in the dropdown —
// kept for parity with the source formula in case the options ever expand.
const PLAN_SCORES = {
  Basic: 0,
  Team: 2,
  Agency: 4,
  "Enterprise/mid-market": 7,
  "Managed enterprise": 9,
  "VIP managed enterprise": 10,
};

const FRUST_SCORES = {
  "Low — minor inconvenience": 2,
  "Medium — slowing workflow": 6,
  "High — blocking or escalating": 10,
};

function workaroundScore(workaround, workaroundQ) {
  if (workaround === "No workaround found") return 10;
  if (workaround === "Workaround found — client rejected it") return 9;
  if (workaround === "Workaround found — client accepted it") {
    return workaroundQ === "Workaround is reasonable" ? 3 : 6;
  }
  return null;
}

// Round half to even. toPrecision(12) first washes out binary FP noise (e.g.
// 58.49999999999999 -> 58.5) so the exact-half case is detected regardless of
// accumulation order.
function roundHalfToEven(value) {
  const x = Number(value.toPrecision(12));
  const floor = Math.floor(x);
  const diff = x - floor;
  const EPS = 1e-9;
  if (diff < 0.5 - EPS) return floor;
  if (diff > 0.5 + EPS) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * @param {object} issue partial issue with scope/planTier/workaround/frustration/scopeConf/workaroundQ/bugType
 * @returns {number|null}
 */
export function computeUrgency(issue = {}) {
  const { scope, planTier, workaround, frustration, scopeConf, workaroundQ, bugType } = issue;

  if (bugType === "Regression") return null;
  if (!scope || !planTier || !workaround || !frustration || !scopeConf || !workaroundQ) {
    return null;
  }

  let scopeScore = SCOPE_SCORES[scope];
  if (scopeScore == null) return null;
  if (scopeConf === "Likely wider than reported") {
    scopeScore = Math.min(scopeScore + 2, 10);
  }

  const planScore = PLAN_SCORES[planTier];
  const frustScore = FRUST_SCORES[frustration];
  const waScore = workaroundScore(workaround, workaroundQ);
  if (planScore == null || frustScore == null || waScore == null) return null;

  return roundHalfToEven(
    (scopeScore * 0.3 + planScore * 0.25 + frustScore * 0.25 + waScore * 0.2) * 10,
  );
}

// Fields that feed the urgency score — used by the service to decide when to recalc.
export const URGENCY_INPUT_FIELDS = [
  "scope",
  "planTier",
  "workaround",
  "frustration",
  "scopeConf",
  "workaroundQ",
  "bugType",
];
