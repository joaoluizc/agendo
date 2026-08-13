# Brief: reconcile Clerk vs Mongo as sources of truth for user data

## Why this exists

agendo's user data has two competing sources of truth — Clerk and MongoDB — and which one a
given code path trusts is currently arbitrary. This is self-inflicted tech debt with a known
history:

1. **Originally**, agendo had its own email+password auth. User data lived in Mongo.
2. **Then** it migrated to Clerk. During the migration, functions rebuilt against Clerk auth
   were given a `_cl` suffix (`findUser_cl`, `getAllUsers_cl`, `deleteEvents_cl`, …). The
   suffix was a migration marker, not a designed API boundary, and it was never removed.
3. **At one point Clerk `publicMetadata` held the full user profile** — not just `type`
   (admin/normal) but also `positionsToSync`. That JSON eventually **exceeded Clerk's metadata
   size limit** (a few KB), so the data was moved back into Mongo.
4. **The move was never completed.** Some paths still read `publicMetadata`; others read Mongo.
   Nothing documents which is authoritative.

The goal of this work is to **define and enforce a single boundary**: what Clerk owns, what
Mongo owns, and no overlap.

## Downstream motivation

This cleanup is a prerequisite for adding an **MCP server** to agendo (remote HTTP, authorized
via Clerk OAuth using `@clerk/mcp-tools`). An MCP tool layer must resolve "is this caller an
admin?" from exactly one authoritative place. Shipping MCP on top of two disagreeing sources
would turn an inconsistency into a security hole. Keep that use case in mind: the end state
should make `resolveUser(clerkUserId) -> { mongoUser, isAdmin }` trivial and singular.

## Recommended target boundary (validate, don't assume)

- **Clerk owns identity and Google credentials only:**
  - session verification / `getAuth(req).userId`
  - `clerkClient.users.getUserOauthAccessToken(userId, "oauth_google")` — genuinely
    Clerk-only, no Mongo equivalent
  - possibly `imageUrl` / display name for UI
- **Mongo owns everything else:** `type`, `slingId`, `positionsToSync`, `timezone`, `skills`,
  work hours, limits, `defaultEventColorId`.
- **`publicMetadata` stops being read anywhere** for authorization or business data.

## Known symptoms (verify each; there are likely more)

### 1. Two admin checks, disagreeing
- `src/middlewares/adminOnly.js:11` → **Mongo** `user.type === "admin"`.
  Also **bypasses entirely when `NODE_ENV === "development"`** (line ~12) — a footgun.
- `src/utils/userIsAdmin.js:5` → **Clerk** `user.publicMetadata.type === "admin"`,
  with no optional chaining.
- `userIsAdmin` has exactly one caller: `src/controllers/shiftController.js:439`
  (`duplicateShiftsFromDay`).

**Hypothesis to test first:** if `publicMetadata.type` is no longer written, `userIsAdmin`
returns `false` for genuine admins, meaning **`duplicateShiftsFromDay` is broken in
production** and denies admins. Confirm against real Clerk data before changing anything —
this determines whether this is a cleanup or a bug fix.

### 2. `/user/info` and `/user/all` disagree about the same person
- `GET /user/info` → `userController.userInfo_cl:30` → `findUserByClerkId` → **Mongo**,
  returns `type` from Mongo.
- `GET /user/all` → `userService.getAllUsersSafeInfo_cl:85` → `clerkClient.users.getUserList`
  → **Clerk**, returns `publicMetadata.type || ""`, and **synthesizes a fake
  `publicMetadata` envelope** (lines 95–99) so Mongo-era consumers still see a Clerk shape.
  Also silently capped at `limit: 100`.

The frontend gates admin UI on `type` in ~8 places (`Header.tsx:146,239`,
`ScheduleCalendar.tsx:37`, `Settings.tsx:104,116`, `JiraBacklog.tsx:76`, `Tasks.tsx:170`).
Determine which endpoint feeds each, and whether any admin UI is driven by the Clerk value.

Note the existing comment at `userController.js:28`: the endpoint is described as redundant
"since all of this info is already on the frontend via clerk" — that assumption is now false
and the comment should be corrected or the endpoint properly owned.

### 3. `_cl` is ambiguous about *both* id-space and object shape
Functions with `_cl` variously mean "takes a Clerk user id", "returns a Clerk user object",
or "takes a Clerk-*shaped* object" — and callers mix them:
- `userService.getUserGoogleOAuthToken_cl(userId)` expects a **Clerk** id.
- `gCalendarService.js:28` calls it with `user.clerkId` off a **Mongo** doc.
- `gCalendarService.deleteEvents_cl(user, …)` / `addEvent_cl(user, …)` read `user.id` —
  which is a Clerk id for a Clerk user but the Mongo `_id` for a Mongo doc.
- `getAllUsersWithTokens` (**Mongo**) and `getAllUsersWithTokens_cl` (**Clerk**, Redis-cached)
  are parallel implementations of the same idea.

There are at least three id spaces in play — Clerk `user.id`, Mongo `_id`, and `slingId` —
plus (per project notes) two separate position id-spaces. Misreading one as another is the
recurring failure mode in this codebase. Produce an explicit map.

### 4. `slingId` read from Clerk in the bulk sync path
`gCalendarService.js:147` and `:1049` read `user.publicMetadata.slingId`, while
`userService.getSlingIdByClerkId` reads Mongo. Note the warning comment already at
`gCalendarService.js:1004` telling readers **not** to read `clerkUser.publicMetadata` for
`positionsToSync` — evidence this class of bug has already been fought once.

### 5. Leftover migration machinery
- `userService.addNewClerkUsersToMongo` (~line 274) and `addClerkIdToAllUsers` seed Mongo from
  Clerk `publicMetadata` with fallbacks. Both are exposed as **unauthenticated-by-role**
  POST routes in `src/routers/userRouter.js:16-18` (only `requireAuth()`, no `adminOnly`).
- Large commented-out blocks in `positionController.js:78-135` and `userService.js:200-217`
  are dead publicMetadata-era code.
- `calendar-api-frontend/src/types/userTypes.ts:46-47` models `publicMetadata` /
  `unsafeMetadata`, leaking the Clerk shape into frontend types.

## Explicitly out of scope

**Do not** fix agendo's missing per-user authorization checks in this pass. Separately known:
`shiftController.updateShift` (:219), `deleteShift` (:293) and `createShift` (:27) have no
ownership or role checks at all — any authenticated user can mutate or delete any shift, and
`createShift` accepts arbitrary `userIds` and writes into other employees' Google Calendars.
That is a distinct, larger project. **Document what you find, do not fix it here.** Keeping
these separate keeps this diff reviewable.

## Guardrails

- **Do not regress Google Calendar bulk sync.** There is a history of a bug where shifts were
  wiped from Google Calendar during bulk sync; `gCalendarService.addDaysShiftsToGcal_cl` and
  the `getAllUsersWithTokens*` pair are directly implicated in this refactor. Treat any change
  to the bulk path as high risk and reason explicitly about deletion behaviour.
- **Collections are environment-split**: `NODE_ENV === "development"` uses `dev-users`,
  not `users` (see `src/models/userModel.js`). Verify against `dev-*` collections.
- Backend is Express + ESM + Mongoose, deployed to `agendo-backend.onrender.com`; frontend is
  Vite/React on Vercel, which rewrites `/api/*` to the backend (`vercel.json`).
- Frontend tooling **must** run with cwd = `calendar-api-frontend`, or Tailwind silently
  compiles nothing and pages render unstyled.
- There are no automated tests. Verification is manual: introspect the Express router stack,
  and/or use a throwaway Node script against the `dev-*` MongoDB collections.

## Deliverables, in order

1. **An audit** — a table of every read/write of user data, with `file:line`, stating: which
   store it hits, which id-space it uses, and whether it's authoritative or should change.
2. **A decision record** — the Clerk/Mongo boundary, written down (add to `docs/knowledge/`,
   following the convention of the existing files there).
3. **A migration/verification note** — is `publicMetadata` still populated for existing Clerk
   users? Does any live behaviour currently depend on it? Is a backfill needed before removing
   reads, or is Mongo already complete?
4. **The refactor itself**, in reviewable commits: reconcile the two admin checks first (that
   is the security-relevant one), then `/user/all`, then the `_cl` naming, then dead code.
5. **A list of bugs found but not fixed**, including the authorization gaps above.

Present the audit and the proposed boundary **before** making code changes.
