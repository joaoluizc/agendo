/**
 * Thin client for the /performance backend (calendar-api-backend/src/performance). Same
 * convention as pages/Reports/api.ts: same-origin "/api" proxy, credentials:"include" so
 * the Clerk session rides along. Admin-gated server-side.
 */
const BASE = "/api/performance";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    mode: "cors",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // 204s and the odd empty error have no body
  }

  if (!res.ok) {
    const p = payload as { message?: string } | null;
    throw new ApiError(p?.message || `Request failed (${res.status})`, res.status);
  }
  return payload as T;
}

export type Region = "US" | "BR" | "IL" | "APAC";
export const REGIONS: Region[] = ["US", "BR", "IL", "APAC"];

/**
 * Each region is a scheduling Location (the four flag locations in the schedule's
 * LocationFilter): the backend defaults a quarter's regions from Location membership
 * with the same mapping (src/performance/lib/regions.js).
 */
export const LOCATION_BY_REGION: Record<Region, string> = {
  US: "Colorado",
  BR: "LATAM",
  IL: "Israel",
  APAC: "APAC",
};
export type ImportSource = "tickets" | "chats" | "screenshares" | "hours";

export interface Stats {
  n: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

export interface RoleConfig {
  label: string;
  weights?: Record<string, number>;
  productivityChannels?: string[];
  board: "leaderboard" | "leadsBilling";
  graded?: boolean;
}

export interface CohortConfig {
  label: string;
  productivityChannels: string[];
}

/** Mirrors the backend's seeds/methodologyV1.js; see its comments for each knob. */
export interface MethodologyConfig {
  channels: Record<string, { label: string; hoursGroup?: string }>;
  interactionChannels: string[];
  hours: { rounding: "floor" | "none"; minChannelHours: number };
  productivity: {
    index: { method: string; capMultiple: number };
    blend: string;
    benchmark: { stat: "mean" | "median" | "fixed"; roles: string[]; fixed?: Record<string, number> };
    noHours?: { mode: string; capMultiple: number };
  };
  quality: { floor: number; span: number; minSurveys: number; lowSamplePenalty: number };
  volume: { referenceRoles: string[]; cap: number };
  cohorts: Record<string, CohortConfig>;
  cohortByRegion: Record<string, string>;
  roles: Record<string, RoleConfig>;
  grades: { grade: string; min: number | null }[];
  dispersion: { minN: number; outlierZ: number };
}

export interface MethodologySummary {
  key: string;
  name: string;
  summary: string;
  createdAt?: string;
}

export interface Methodology extends MethodologySummary {
  config: MethodologyConfig;
}

export interface PeriodSummary {
  key: string;
  label: string;
  year: number;
  quarter: number;
  startsAt: string;
  endsAt: string;
  tz: string;
  status: "open" | "locked";
  lockedAt: string | null;
  lockedBy: string | null;
  hoursSource: "agendo" | "import";
  methodologyKey: string;
  methodologyHistory: { key: string; setAt: string; setBy: string | null; note: string }[];
}

export interface PeriodListItem extends PeriodSummary {
  factCounts: Partial<Record<ImportSource, number>>;
}

export interface HoursMeta {
  source: "agendo" | "snapshot" | "import";
  computedAt: string | null;
  fromCache: boolean;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  skippedUnmatched: number;
  groups: { name: string; positionNames: string[] }[];
}

export interface Warning {
  code: string;
  cohort?: string;
  channel?: string;
  source?: string;
  count?: number;
}

export interface ChannelInputs {
  count: number | null;
  hours: number | null;
  rate: number | null;
  csat: number | null;
  surveys: number | null;
  good: number | null;
  bad: number | null;
  imported: boolean;
}

export interface AgentInputs {
  channels: Record<string, ChannelInputs>;
  totalInteractions: number;
  totalSurveys: number;
  good: number;
  bad: number;
  weightedCsat: number | null;
  pctRated: number | null;
  hasFacts: boolean;
}

export interface ProductivityChannel {
  count: number;
  hours: number | null;
  rate: number | null;
  benchmark: number | null;
  ratio: number | null;
  index: number | null;
  share: number | null;
}

export interface ScoreRow {
  clerkId: string;
  name: string | null;
  note: string;
  inSetup: boolean;
  region: Region | null;
  role: string | null;
  roleLabel: string | null;
  cohort: string;
  board: "leaderboard" | "leadsBilling";
  graded: boolean;
  inputs: AgentInputs;
  productivity: {
    mode: "rates" | "volumeProxy" | "none";
    value: number | null;
    ratio?: number;
    reference?: number;
    channels: Record<string, ProductivityChannel>;
    inAps: boolean;
  };
  volume: { total: number; reference: number | null; ratio: number | null; value: number | null };
  quality: {
    weightedCsat: number | null;
    surveys: number;
    raw: number | null;
    value: number | null;
    penalized: boolean;
  };
  weights: Record<string, number>;
  aps: number | null;
  apsRounded: number | null;
  grade: string | null;
  z: Record<string, number | null>;
  ranks: { cohort: number | null; region: number | null };
  flags: string[];
  otherMinutes: number;
  unresolvedMinutes: number;
  previous: {
    inputs: AgentInputs;
    aps: number | null;
    apsRounded: number | null;
    grade: string | null;
    role: string | null;
    productivity: number | null;
    quality: number | null;
  } | null;
}

export interface CohortBenchmark {
  label: string;
  productivityChannels: string[];
  channels: Record<string, Stats & { value: number | null }>;
  interactions: Stats;
}

export interface Scores {
  period: PeriodSummary;
  methodology: Methodology;
  official: boolean;
  /** The "leads included" what-if: team leads scored and benchmarked as regular agents. */
  includeLeads?: boolean;
  hours: HoursMeta;
  factCounts: Partial<Record<ImportSource, number>>;
  benchmarks: Record<string, CohortBenchmark>;
  rows: ScoreRow[];
  warnings: Warning[];
  engineVersion: number;
  previousPeriodKey: string | null;
  computedAt: string;
}

export interface OverviewAgent {
  clerkId: string;
  name: string | null;
  region: Region | null;
  role: string;
  cohortOverride: string | null;
  note: string;
  inSetup: boolean;
  userMissing: boolean;
  sources: Record<ImportSource, boolean>;
  minutes: { chats: number; tickets: number; other: number; unresolved: number };
  hoursSource: string | null;
}

export interface ImportSummary {
  _id: string;
  source: ImportSource;
  status: "committing" | "committed" | "failed";
  summary: {
    parsed?: number;
    imported?: number;
    created?: number;
    updated?: number;
    removed?: number;
    skipped?: number;
    aliasesSaved?: number;
  };
  createdAt: string;
  error: string | null;
}

export interface Overview {
  period: PeriodSummary;
  methodology: {
    key: string;
    name: string;
    roles: Record<string, RoleConfig>;
    cohorts: Record<string, CohortConfig>;
    cohortByRegion: Record<string, string>;
  };
  agents: OverviewAgent[];
  hours: HoursMeta;
  factCounts: Partial<Record<ImportSource, number>>;
  imports: ImportSummary[];
  warnings: Warning[];
}

export interface PreviewRow {
  line: number;
  rawName: string;
  email: string | null;
  values: Record<string, number | null>;
  errors: string[];
  match: {
    clerkId: string | null;
    by: string | null;
    name: string | null;
    candidates?: { clerkId: string; name: string; score: number }[];
  };
}

export interface ImportPreview {
  source: ImportSource;
  headerLine: number | null;
  header: string[] | null;
  columns: Record<string, number> | null;
  fields: string[];
  rows: PreviewRow[];
  skipped: { line: number; reason: string; rawName?: string }[];
  errors: string[];
  existingCount: number;
  wouldRemove: { clerkId: string; name: string | null }[];
}

export interface ImportDecision {
  line: number;
  clerkId: string | null;
  matchedBy?: string | null;
  saveAlias?: boolean;
}

export interface AgentSetup {
  clerkId: string;
  region: Region | null;
  role: string;
  cohortOverride: string | null;
  note: string;
}

const q = encodeURIComponent;

export const performanceApi = {
  listMethodologies: () => request<MethodologySummary[]>("/methodologies"),
  listPeriods: () => request<PeriodListItem[]>("/periods"),
  createPeriod: (body: { year: number; quarter: number; hoursSource?: "agendo" | "import" }) =>
    request<PeriodSummary>("/periods", { method: "POST", body }),
  getOverview: (key: string, refresh = false) =>
    request<Overview>(`/periods/${q(key)}${refresh ? "?refresh=true" : ""}`),
  updatePeriod: (
    key: string,
    body: { methodologyKey?: string; hoursSource?: "agendo" | "import"; note?: string },
  ) => request<PeriodSummary>(`/periods/${q(key)}`, { method: "PATCH", body }),
  saveAgents: (key: string, agents: AgentSetup[]) =>
    request<PeriodSummary>(`/periods/${q(key)}/agents`, { method: "PUT", body: { agents } }),
  lock: (key: string) => request<PeriodSummary>(`/periods/${q(key)}/lock`, { method: "POST" }),
  unlock: (key: string) => request<PeriodSummary>(`/periods/${q(key)}/unlock`, { method: "POST" }),
  previewImport: (key: string, body: { source: ImportSource; text: string }) =>
    request<ImportPreview>(`/periods/${q(key)}/imports/preview`, { method: "POST", body }),
  commitImport: (
    key: string,
    body: { source: ImportSource; text: string; decisions: ImportDecision[] },
  ) =>
    request<{ importId: string; summary: ImportSummary["summary"] }>(`/periods/${q(key)}/imports`, {
      method: "POST",
      body,
    }),
  getScores: (key: string, methodologyKey?: string | null, refresh = false, includeLeads = false) => {
    const params = new URLSearchParams();
    if (methodologyKey) params.set("methodology", methodologyKey);
    if (includeLeads) params.set("includeLeads", "true");
    if (refresh) params.set("refresh", "true");
    const qs = params.toString();
    return request<Scores>(`/periods/${q(key)}/scores${qs ? `?${qs}` : ""}`);
  },
};
