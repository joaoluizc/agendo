/**
 * Thin client for the /reports backend. Same calling convention as the rest of agendo:
 * same-origin "/api" proxy + credentials:"include" so the Clerk session cookie rides
 * along. Every endpoint is admin-gated; a non-admin gets 403.
 */
const BASE = "/api/reports";

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
    // some responses (rare) may have no body
  }

  if (!res.ok) {
    const p = payload as { message?: string } | null;
    throw new ApiError(p?.message || `Request failed (${res.status})`, res.status);
  }
  return payload as T;
}

export interface ReportGroup {
  name: "Tickets" | "Chats";
  positionNames: string[];
  order: number;
}

export interface HoursReportRow {
  id: string;
  name: string;
  locationName?: string;
  hours: { Tickets: number; Chats: number; Other: number };
  totalHours: number;
}

export interface HoursReport {
  rows: HoursReportRow[];
  /** When the figures were computed, not when they were served. Null for an entry the
   *  backend cached before it recorded this — those expire on their own. */
  computedAt: string | null;
  fromCache: boolean;
}

export const reportsApi = {
  getGroups: () => request<ReportGroup[]>("/groups"),
  saveGroups: (groups: { name: string; positionNames: string[] }[]) =>
    request<ReportGroup[]>("/groups", { method: "PUT", body: { groups } }),
  /**
   * `refresh` recomputes server-side instead of reading the cached result, which the
   * backend holds for 10 minutes on a range that hasn't closed yet. Needed because
   * nothing invalidates that cache when a shift is published, created, or deleted.
   */
  getHours: async (start: Date, end: Date, groupByLocation: boolean, refresh = false) => {
    const payload = await request<HoursReport | HoursReportRow[]>(
      `/hours?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&groupByLocation=${groupByLocation}${refresh ? "&refresh=true" : ""}`,
    );
    // This endpoint returned a bare array before it reported `computedAt`. Normalise both
    // shapes here: the two services deploy separately, so a frontend that lands ahead of
    // the backend has to degrade to "age unknown" rather than read `rows` off an array
    // and render undefined. Same reason the backend reads both cache shapes.
    if (Array.isArray(payload)) {
      return { rows: payload, computedAt: null, fromCache: false } satisfies HoursReport;
    }
    return {
      rows: payload.rows ?? [],
      computedAt: payload.computedAt ?? null,
      fromCache: payload.fromCache ?? false,
    } satisfies HoursReport;
  },
};
