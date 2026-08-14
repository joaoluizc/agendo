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
    /** Admin-only. Absent for non-admin callers. Never gate UI on this - use
     *  `useUserSettings().type`, which comes from `/user/info`. */
    type?: string;
};
