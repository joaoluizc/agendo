import { JiraIssue } from "./types";

/**
 * Urgency score — an EXACT mirror of the backend
 * (calendar-api-backend/src/jiraBacklog/lib/urgency.js). Kept on the client only for
 * instant visual feedback while editing; the server always recalculates authoritatively
 * on save, and its result replaces the optimistic value. If you change one file, change
 * the other (and re-verify against the seed).
 */

const SCOPE_SCORES: Record<string, number> = {
  "One site, one client": 1,
  "Several sites, one client": 3,
  "Several clients, not confirmed widespread": 6,
  "Confirmed all sites / master": 10,
};

const PLAN_SCORES: Record<string, number> = {
  Basic: 0,
  Team: 2,
  Agency: 4,
  "Enterprise/mid-market": 7,
  "Managed enterprise": 9,
  "VIP managed enterprise": 10,
};

const FRUST_SCORES: Record<string, number> = {
  "Low — minor inconvenience": 2,
  "Medium — slowing workflow": 6,
  "High — blocking or escalating": 10,
};

function workaroundScore(workaround: string, workaroundQ: string): number | null {
  if (workaround === "No workaround found") return 10;
  if (workaround === "Workaround found — client rejected it") return 9;
  if (workaround === "Workaround found — client accepted it") {
    return workaroundQ === "Workaround is reasonable" ? 3 : 6;
  }
  return null;
}

// Round half to even ("banker's rounding"), matching the seed generator.
function roundHalfToEven(value: number): number {
  const x = Number(value.toPrecision(12));
  const floor = Math.floor(x);
  const diff = x - floor;
  const EPS = 1e-9;
  if (diff < 0.5 - EPS) return floor;
  if (diff > 0.5 + EPS) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function computeUrgency(issue: Partial<JiraIssue>): number | null {
  const { scope, planTier, workaround, frustration, scopeConf, workaroundQ, bugType } = issue;

  if (bugType === "Regression") return null;
  if (!scope || !planTier || !workaround || !frustration || !scopeConf || !workaroundQ) {
    return null;
  }

  let scopeScore = SCOPE_SCORES[scope];
  if (scopeScore == null) return null;
  if (scopeConf === "Likely wider than reported") scopeScore = Math.min(scopeScore + 2, 10);

  const planScore = PLAN_SCORES[planTier];
  const frustScore = FRUST_SCORES[frustration];
  const waScore = workaroundScore(workaround, workaroundQ);
  if (planScore == null || frustScore == null || waScore == null) return null;

  return roundHalfToEven(
    (scopeScore * 0.3 + planScore * 0.25 + frustScore * 0.25 + waScore * 0.2) * 10,
  );
}

/** Fields that feed the urgency score — used for optimistic client-side recalc. */
export const URGENCY_INPUT_FIELDS: (keyof JiraIssue)[] = [
  "scope",
  "planTier",
  "workaround",
  "frustration",
  "scopeConf",
  "workaroundQ",
  "bugType",
];

/** Tailwind classes for the urgency cell background per the spec's colour bands. */
export function urgencyCellClasses(value: number | null): string {
  if (value == null) return "";
  if (value >= 80) return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (value >= 60) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-green-500/15 text-green-700 dark:text-green-300";
}
