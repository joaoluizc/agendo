import mongoose from "mongoose";
import userService from "./userService.js";
import utils from "../utils/utils.js";
import { UserInvite } from "../models/UserInviteModel.js";
import { PermissionAudit } from "../models/PermissionAuditModel.js";
import {
  identityFromClerkUser,
  normalizeEmail,
  planInvite,
  planProvisioning,
} from "../permissions/onboarding.js";

/**
 * Getting people into agendo: turning a Clerk account into an agendo user, and the
 * invites admins set up ahead of that. The decisions are in `permissions/onboarding.js`;
 * this loads what they need and writes what they decide. See docs/knowledge/onboarding.md.
 */

// The Sling lookup only fills in slingId, which is optional and fixable by hand. During
// a first request someone is waiting on it, so it gets a bound.
const SLING_LOOKUP_TIMEOUT_MS = 5000;

// A signed-in Clerk account that may not be provisioned (an old account with no invite)
// would otherwise cost a Clerk API call on every request it makes. Saving an invite
// clears this, so an invite still applies on their very next request.
const REFUSAL_TTL_MS = 5 * 60 * 1000;
const recentRefusals = new Map(); // clerkId -> expiry (ms)
const inFlight = new Map(); // clerkId -> Promise<user|null>

async function lookUpSlingId(email, tag) {
  let timer;
  try {
    const slingId = await Promise.race([
      utils.getSlingIdByEmail(email),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${SLING_LOOKUP_TIMEOUT_MS}ms`)),
          SLING_LOOKUP_TIMEOUT_MS,
        );
      }),
    ]);
    if (!slingId) {
      console.warn(`${tag} - no sling user matches ${email}; continuing without a slingId`);
    }
    return slingId;
  } catch (err) {
    // slingId is optional on the model; a Sling outage must not block anyone's signup.
    console.error(
      `${tag} - sling lookup failed for ${email}: ${err.message}. Continuing without a slingId.`,
    );
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** The invite's access is now the user's: keep the record, then drop the invite. */
async function consumeInvite(invite, user, plan, tag, requestId) {
  try {
    await PermissionAudit.create({
      at: user.permissionsUpdatedAt ?? new Date(),
      via: "invite",
      actorClerkId: plan.grantedBy,
      targetClerkId: user.clerkId,
      targetUserId: user._id,
      after: { type: user.type, permissions: plan.permissions },
      requestId,
    });
  } catch (err) {
    // The access is saved on the user either way; a lost audit record must at least be loud.
    console.error(`${tag} - AUDIT WRITE FAILED for ${user.email}'s invite: ${err.message}`);
  }
  try {
    await UserInvite.deleteOne({ _id: invite._id });
  } catch (err) {
    console.error(`${tag} - could not delete the used invite for ${user.email}: ${err.message}`);
  }
}

/**
 * Make sure this Clerk identity has an agendo user, if the rules allow one.
 *
 * @param identity  from identityFromWebhook / identityFromClerkUser
 * @param source    "webhook" | "request" | "invite" (see permissions/onboarding.js)
 * @returns { user, outcome }: `user` is null when refused, and `outcome` is one of
 *   existing | linked | created | created_from_invite | no_clerk_id | no_email |
 *   unverified_email | email_taken | not_new. Every call logs exactly one outcome line.
 */
export async function provisionIdentity(identity, { source, requestId } = {}) {
  const tag = `[${requestId}]: onboarding(${source})`;
  if (!identity?.clerkId) {
    console.error(`${tag} - no Clerk id on the identity; ignoring`);
    return { user: null, outcome: "no_clerk_id" };
  }

  const already = await userService.findUserByClerkId(identity.clerkId);
  if (already) {
    console.log(`${tag} - ${already.email} (clerkId: ${identity.clerkId}) already has an agendo user`);
    return { user: already, outcome: "existing" };
  }

  const existingByEmail = await userService.findUserByEmail(identity.email);
  let previousAccountGone = false;
  if (existingByEmail?.clerkId && existingByEmail.clerkId !== identity.clerkId) {
    try {
      previousAccountGone = !(await userService.clerkUserExists(existingByEmail.clerkId));
    } catch (err) {
      console.error(
        `${tag} - could not check Clerk account ${existingByEmail.clerkId}: ${err.message}`,
      );
    }
  }
  const invite =
    identity.email && !existingByEmail
      ? await UserInvite.findOne({ email: identity.email })
      : null;

  const plan = planProvisioning({ identity, source, existingByEmail, previousAccountGone, invite });

  if (plan.action === "refuse") {
    console.warn(
      `${tag} - not provisioning ${identity.email || "(no email)"} (clerkId: ${identity.clerkId}): ${plan.reason}`,
    );
    return { user: null, outcome: plan.reason };
  }

  if (plan.action === "link") {
    const previous = plan.user.clerkId;
    const user = await userService.linkClerkId(plan.user, identity.clerkId);
    console.warn(
      `${tag} - LINKED existing agendo user ${user.email} to clerkId ${identity.clerkId} (was ${previous ?? "none"}); their access is unchanged`,
    );
    return { user, outcome: "linked" };
  }

  const slingId = await lookUpSlingId(identity.email, tag);
  const { user, created } = await userService.createUser({
    // A first name is required; a Clerk account can lack one.
    firstName: identity.firstName || identity.email.split("@")[0],
    lastName: identity.lastName,
    email: identity.email,
    slingId,
    clerkId: identity.clerkId,
    type: plan.type,
    permissions: plan.permissions,
    permissionsUpdatedBy: plan.grantedBy,
  });
  if (!created) {
    console.log(
      `${tag} - ${identity.email} (clerkId: ${identity.clerkId}) was provisioned concurrently; using that user`,
    );
    return { user, outcome: "existing" };
  }

  if (plan.invite) {
    await consumeInvite(plan.invite, user, plan, tag, requestId);
  }
  console.log(
    `${tag} - created agendo user ${user.email} (clerkId: ${user.clerkId}, slingId: ${slingId ?? "none"}) with ` +
      (plan.invite
        ? `the access ${plan.grantedBy} invited them with: type ${plan.type}, ${JSON.stringify(plan.permissions)}`
        : `the new-user defaults: ${JSON.stringify(plan.permissions)}`),
  );
  return { user, outcome: plan.invite ? "created_from_invite" : "created" };
}

/**
 * The first-request backstop: a signed-in Clerk account has no agendo user. Fetch the
 * account from Clerk and provision it if the rules allow (a new account, or an invite).
 * Concurrent requests from the same person share one attempt. Resolves to the user or
 * null; rejects only if Clerk or Mongo fail.
 */
export function provisionFromClerk(clerkId, { requestId } = {}) {
  const refusedUntil = recentRefusals.get(clerkId);
  if (refusedUntil > Date.now()) {
    return Promise.resolve(null);
  }
  recentRefusals.delete(clerkId);
  if (!inFlight.has(clerkId)) {
    const attempt = (async () => {
      const clerkUser = await userService.getClerkUserById(clerkId);
      const { user } = await provisionIdentity(identityFromClerkUser(clerkUser), {
        source: "request",
        requestId,
      });
      if (!user) recentRefusals.set(clerkId, Date.now() + REFUSAL_TTL_MS);
      return user;
    })().finally(() => inFlight.delete(clerkId));
    inFlight.set(clerkId, attempt);
  }
  return inFlight.get(clerkId);
}

/** What the admin API shows of an invite. */
function publicInvite(invite) {
  return {
    id: String(invite._id),
    email: invite.email,
    type: invite.type,
    permissions: invite.permissions,
    invitedBy: invite.invitedBy,
    invitedAt: invite.invitedAt,
    updatedBy: invite.updatedBy ?? null,
    updatedAt: invite.updatedAt ?? null,
  };
}

/** Pending invites, newest first. */
export async function listInvites() {
  const invites = await UserInvite.find().sort({ invitedAt: -1 }).lean();
  return invites.map(publicInvite);
}

/**
 * Create or update the invite for an email (admin-only route). If that email already has
 * a Clerk account — they signed in before, but have no agendo user — they're provisioned
 * right away with this access instead of waiting for their next request.
 *
 * Returns `{ ok: false, status, error, ... }` (see planInvite) or
 * `{ ok: true, status, body }` where body is
 *   { status: "pending", invite }  or  { status: "provisioned", user }.
 */
export async function saveInvite({ actor, body, requestId }) {
  const tag = `[${requestId}]: saveInvite`;
  const email = normalizeEmail(body?.email);
  const [existingUser, existingInvite] = email
    ? await Promise.all([userService.findUserByEmail(email), UserInvite.findOne({ email })])
    : [null, null];
  const plan = planInvite({ body, existingUser, existingInvite });
  if (!plan.ok) return plan;

  let invite = existingInvite;
  try {
    if (!invite) {
      invite = await UserInvite.create({
        email: plan.email,
        type: plan.type,
        permissions: plan.permissions,
        invitedBy: actor.clerkId,
        invitedAt: new Date(),
      });
    } else if (plan.changed) {
      invite.type = plan.type;
      invite.permissions = plan.permissions;
      invite.markModified("permissions");
      invite.updatedBy = actor.clerkId;
      invite.updatedAt = new Date();
      await invite.save();
    }
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, status: 409, error: `An invite for ${plan.email} was just saved — reload and edit it` };
    }
    throw err;
  }
  recentRefusals.clear();
  console.log(
    `${tag} - ${actor.clerkId} ${existingInvite ? (plan.changed ? "updated" : "re-saved") : "created"} the invite for ${plan.email}: type ${plan.type}, ${JSON.stringify(plan.permissions)}`,
  );

  try {
    const [clerkUser] = await userService.findClerkUsersByEmail(plan.email);
    if (clerkUser) {
      const { user } = await provisionIdentity(identityFromClerkUser(clerkUser), {
        source: "invite",
        requestId,
      });
      if (user) {
        return {
          ok: true,
          status: 200,
          body: {
            status: "provisioned",
            user: {
              id: user.clerkId,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              type: user.type,
            },
          },
        };
      }
    }
  } catch (err) {
    // The invite is saved; it applies when they next sign in.
    console.error(`${tag} - could not check Clerk for ${plan.email}: ${err.message}`);
  }

  return {
    ok: true,
    status: existingInvite ? 200 : 201,
    body: { status: "pending", invite: publicInvite(invite) },
  };
}

/** Withdraw a pending invite. Resolves to false if there was none with that id. */
export async function revokeInvite(inviteId) {
  if (!mongoose.isValidObjectId(inviteId)) return false;
  const { deletedCount } = await UserInvite.deleteOne({ _id: inviteId });
  return deletedCount > 0;
}

export default {
  provisionIdentity,
  provisionFromClerk,
  listInvites,
  saveInvite,
  revokeInvite,
};
