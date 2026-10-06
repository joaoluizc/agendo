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
    /** Admin-only. Absent for non-admin callers - see userController.getAllUsers. */
    email?: string;
    /** Admin-only. Absent for non-admin callers. */
    slingId?: string;
    /** Admin-only. The agent's stored IANA timezone; "UTC" until they or an admin set one. */
    timezone?: string;
    /** Admin-only. Absent for non-admin callers. Never gate UI on this - use
     *  `useUserSettings().type`, which comes from `/user/info`. */
    type?: string;
    /** Admin-only. Managers' notes on how this agent likes to be scheduled, as HTML
     *  from Settings → Users; "" when there are none. Absent for non-admin callers.
     *  Render with `PreferencesContent`, never as raw HTML. */
    preferences?: string;
    /** Admin-only. ISO time `preferences` was last saved, or null. */
    preferencesUpdatedAt?: string | null;
    /** Admin-only. Clerk id of the admin who last saved `preferences`, or null. */
    preferencesUpdatedBy?: string | null;
};
