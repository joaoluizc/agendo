# Clerk / Mongo boundary

_Which store owns which piece of user data, and why `publicMetadata` is not one of them._

_Last updated: 2026-08-06_

Agendo has two stores that both once held user profile data. This file is the decision
record for which one owns what. **If you are adding a read of user data, this is the
rule.**

## The rule

> **Clerk owns identity and Google credentials. Mongo owns everything else.
> `publicMetadata` and `unsafeMetadata` are never read for authorization or business
> data. `clerkId` is the only join key between the two stores.**

### Clerk owns — and only this

1. **Session identity** — `getAuth(req).userId`, `requireAuth()`.
2. **Google OAuth access tokens** — `clerkClient.users.getUserOauthAccessToken(clerkId,
   "oauth_google")`. Genuinely Clerk-only; there is no Mongo equivalent.
3. **Account lifecycle** — the svix-verified `user.created` webhook that provisions the
   Mongo user (`userController.newClerkUser`).
4. **Avatar / display name** — `imageUrl`, `hasImage`. **Display only, never
   authorization.** These have no Mongo equivalent, so `/user/all` joins them from Clerk.

### Mongo owns everything else

`type`, `slingId`, `positionsToSync`, `timezone`, `skills`, `workHours`,
`dailyMaxLimit`, `weeklyMaxLimit`, `defaultEventColorId`.

## How to resolve a caller

One function, `src/services/authz.js`:

```js
const { mongoUser, isAdmin } = await resolveUser(clerkUserId);
```

`adminOnly` uses it, `duplicateShiftsFromDay` uses it, and any future MCP tool layer must
use it too — that is the whole point of having exactly one. It returns `{ mongoUser:
null, isAdmin: false }` for a Clerk user with no Mongo document, so a missing user always
fails closed.

### Local development

`adminOnly` enforces the role check in **every** environment. To work on an admin route
without an admin account, set `ADMIN_BYPASS=1` — it skips the check and logs a warning on
every request. Otherwise give your Clerk user `type: "admin"` in `dev-users`.

It is deliberately a separate flag from `NODE_ENV`. `NODE_ENV` also selects the Mongo
collection (`dev-users` vs `users`), and while the bypass was keyed on it, pointing at
the wrong data silently disabled every admin gate in the application as a side effect.

## Why `publicMetadata` is banned

Clerk `publicMetadata` once held the full profile — `type`, `slingId`,
`positionsToSync`. That JSON outgrew Clerk's metadata size limit, so the data moved to
Mongo. **The writes were commented out; the reads were not.** Every remaining read was
returning whatever value Clerk happened to hold on the day the writes stopped.

Audited 2026-08-06: **10 live reads, 0 live writes.** Users created after the cutover
have `publicMetadata = {}` entirely.

The concrete damage this caused: `utils/userIsAdmin.js` read `publicMetadata.type` while
every other gate read Mongo `User.type`, so `POST /shift/duplicate-shifts` returned
`403 Unauthorized` to genuine admins — while the button that calls it was gated on Mongo
and therefore visible to them. A visible affordance that always failed.

There is a standing warning comment about this class of bug at
`gCalendarService.js:1003-1011`, added after `publicMetadata.positionsToSync` caused
unchecked positions to keep syncing. It had already been fought once.

## The id spaces

Misreading one id-space as another is the recurring failure mode in this codebase.

| # | Space | Shape | Lives in |
|---|---|---|---|
| 1 | Clerk user id | `user_2abc…` | `req.auth.userId`, `User.clerkId`, `Shift.userId`, `Shift.createdBy` |
| 2 | Mongo user `_id` | ObjectId / 24-hex | `UsersGCalEvents.userId` |
| 3 | Sling user id | numeric string | `User.slingId` |
| 4 | Sling position id | numeric string | `Position.positionId`, `User.positionsToSync[].positionId` |
| 5 | Mongo position `_id` | ObjectId | `Shift.positionId` |

Two silent footguns:

- **Mongoose's default `id` virtual.** `mongoDoc.id` returns the stringified `_id`. Any
  function expecting a Clerk id in `user.id` will *silently* get a Mongo id if handed a
  Mongo document — no error, just a failed lookup downstream.
- **Spreading a Clerk user.** `{...clerkUser}` keeps `id` and `publicMetadata` (own
  properties) but drops `primaryEmailAddress` and `fullName` (prototype getters). A
  spread Clerk user has no `.email` at all.

## Naming

The `_cl` suffix was a Clerk-migration marker, not a designed boundary. It meant four
different things — "takes a Clerk id", "returns a Clerk object", "takes a Clerk-shaped
object", and "is the newer of two twins" — and in two cases it was simply wrong.

**Convention: verb + explicit id-space; the store is implied by the return type.**
`findUserByClerkId` is the model. Do not reintroduce `_cl`.

## Guardrail: Google Calendar event tracking

`usersgcalevents` records what agendo wrote to each calendar so a re-sync can delete
before re-adding. **It contains two id-space generations:**

- ~30 documents / ~22,800 events keyed by **Clerk id** — written before commit
  `d2b4a24` (2026-06-01) changed the tracking key. Orphaned: both live delete paths
  (`gCalendarService.js:581` and `:819`) match on the Mongo id, so these can never be
  matched or cleaned up.
- ~24 documents / ~4,000 events keyed by **Mongo `_id`** — current.

They are not inert: `getAllPlatformEventIds` does `find({})`, so the orphaned events are
permanently subtracted from `/all-events-excluding-platform`.

> **Do not re-key or backfill `usersgcalevents.userId`.** Doing so converts ~22,800
> orphaned records into a live delete-set against people's real Google Calendars in a
> single bulk-sync run. If they are ever cleaned up, **delete the rows** — do not
> re-point them.

Related: `usersgcalevents`, `shifts` and `positions` are **not** environment-split, even
though `users`/`dev-users` is. A dev backend writes to and deletes from the production
tracking collection.

See [calendar sync paths](agendo-sync-paths.md) for the two sync worlds and the position
id-space gotcha.
