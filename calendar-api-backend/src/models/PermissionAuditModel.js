import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Append-only record of every change to who can do what in agendo: a user's
 * `permissions` or `type`. Written by the admin access editor and by migration scripts.
 * Nothing updates or deletes these documents — there are no routes for it.
 *
 * Offboarding writes one too, with `after.type === "offboarded"` and no permissions: it
 * is the removal of all of someone's access, and once the user document is gone this
 * record is the only thing left saying who removed them and when. `targetUserId` still
 * points at the deleted document's `_id`, so these records outlive their target by
 * design — that is the point of keeping them.
 *
 * Env-split like `users` (see UserModel.js), because the user ids it points at are:
 * a development run writes to `dev-permission-audits`.
 *
 * Denied requests are not stored here; they are `[perm]` log lines (middlewares/).
 */
const AccessSnapshotSchema = new Schema(
  {
    type: { type: String },
    permissions: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const PermissionAuditSchema = new Schema(
  {
    at: { type: Date, required: true, default: Date.now },
    // How the change was made.
    via: { type: String, required: true, enum: ["web", "migration", "script"] },
    // Clerk id of the admin who made it, or "migration" for a script run.
    actorClerkId: { type: String, required: true },
    targetClerkId: { type: String },
    targetUserId: { type: Schema.Types.ObjectId, required: true },
    before: { type: AccessSnapshotSchema },
    after: { type: AccessSnapshotSchema, required: true },
    requestId: { type: String },
  },
  { versionKey: false },
);

PermissionAuditSchema.index({ targetUserId: 1, at: -1 });

export const PERMISSION_AUDIT_COLLECTIONS = Object.freeze({
  production: "permission-audits",
  development: "dev-permission-audits",
});

const collectionName =
  process.env.NODE_ENV === "development"
    ? PERMISSION_AUDIT_COLLECTIONS.development
    : PERMISSION_AUDIT_COLLECTIONS.production;

export const PermissionAudit = mongoose.model(
  "PermissionAudit",
  PermissionAuditSchema,
  collectionName,
);

export default PermissionAudit;
