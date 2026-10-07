import type { Permissions } from "@/permissions/permissions";

/**
 * A roster entry from `GET /api/user/all`.
 *
 * Mongo is authoritative for `slingId` and `type`; `imageUrl`/`hasImage` are joined in
 * from Clerk because they have no Mongo equivalent.
 * See docs/knowledge/clerk-mongo-boundary.md.
 *
 * `id` is the user's CLERK id — it is joined against `useUser().id` and passed to
 * endpoints that resolve users by Clerk id.
 */
export type UserSafeInfo = {
    id: string;
    firstName: string;
    lastName: string;
    imageUrl: string;
    hasImage: boolean;
    /** Admins and schedule builders. Absent for everyone else - see permissions/shaping.js. */
    email?: string;
    /** Admins and schedule builders. Absent for everyone else. */
    slingId?: string;
    /** Admins and schedule builders. The agent's stored IANA timezone; "UTC" until they or an admin set one. */
    timezone?: string;
    /** Admin-only. Whether this person is an admin. Never gate UI on it — gate on
     *  `useUserSettings().can` / `isAdmin`, which come from `/user/info`. */
    type?: string;
    /** Admin-only. Their stored area levels (null = never set), for the access editor. */
    permissions?: Partial<Permissions> | null;
    /** Admin-only. ISO time their access last changed, or null. */
    permissionsUpdatedAt?: string | null;
    /** Admin-only. Clerk id of the admin who last changed it, or "migration"/"provisioning". */
    permissionsUpdatedBy?: string | null;
    /** Admins and schedule builders (scheduling:edit). Managers' notes on how this agent
     *  likes to be scheduled, as HTML from Settings → Users; "" when there are none.
     *  Absent for everyone else. Render with `PreferencesContent`, never as raw HTML. */
    preferences?: string;
    /** Admins and schedule builders. ISO time `preferences` was last saved, or null. */
    preferencesUpdatedAt?: string | null;
    /** Admins and schedule builders. Clerk id of the admin who last saved `preferences`, or null. */
    preferencesUpdatedBy?: string | null;
};
