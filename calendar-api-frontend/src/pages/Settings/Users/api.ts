/**
 * Thin client for the admin-only user endpoints behind Settings → Users. Same calling
 * convention as the rest of agendo (see pages/Reports/api.ts): same-origin "/api" proxy +
 * credentials:"include" so the Clerk session cookie rides along.
 */
const BASE = "/api/user";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
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
    const p = payload as { message?: string; error?: string } | null;
    throw new ApiError(
      p?.message || p?.error || `Request failed (${res.status})`,
      res.status
    );
  }
  return payload as T;
}

export type SavedPreferences = {
  preferences: string;
  preferencesUpdatedAt: string | null;
  preferencesUpdatedBy: string | null;
};

export const usersApi = {
  /**
   * Set an agent's timezone. Admin-only server-side (`adminOnly` on
   * `PUT /user/:clerkId/timezone`), not merely hidden in this UI.
   */
  setTimezone: (userId: string, timezone: string) =>
    request<{ clerkId: string; timezone: string }>(
      `/${encodeURIComponent(userId)}/timezone`,
      { method: "PUT", body: { timezone } }
    ),
  /** `userId` is the agent's Clerk id — `UserSafeInfo.id`. */
  savePreferences: (userId: string, preferences: string) =>
    request<SavedPreferences>(`/${encodeURIComponent(userId)}/preferences`, {
      method: "PUT",
      body: { preferences },
    }),
};
