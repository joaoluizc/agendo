# Offboarding

When someone leaves the support team, one action removes them from agendo: **Settings →
Users → pick them → Offboard**. It deletes their agendo user and their Clerk login, and
tidies up what pointed at them.

Until this existed the only way to cut someone's access was to delete their document in
Mongo by hand, which meant it was easy to forget and nobody could see that it had been
done.

## Why the agendo user is the thing that matters

Deleting the Mongo `User` document **is** the kill switch. Every perimeter resolves its
caller through `services/authz.resolveUser`, which fails closed when there is no Mongo
user (see [clerk-mongo-boundary](clerk-mongo-boundary.md)):

| Perimeter | Without a Mongo user |
|---|---|
| REST (`middlewares/requirePermission.js`) | 403 `Forbidden`, `reason: "no_agendo_account"` |
| MCP (`mcp/lib/mcpAuth.js`, gate 2) | the connection is refused |

So a Clerk login that outlives its agendo user can authenticate and then do nothing at
all. That asymmetry is what sets the order below.

## The checklist

1. **Settings → Users → the person → Offboard.** Type their full name to confirm.
2. **Read what it reports.** The toast says how many upcoming shifts were cancelled —
   that is a coverage hole somebody now has to fill.
3. **If a red notice stays on the page**, some cleanup failed. Their access is already
   gone; finish the listed steps by hand. Almost always this means deleting the account in
   the Clerk dashboard.
4. **Revoke outside agendo too.** Sling, and their Google Workspace account. Deleting the
   Clerk user removes the Google OAuth grant Clerk held, not the Google account itself.

To clear the shifts off **their** Google Calendar as well, unpublish their future shifts
*before* offboarding — that path deletes the calendar events. See the note below on why
offboarding does not do it.

## What it actually does

`DELETE /user/:clerkId`, admin-only (`requireAdmin`). The steps, in order, in
`services/offboardService.js`:

| # | Step | On failure |
|---|---|---|
| 1 | Delete the agendo `User` | **aborts** — nothing was cut, so nothing else is attempted (500) |
| 2 | Delete shifts starting from now | reported, run continues |
| 3 | `$pull` them from `locations.assignedUsers` | reported, run continues |
| 4 | Delete the Clerk user | reported, run continues |

### Mongo first, Clerk second

Both halves can fail, and the two orders leave very different messes:

- **Mongo first** — if Clerk then fails, access is *already gone*. What is left is an inert
  login.
- **Clerk first** — if Mongo then fails, what is left is a fully privileged agendo user
  missing only a login, which anyone who can create a Clerk account on that email can
  restore.

One leaves something harmless, the other leaves something live. The Mongo delete also goes
before the cleanup steps, so no cleanup failure can be the reason access is still open.

Everything after step 1 is collected rather than thrown: once access is cut, the rest are
independent and stopping at the first failure would leave more loose ends, not fewer. The
response says what happened, and the UI shows it — nothing is swallowed.

### Responses

| Status | Meaning |
|---|---|
| 200 | every step worked |
| 207 | access was cut, some cleanup failed — `errors` says what |
| 403 | offboarding yourself |
| 409 | offboarding the last admin |
| 500 | the agendo user could not be deleted; nothing was changed |

### Guard rails

- **You can't offboard yourself.** Same rule as a self access change: it is either a
  mistake or a way to lock the org out, and there is no undo.
- **The last admin can't be offboarded.** Nobody would be left who could grant access,
  offboard anyone or edit locations.
- **A missing agendo user is not an error.** If a previous attempt deleted Mongo and then
  failed at Clerk, running it again skips step 1 and still deletes from Clerk. Note the
  UI cannot reach this: the roster is built from agendo users, so an offboarded person is
  no longer listed. It is there so the endpoint is idempotent and recoverable by hand.

The rules are pure and unit-tested in `src/permissions/offboard.js`.

## What happens to their data

| | |
|---|---|
| **Past shifts** | **Kept.** They are history — the hours report and performance scores are built from them, and deleting them would silently rewrite finished quarters. `database/scripts/purgeOrphanShifts.js` already treats an ex-employee's old shifts as real history. |
| **Shifts from now on** | **Deleted.** A shift on next week's grid for someone who has left is not history, it is a false plan: it draws a covered slot and the coverage meter counts it, so the gap their leaving created stays hidden until the day arrives. The count is reported so it can be filled. |
| **Location assignments** | **Removed.** See below. |
| **Their Google Calendar** | **Untouched.** See below. |
| **Permission audit records** | **Kept**, and one more is appended with `after.type === "offboarded"`. Once the user document is gone this is the only record of who removed them and when. |
| **Performance facts and scores** | **Kept.** Finished quarters, keyed by their clerk id. |

Offboarding is deliberately **not blocked** while someone has upcoming shifts. This is the
access kill switch; it must never be gated behind tidying a schedule.

### Why not clean their Google Calendar

The events live in *their* Google account, which leaves with them, and the OAuth token
needed to reach it is held by Clerk. Cleaning it would mean calling Google *before* the
kill switch, letting a slow third party delay cutting access. Unpublish their shifts first
if it matters.

### Stale location assignments

`locations.assignedUsers` is a bare array of clerk id strings — no ref, nothing enforcing
that the ids exist. Every hand-deleted user before this feature left their ids behind, and
`locations` only became env-split later, so local runs wrote `dev-users` ids into the
production documents (see `models/LocationModel.js`). Those ids are read when the hours
report groups by location.

Offboarding now pulls the id. For the backlog that predates it — 3 such assignments as of
2026-10-06 — there is a one-off script, dry-run by default:

```bash
node src/database/scripts/purgeOrphanLocationAssignments.js          # show what it would remove
node src/database/scripts/purgeOrphanLocationAssignments.js --apply
```

Unlike an orphan *shift*, an orphan assignment has no historical value: it is current
configuration, so every one is removed rather than kept on suspicion of being real.

## Onboarding, for contrast

Nothing to do: Clerk's "user created" webhook hits `POST /user/clerk/new`, which creates
the Mongo user with the default permissions and looks up their Sling id. They start with
`scheduling: view`, `reports: self` and nothing else — see
[permissions](permissions.md).
