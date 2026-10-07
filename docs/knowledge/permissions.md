# Permissions

Admins grant each user one **level per area**. Admins themselves have everything. This
replaced the admin/normal binary once agendo became the support team's hub. The design and
every decision behind it are in [`docs/permissions-plan.md`](../permissions-plan.md); this
page is how it works and how to extend it.

**Status:** enforced on the REST API (phase 2). Still to come: the admin access editor and
the frontend reading `permissions` (phase 4), and the MCP tools (phase 3). Until phase 3,
the MCP still splits tools by admin vs. normal.

## The model

| Area | Levels (low → high) | New users | What the top level adds |
|---|---|---|---|
| `scheduling` | `none` · `view` · `edit` | `view` | drafts, edits, publishing, coverage targets, reading manager notes |
| `bugs` | `none` · `view` · `edit` | `none` | editing bugs and tasks, running triage |
| `reports` | `none` · `self` · `edit` | `self` | everyone's reports, report groups |
| `performance` | `none` · `edit` | `none` | the whole Performance screen |

- **Levels are ordinal.** Each includes the ones below it. They are stored **by name**, so
  a level can be inserted later without changing what stored values mean.
- **Admin is `User.type === "admin"`, read in one place.** `levelOf()` in
  `src/permissions/evaluate.js` gives an admin the top level of every area, including areas
  added later. No other code checks `isAdmin` for area access.
- **Some actions no level grants (`requireAdmin`):**
  - user and permission management;
  - positions, locations and skills;
  - bug/task statuses and MRR overrides;
  - everyone's Google Calendar events;
  - the bulk calendar sync;
  - the raw Sling roster.
- **Self-level access is a row filter.** `reports: self` returns only the caller's own
  report row, built from the caller, never from a client-sent id.
- **Agents never see the performance score.** `performance` has no self level.
- **Shifts and hours stay visible to everyone.** Seeing everyone's shifts and hours stays
  open under `scheduling: view`, including the MCP totals. Reports access adds friction for
  the leads' monitoring tool; it doesn't keep secrets.
- **Fails closed.** No session, no agendo user, or a missing/unknown stored level means
  `none`. A typo in an area or level *in code* throws when the module loads.

## Where things live

| Piece | File |
|---|---|
| The registry: areas, levels, defaults, copy | `src/permissions/registry.js` |
| The evaluator: `levelOf`, `can`, `decide`, `scopeFor`, `effectivePermissions`… (pure) | `src/permissions/evaluate.js` |
| Response shaping: the roster per caller, own-row reports (pure) | `src/permissions/shaping.js` |
| Rules for changing someone's access (pure) | `src/permissions/accessChange.js` |
| The caller: one session-only, memoized Mongo lookup per request | `getCaller(req)` in `src/services/authz.js` |
| Route markers — the only authorization gate on REST | `src/middlewares/requirePermission.js` |
| Stored levels | `User.permissions` (+ `permissionsUpdatedAt/By`), generated from the registry |
| Audit trail (append-only) | `PermissionAudit` → `permission-audits` / `dev-permission-audits` |
| Mount table (routers + paths) | `src/routes.js` |
| Effective access for the UI | `GET /user/info` → `isAdmin`, `permissions` |
| Registry for the admin editor | `GET /user/permission-registry` |
| Change someone's access (admin) | `PUT /user/:clerkId/permissions` |

## Every route declares one requirement

Each route's **first** handler is exactly one marker:

```js
shiftRouter.post("/publish", requirePermission("scheduling", "edit"), shiftController.publishShifts);
```

The markers are `requirePermission(area, level)`, `requireAdmin`, `signedIn`, and three
declarations that check nothing: `publicRoute`, `webhookRoute` (svix-signed) and
`mcpRoute` (checked per tool).

**What a checking marker answers:**

| Situation | Response |
|---|---|
| No session | `401 {error:"Unauthorized"}` |
| A Clerk identity with no agendo user | `403 {reason:"no_agendo_account"}` |
| Not an admin, on an admin-only route | `403 {reason:"not_admin", required:"admin"}` |
| Level too low | `403 {reason:"below_required", required:"bugs:edit", have:"view"}` |
| The caller lookup failed | `500` |

There are no router-level gates left. `adminOnly`, `requireSession` and the Performance
allowlist are gone.

**The route test.** `src/permissions/routeRequirements.test.js` loads the real routers and
the real mount table, and fails if any route has no marker, more than one, or a marker that
isn't first. It also fails if the route → requirement map differs from its `EXPECTED`
contract, so changing who may call a route is a reviewed diff. It mocks the two modules that
do I/O at import (the Redis client, the Sling service), which is why `npm test` runs with
`--experimental-test-module-mocks`.

**Adding a route:** put a marker first, then add the route to `EXPECTED`.

**A handler that needs finer rules** reads the same caller with `await getCaller(req)` and
asks `can(...)` or `scopeFor(...)`. For example:
- drafts are returned only to `scheduling: edit` (`shiftController`);
- the hours report is narrowed to the caller's row for `reports: self` (`reportsController`).

## Logs

| Line | Meaning |
|---|---|
| `[perm] denied GET /shift/new: requires scheduling:edit — below_required (has view) — caller …` | Every refusal except a plain signed-out request |
| `[perm] refused a oauth_token for … : REST takes session tokens only` | A valid token of the wrong type, such as an MCP token sent to REST |
| `setUserPermissions - <admin> set <user>: type … -> …, permissions … -> …` | Every access change. Also written to `PermissionAudit` |

Phase 1 ran the markers in shadow mode, logging `[perm] shadow mismatch` wherever they
disagreed with the old gates.

## Changing someone's access

`PUT /user/:clerkId/permissions` (admin) takes `{ type?: "admin" | "normal", permissions?:
{ area: level } }`. `permissions` may be partial and is merged over what the user has.

| Rule | Response |
|---|---|
| Changing your own access | 403 |
| Demoting the last admin | 409 |
| An unknown field, area or level | 400 |

Every change is stamped (`permissionsUpdatedAt/By`) and appended to `PermissionAudit`.

The user sees a change on their next request. On the frontend that is the next page load
for now. MCP clients see new tools when their tool list refreshes (see the plan, §2).

## Adding an area

1. Add an entry to `PERMISSION_AREAS` in the registry: `label`, `levels` (starting with
   `"none"`), `describe`, `defaultForNewUsers`, and optionally `selfLevel`. The schema, the
   evaluator and the editor pick it up.
2. Put markers on its routes and add them to `EXPECTED`.
3. Existing non-admins get `none`; admins get it through the flag. **If the area is carved
   out of one people can already reach, ship a backfill in the same PR** so nobody loses
   access.

## Backfilling existing users

`src/database/scripts/backfillPermissions.js` gives every user with no `permissions` the
values in `src/permissions/backfill.js`:

| Area | Value |
|---|---|
| `scheduling` | `view` |
| `bugs` | `none` |
| `reports` | `self` |
| `performance` | `edit` for people on the old `PERFORMANCE_ACCESS_EMAILS` list |

Admins get the same stored values, which is what they fall back to if they're ever demoted.

The script dry-runs by default, is idempotent, never overwrites a set value, and writes a
`via: "migration"` audit record per user. **Run it before enforcement goes live:** an
un-backfilled user reads as `none` everywhere.

```bash
node src/database/scripts/backfillPermissions.js                                   # dry run, both collections
node src/database/scripts/backfillPermissions.js --collection=dev-users --apply
PERFORMANCE_ACCESS_EMAILS="<value from Render>" node src/database/scripts/backfillPermissions.js --collection=users --apply
```

## Gotchas

- **The old Performance allowlist lives in Render's env, not in a local `.env`.** The
  backfill refuses to apply to `users` with an empty list unless you pass
  `--allow-empty-allowlist`.
- **`User.permissions` has no path default, on purpose.** A hydrated all-`none` default
  would be persisted by any unrelated `save()`. That would hide the user from the backfill,
  which only touches documents with no `permissions`.
- **Identity is session-only.** Never use Clerk's `requireAuth()` or `req.auth.userId` for
  a decision; both accept any token type, including the MCP bridge's OAuth token. Use
  `getCaller(req)`. See [Clerk / Mongo boundary](clerk-mongo-boundary.md).
- **`ADMIN_BYPASS=1`** makes `getCaller` treat every REST caller as an admin locally. The
  MCP ignores it.
- **No real names or emails in code, tests or seeds.** The repo is public.
