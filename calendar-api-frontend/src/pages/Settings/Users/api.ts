import type { AreaKey, Permissions } from "@/permissions/permissions";
import type { UserSafeInfo } from "@/types/userTypes";

/**
 * Thin client for the admin-only user endpoints behind Settings → Users. Same calling
 * convention as the rest of agendo (see pages/Reports/api.ts): same-origin "/api" proxy +
 * credentials:"include" so the Clerk session cookie rides along.
 */
const BASE = "/api/user";

export class ApiError extends Error {
  status: number;
  /** The rest of the error body, e.g. `clerkId` on an invite for someone already in agendo. */
  payload: Record<string, unknown> | null;
  constructor(message: string, status: number, payload: Record<string, unknown> | null = null) {
    super(message);
    this.status = status;
    this.payload = payload;
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
      res.status,
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null
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
   * Set an agent's timezone. Admin-only server-side (`requireAdmin` on
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
  /**
   * Change someone's access: their area levels and/or admin flag. Admin-only server-side;
   * the server also refuses changing your own access (403) and demoting the last admin
   * (409). `permissions` may be partial — it is merged over what they have.
   */
  setAccess: (userId: string, body: { type?: "admin" | "normal"; permissions?: Partial<Permissions> }) =>
    request<SavedAccess>(`/${encodeURIComponent(userId)}/permissions`, {
      method: "PUT",
      body,
    }),
  /** Areas, levels and their copy, for the access editor. Any signed-in user may read it. */
  getPermissionRegistry: () => request<PermissionRegistry>("/permission-registry"),
  /**
   * Offboard someone: delete them from agendo and from Clerk. Irreversible. Admin-only
   * server-side; the server also refuses offboarding yourself (403) and the last admin
   * (409).
   *
   * Resolves with a report of what each step did — including a **207**, which means access
   * was cut but some cleanup failed. `res.ok` covers 207, so a partial failure arrives
   * here as a resolved promise with a non-empty `errors`; check it rather than assuming
   * that not throwing means everything worked.
   */
  offboard: (userId: string) =>
    request<OffboardResult>(`/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  /** The roster again — after an invite provisions someone, so they show up in the list. */
  getRoster: () => request<UserSafeInfo[]>("/all"),
  /** Pending invites, newest first. Admin-only server-side. */
  listInvites: () => request<Invite[]>("/invites"),
  /**
   * Create or update the invite for `email` (it is the key). `permissions` may be partial —
   * merged over the invite being edited, or the new-user defaults. Nothing is sent to the
   * person. If they already have a Clerk account they're provisioned right away
   * (`status: "provisioned"`). An email already in agendo is a 409 whose payload carries
   * their `clerkId`.
   */
  saveInvite: (body: { email: string; type?: "admin" | "normal"; permissions?: Partial<Permissions> }) =>
    request<SavedInvite>("/invites", { method: "POST", body }),
  revokeInvite: (inviteId: string) =>
    request<{ id: string; revoked: true }>(`/invites/${encodeURIComponent(inviteId)}`, {
      method: "DELETE",
    }),
};

export type Invite = {
  id: string;
  email: string;
  type: "admin" | "normal";
  permissions: Partial<Permissions>;
  invitedBy: string;
  invitedAt: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type SavedInvite =
  | { status: "pending"; invite: Invite }
  | {
      status: "provisioned";
      user: { id: string; email: string; firstName: string; lastName: string; type: "admin" | "normal" };
    };

/** What `DELETE /user/:clerkId` reports back. See services/offboardService.js. */
export type OffboardResult = {
  id: string;
  name: string | null;
  /** False when there was no agendo user left to delete — a resumed, half-finished offboard. */
  mongoUserDeleted: boolean;
  clerkUserDeleted: boolean;
  /** Clerk had no such account; nothing to do there. */
  clerkAlreadyGone: boolean;
  futureShiftsDeleted: number;
  pastShiftsKept: number;
  locationsUpdated: number;
  /** Cleanup that failed after access was already cut. Empty on a clean run. */
  errors: { step: string; message: string }[];
};

export type SavedAccess = {
  id: string;
  type: "admin" | "normal";
  permissions: Partial<Permissions> | null;
  permissionsUpdatedAt: string | null;
  permissionsUpdatedBy: string | null;
  effectivePermissions: Permissions;
};

export type PermissionRegistry = {
  version: number;
  areas: {
    key: AreaKey;
    label: string;
    levels: { key: string; description: string }[];
    defaultForNewUsers: string;
  }[];
};
