import { defaultPermissions, validatePermissionsPatch } from "./evaluate.js";

/**
 * The rules for getting someone into agendo: when a Clerk account becomes an agendo user,
 * with what access, and what an admin's invite may hold. Pure — `services/onboardingService.js`
 * loads the facts, this decides, the service writes. See docs/knowledge/onboarding.md.
 *
 * An agendo user is created from a Clerk identity by one of three sources:
 *  - "webhook": Clerk's `user.created` event. It *is* the account being created, so it
 *    always provisions.
 *  - "request": the caller's first signed-in request found no agendo user. This is the
 *    backstop for a webhook that never arrived, so it only provisions an account Clerk
 *    created within NEW_ACCOUNT_WINDOW_MS. An older account with no agendo user was either
 *    removed on purpose (deleting the Mongo user is the documented kill switch) or missed
 *    long ago; either way it comes back only through an admin's invite.
 *  - "invite": an admin invited an email that already has a Clerk account.
 *
 * A pending invite for the identity's email (verified emails only) decides the access;
 * otherwise the registry's new-user defaults do.
 */

/** How long after Clerk creates an account a first request may still provision it. */
export const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const SOURCES = Object.freeze(["webhook", "request", "invite"]);
const TYPES = ["admin", "normal"];
const INVITE_KEYS = ["email", "type", "permissions"];

// Deliberately loose: Clerk is the authority on what an address is. This only catches
// typos like a missing "@" or a pasted name.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * The identity a Clerk account presents, in one shape whatever it came from:
 * `{ clerkId, email, emailVerified, firstName, lastName, createdAt }`.
 * `email` is the primary address (the first one if Clerk names no primary), normalized.
 */
function identity({ clerkId, emails, primaryId, firstName, lastName, createdAt }) {
  const primary = emails.find((entry) => entry.id && entry.id === primaryId) ?? emails[0];
  return {
    clerkId: clerkId || null,
    email: normalizeEmail(primary?.address),
    emailVerified: primary?.status === "verified",
    firstName: (firstName || "").trim(),
    lastName: (lastName || "").trim(),
    createdAt: typeof createdAt === "number" ? createdAt : null,
  };
}

/** From the `data` of a svix-verified `user.created` webhook (snake_case). */
export function identityFromWebhook(data) {
  return identity({
    clerkId: data?.id,
    emails: (data?.email_addresses ?? []).map((entry) => ({
      id: entry.id,
      address: entry.email_address,
      status: entry.verification?.status,
    })),
    primaryId: data?.primary_email_address_id,
    firstName: data?.first_name,
    lastName: data?.last_name,
    createdAt: data?.created_at,
  });
}

/** From a `@clerk/backend` User object (camelCase). */
export function identityFromClerkUser(user) {
  return identity({
    clerkId: user?.id,
    emails: (user?.emailAddresses ?? []).map((entry) => ({
      id: entry.id,
      address: entry.emailAddress,
      status: entry.verification?.status,
    })),
    primaryId: user?.primaryEmailAddressId,
    firstName: user?.firstName,
    lastName: user?.lastName,
    createdAt: user?.createdAt,
  });
}

/**
 * What to do with a Clerk identity that has no agendo user yet (the caller has already
 * looked it up by Clerk id and found nothing).
 *
 * @param identity        from identityFromWebhook / identityFromClerkUser
 * @param source          one of SOURCES
 * @param existingByEmail the agendo user holding this email, if any
 * @param previousAccountGone  true when existingByEmail points at a Clerk account that no
 *                        longer exists (the person deleted it and signed up again)
 * @param invite          the pending invite for this email, if any
 * @returns one of
 *   { action: "create", type, permissions, grantedBy, invite }   grantedBy: an admin's
 *        Clerk id (from the invite) or "provisioning"; invite: the one to consume, or null
 *   { action: "link", user }       give an existing agendo user this Clerk id
 *   { action: "refuse", reason }   no_email | unverified_email | email_taken | not_new
 */
export function planProvisioning({
  identity: who,
  source,
  existingByEmail = null,
  previousAccountGone = false,
  invite = null,
  now = Date.now(),
}) {
  if (!SOURCES.includes(source)) {
    throw new Error(`unknown provisioning source "${source}"`);
  }
  if (!who?.email) {
    return { action: "refuse", reason: "no_email" };
  }

  if (existingByEmail) {
    // Handing someone's agendo user — possibly an admin's — to another Clerk account is
    // only safe when Clerk has proven the mailbox. Google sign-ins always are.
    if (!who.emailVerified) {
      return { action: "refuse", reason: "unverified_email" };
    }
    if (!existingByEmail.clerkId || previousAccountGone) {
      return { action: "link", user: existingByEmail };
    }
    return { action: "refuse", reason: "email_taken" };
  }

  // An invite is an admin's decision about this mailbox, so it needs a verified one.
  const usableInvite = invite && who.emailVerified ? invite : null;
  const isNewAccount =
    who.createdAt !== null && now - who.createdAt <= NEW_ACCOUNT_WINDOW_MS;

  if (!usableInvite && source === "request" && !isNewAccount) {
    return { action: "refuse", reason: "not_new" };
  }
  if (!usableInvite && source === "invite") {
    // The invite route only provisions on behalf of an invite.
    return { action: "refuse", reason: invite ? "unverified_email" : "not_new" };
  }

  if (usableInvite) {
    return {
      action: "create",
      type: usableInvite.type === "admin" ? "admin" : "normal",
      permissions: { ...defaultPermissions(), ...(usableInvite.permissions ?? {}) },
      grantedBy: usableInvite.updatedBy || usableInvite.invitedBy,
      invite: usableInvite,
    };
  }
  return {
    action: "create",
    type: "normal",
    permissions: defaultPermissions(),
    grantedBy: "provisioning",
    invite: null,
  };
}

/**
 * The rules for an admin saving an invite (`POST /user/invites`). Admin-only route.
 *
 * Body: `{ email, type?: "admin" | "normal", permissions?: { [area]: level } }`.
 *  - `email` is required and normalized; it is what the invite is matched on.
 *  - An email that already belongs to an agendo user can't be invited: change their
 *    access on their row instead (409, with their Clerk id so the UI can open it).
 *  - `permissions` may be partial: merged over the invite being edited, or over the
 *    new-user defaults for a new one. `type` likewise keeps the edited invite's value.
 *
 * Returns `{ ok: true, email, type, permissions, changed }` or
 * `{ ok: false, status, error, details?, clerkId? }`.
 */
export function planInvite({ body, existingUser = null, existingInvite = null }) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Body must be { email, type?, permissions? }" };
  }
  const unknown = Object.keys(body).filter((key) => !INVITE_KEYS.includes(key));
  if (unknown.length) {
    return { ok: false, status: 400, error: `Unknown field(s): ${unknown.join(", ")}` };
  }
  const email = normalizeEmail(body.email);
  if (!EMAIL_SHAPE.test(email)) {
    return { ok: false, status: 400, error: "A valid email is required" };
  }
  if (existingUser) {
    return {
      ok: false,
      status: 409,
      error: `${email} already has an agendo account — change their access on their row`,
      clerkId: existingUser.clerkId ?? null,
    };
  }
  if (body.type !== undefined && !TYPES.includes(body.type)) {
    return { ok: false, status: 400, error: `type must be one of ${TYPES.join(", ")}` };
  }
  if (body.permissions !== undefined) {
    const { ok, errors } = validatePermissionsPatch(body.permissions);
    if (!ok) {
      return { ok: false, status: 400, error: "Invalid permissions", details: errors };
    }
  }

  const base = existingInvite?.permissions ?? defaultPermissions();
  const permissions = { ...defaultPermissions(), ...base, ...(body.permissions ?? {}) };
  const type = body.type ?? existingInvite?.type ?? "normal";
  const changed =
    !existingInvite ||
    type !== existingInvite.type ||
    JSON.stringify(permissions) !== JSON.stringify({ ...defaultPermissions(), ...base });
  return { ok: true, email, type, permissions, changed };
}

export default {
  NEW_ACCOUNT_WINDOW_MS,
  SOURCES,
  normalizeEmail,
  identityFromWebhook,
  identityFromClerkUser,
  planProvisioning,
  planInvite,
};
