# Onboarding: how someone gets into agendo

_Clerk account → agendo user, the first-request backstop, and invites._

_Last updated: 2026-10-13_

Signing in with Google creates a **Clerk account**. That alone grants nothing: every route
and MCP tool needs an **agendo user** (a Mongo `User` document), because that is where
`type` and the permission levels live (see [permissions](permissions.md)). Onboarding is
the step that creates it.

## Three ways an agendo user is created

| Source | When | Rule |
|---|---|---|
| `webhook` | Clerk's `user.created` event, `POST /user/clerk/new` (svix-signed) | Always: it *is* the account being created |
| `request` | A signed-in request (REST or MCP) finds no agendo user | Only if Clerk created the account in the last **24 hours**, or an invite exists |
| `invite` | An admin invites an email that already has a Clerk account | Applied immediately |

The access comes from a **pending invite** for the email, if there is one and Clerk has
verified the address. Otherwise it is the registry's new-user defaults.

The decisions are pure functions in `src/permissions/onboarding.js` (tested in
`onboarding.test.js`). `src/services/onboardingService.js` loads the facts and writes the
result. The backstop runs from `services/authz.js` → `resolveOrProvisionUser`, which both
`getCaller` (REST) and `mcp/lib/mcpAuth.js` use.

### Why the backstop only covers new accounts

**Deleting someone's agendo user is the documented kill switch**
([MCP setup](../mcp-server-setup.md)). If any signed-in request could re-create a missing
user, a deleted user would come back with default access the next time they opened a tab.
So a request only provisions an account younger than a day. Accounts like that are
webhook misses, because the first request comes seconds after signup. Anyone older has to
be **invited** back, which is a deliberate admin decision.

The window means the kill switch only holds for accounts more than a day old. To cut off
someone on their first day, also delete them in Clerk, and revoke any invite.

## Invites

Settings → Users → **Invite**: an email, an admin switch and one level per area. **Nothing
is sent to the person.** The invite waits until their agendo user is created by any of the
three sources above. Then its access is applied and stamped with the inviting admin
(`permissionsUpdatedBy`). A `PermissionAudit` record is written (`via: "invite"`, actor =
the admin who last saved it), and the invite is deleted. So `user-invites` /
`dev-user-invites` only ever holds pending invites.

| Endpoint (admin) | Does |
|---|---|
| `GET /user/invites` | Pending invites, newest first |
| `POST /user/invites` `{ email, type?, permissions? }` | Create, or update the invite for that email. `permissions` may be partial (merged over the invite, or the defaults). Answers `{ status: "pending", invite }`, or `{ status: "provisioned", user }` when they already had a Clerk account |
| `DELETE /user/invites/:inviteId` | Revoke |

- An email that already has an agendo user is a **409** carrying their `clerkId`. The UI
  opens their row instead, where the Access card edits them.
- Emails are trimmed and lowercased. Matching against existing users ignores case.
- An invite needs a **verified** email to apply. Google sign-ins always are.

## Edge cases the service handles

- **Concurrent provisioning** (the webhook racing the first request, or a page firing
  several requests at once). Requests in the same process share one attempt. Across
  processes, the unique email index refuses the second insert, and the winner's document is
  used.
- **Recreated Clerk account.** When an agendo user with that email points at a Clerk
  account that no longer exists (or at none), it is **re-linked** to the new account and
  keeps its access. Never while the old account still exists (`email_taken`).
- **No family name.** `lastName` is optional (it used to be `required`, and Mongoose
  rejects `""`). A missing first name falls back to the email's local part.
- **Sling** is looked up for `slingId` with a 5 s cap. A miss or an outage only means no
  `slingId`, which can be fixed by hand.
- An account refused by the backstop is not re-checked against Clerk for 5 minutes.
  Saving any invite clears that, so an invite applies on their very next request.

## Logs

Every provisioning attempt logs one outcome, prefixed `onboarding(<source>)`:

| Line | Meaning |
|---|---|
| `created agendo user … with the new-user defaults` / `with the access <admin> invited them with` | Created |
| `… already has an agendo user` / `was provisioned concurrently` | No-op |
| `LINKED existing agendo user …` | Re-linked to a new Clerk account (a warning, on purpose) |
| `not provisioning … : not_new` | An old account with no invite (removed, or missed long ago) |
| `… : email_taken` / `unverified_email` / `no_email` | Refused; see `planProvisioning` |
| `newClerkUser - webhook verification failed` | Bad signature, or `CLERK_WEBHOOK_NEW_USER_CREATED_SECRET` missing/wrong in Render |

## The webhook

- Clerk Dashboard → Webhooks → endpoint `https://<backend>/user/clerk/new`, subscribed
  to `user.created`. Other event types are acked and ignored.
- Secret: `CLERK_WEBHOOK_NEW_USER_CREATED_SECRET` (Render). A missing secret is a 401 on
  every delivery, not a crash.
- The handler acks with 200 before provisioning, because svix allows only a few seconds.
  So the dashboard shows success even when provisioning fails. **The log line is the real
  outcome.**
- svix retries a failed delivery for about a day. If every delivery to an endpoint fails
  for 5 days, svix **disables the endpoint**. Check it is still enabled after any outage.
  The backstop covers new signups while it's off.

### History: why the backstop exists

Until 2026-08-05 (`3e6eeb4`) the handler handed an unawaited Promise to the user model.
The save failed, the async Express handler swallowed the rejection, and the request hung
until svix gave up. **Every signup** in that period got a Clerk account and no agendo user.
svix's retries had run out long before the fix. Those accounts stayed stranded, the webhook
being the only path in. Invite them to bring them in.
