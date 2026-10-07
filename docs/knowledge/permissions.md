# Permissions

Admins grant each user one **level per area**. Admins themselves have everything. This
replaced the admin/normal binary once agendo became the support team's hub. The design and
every decision behind it are in [`docs/permissions-plan.md`](../permissions-plan.md); this
page is how it works and how to extend it.

**Status:** phase 1 — the model, the data and a requirement marker on every route are in,
running in **shadow mode** (deciding and logging, not enforcing). Enforcement, the admin
editor, the frontend and the MCP follow in later phases.

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
- **Some actions no level grants.** They are `requireAdmin`: user and permission
  management, positions, locations and skills, bug/task statuses and MRR overrides, everyone's
  Google Calendar events, the bulk calendar sync, the raw Sling roster.
- **`self` is a row filter.** `reports: self` shows only the caller's own report row.
  Agents **never** see the performance score: `performance` has no self level. Seeing
  everyone's shifts and hours stays open (`scheduling: view`, including the MCP totals).
  Reports access adds friction for the leads' monitoring tool, it doesn't keep secrets.
- **Fails closed.** No session, no agendo user, or a missing/unknown stored level means
  `none`. A typo in an area or level *in code* throws when the module loads.

## Where things live

| Piece | File |
|---|---|
| The registry: areas, levels, defaults, copy | `src/permissions/registry.js` |
| The evaluator: `levelOf`, `can`, `decide`, `scopeFor`, `effectivePermissions`… (pure) | `src/permissions/evaluate.js` |
| The caller: one session-only, memoized Mongo lookup per request | `getCaller(req)` in `src/services/authz.js` |
| Route markers: `requirePermission(area, level)`, `requireAdmin`, `signedIn`, `publicRoute`, `webhookRoute`, `mcpRoute` | `src/middlewares/requirePermission.js` |
| Stored levels | `User.permissions` (+ `permissionsUpdatedAt/By`), generated from the registry |
| Audit trail (append-only) | `PermissionAudit` → `permission-audits` / `dev-permission-audits` |
| Mount table (routers + paths) | `src/routes.js` |
| Effective access for the UI | `GET /user/info` → `isAdmin`, `permissions` |
| Registry for the admin editor | `GET /user/permission-registry` |

## Every route declares one requirement

Each route's **first** handler is exactly one marker:

```js
shiftRouter.post("/publish", requirePermission("scheduling", "edit"), adminOnly, publishShifts);
```

`src/permissions/routeRequirements.test.js` loads the real routers and the real mount
table, and fails if any route has no marker, more than one, or a marker that isn't first.
It also fails if the route → requirement map differs from its `EXPECTED` contract, so
changing who may call a route is a reviewed diff. It mocks the two modules that do I/O at
import (the Redis client, the Sling service), which is why `npm test` runs with
`--experimental-test-module-mocks`.

**Adding a route:** put a marker first, then add the route to `EXPECTED`.

## Shadow mode (phase 1)

The markers decide but don't block. The legacy gates (`requireSession`, `adminOnly`, the
Performance allowlist) still sit behind them and still answer every request. After each
response, a marker compares its verdict with what the legacy gate did and logs **only
disagreements**:

```
[perm] shadow mismatch: GET /reports/hours requires reports:self — would ALLOW, legacy answered 403 — caller …
[perm] shadow mismatch: GET /shift/range requires scheduling:view — would DENY (no_agendo_account), legacy answered 200 — caller …
```

Before enforcing, every mismatch in Render's logs must be an intended change. The intended
ones: agents seeing their own report, admins gaining Performance, Clerk identities with no
agendo user losing read access, `/sling/users` becoming admin-only.

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
values in `src/permissions/backfill.js`: `scheduling: view`, `bugs: none`, `reports: self`,
and `performance: edit` for people on `PERFORMANCE_ACCESS_EMAILS`. Admins get the same
stored values, which is what they fall back to if they're ever demoted.

The script dry-runs by default, is idempotent, never overwrites a set value, and writes a
`via: "migration"` audit record per user. Run it right after the phase-1 deploy:

```bash
node src/database/scripts/backfillPermissions.js                                   # dry run, both collections
node src/database/scripts/backfillPermissions.js --collection=dev-users --apply
PERFORMANCE_ACCESS_EMAILS="<value from Render>" node src/database/scripts/backfillPermissions.js --collection=users --apply
```

## Gotchas

- **The Performance allowlist lives in Render's env, not in a local `.env`.** The backfill
  refuses to apply to `users` with an empty list unless you pass `--allow-empty-allowlist`.
- **`User.permissions` has no path default, on purpose.** A hydrated all-`none` default
  would be persisted by any unrelated `save()`. That would hide the user from the backfill,
  which only touches documents with no `permissions`.
- **Identity is session-only.** Never use Clerk's `requireAuth()` or `req.auth.userId`;
  both accept any token type, including the MCP bridge's OAuth token. Use `getCaller(req)`
  or `getAuth(req)`. See [Clerk / Mongo boundary](clerk-mongo-boundary.md).
- **`ADMIN_BYPASS=1`** makes `getCaller` treat you as admin locally, like `adminOnly`. The
  MCP ignores it.
- **No real names or emails in code, tests or seeds.** The repo is public.
