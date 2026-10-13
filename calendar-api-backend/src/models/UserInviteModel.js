import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Access an admin set for an email before that person has an agendo user (Settings →
 * Users → Invite). Silent: nothing is sent to the person. When their agendo user is
 * created — by Clerk's webhook, their first request, or straight away if they already have
 * a Clerk account — this access is applied, a PermissionAudit record (`via: "invite"`)
 * keeps what was granted and by whom, and the invite is deleted. So this collection only
 * ever holds pending invites. See docs/knowledge/onboarding.md.
 *
 * Env-split like `users` (see UserModel.js): an invite is about to become one of them.
 */
const UserInviteSchema = new Schema(
  {
    // Normalized (trimmed, lowercased) by permissions/onboarding.js before it gets here.
    email: { type: String, required: true, unique: true },
    type: { type: String, enum: ["normal", "admin"], required: true, default: "normal" },
    // A full set, one level per area: validated and merged over the new-user defaults by
    // planInvite, so it is stored the way it will be applied.
    permissions: { type: Schema.Types.Mixed, required: true },
    // Clerk ids of the admins who created it and last changed it.
    invitedBy: { type: String, required: true },
    invitedAt: { type: Date, required: true, default: Date.now },
    updatedBy: { type: String },
    updatedAt: { type: Date },
  },
  { versionKey: false },
);

export const USER_INVITE_COLLECTIONS = Object.freeze({
  production: "user-invites",
  development: "dev-user-invites",
});

const collectionName =
  process.env.NODE_ENV === "development"
    ? USER_INVITE_COLLECTIONS.development
    : USER_INVITE_COLLECTIONS.production;

export const UserInvite = mongoose.model("UserInvite", UserInviteSchema, collectionName);

export default UserInvite;
