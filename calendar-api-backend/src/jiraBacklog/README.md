# Jira backlog (self-contained module)

A triage board for SUP bug tickets — a data table with inline editing, three views, an
auto-calculated urgency score, and an optional live Jira lookup for the number of linked
Zendesk tickets. Everything for the backend half of the feature lives in this one folder
so it can be added or removed without touching the rest of agendo (same approach as
`src/discovai`). The frontend half lives in
`calendar-api-frontend/src/pages/JiraBacklog/`.

## How it fits agendo (deviations from the original spec)

The feature was specified in an opinionated prompt written for a standalone app. Where
that prompt conflicted with how agendo already works, agendo wins:

| Spec said | This module does |
| --- | --- |
| Google Sign-In, `@duda.co` gate, `ADMIN_EMAILS` env var | Nothing — auth is Clerk (mounted behind `requireAuth()`); admin vs. normal comes from agendo's existing `UserModel.type`, enforced by the shared `adminOnly` middleware |
| In-app user-management screen (promote/demote) | Dropped — agendo manages roles through Clerk |
| Store issues as JSON records in an "internal DB" | MongoDB via Mongoose, with the same dev/prod collection split agendo uses elsewhere |
| Parse the seed `jiras_seed.pdf` at runtime | Seed is exported + cleaned from the live "SUP Jiras Backlog" Google Sheet into `seed/jiraBacklogSeed.js`, so the backend ships no parser |

## Status (triage state)

A single `status` field replaces the original `closed` / `checkedSquad` / `reviewSquad`
booleans — one of `lib/status.js` `STATUS_OPTIONS`: `Backlog`, `Review with Squad`,
`Delayed`, `In a Sprint`, `Possible No-ETA`, `No-ETA`, `Fixed/Closed`, `Archived`. It's a
normal dropdown field (validated in `sanitizeWritable`, returned in `/config`
`dropdownOptions.status`); the frontend's three views derive from it (Open = not
`Fixed/Closed` and not `Archived`, To Review = the statuses picked in its toolbar filter).

**Archival / auto-delete.** Setting a bug to `Fixed/Closed` archives it: `reconcileArchival`
(in `jiraBacklogService.js`) rewrites the status to `Archived` and stamps `archivedAt` +
`archiveExpiresAt` (now + 30 days). Editing other fields never resets that countdown; moving
the bug out of `Archived` clears both stamps. `getAllIssues` lazily purges rows whose
`archiveExpiresAt` has passed (cascading their tasks) — no separate scheduler, so a row is
deleted the next time the backlog loads after its 30 days are up. Existing `Fixed/Closed`
rows are left untouched (not auto-migrated), so they never start the countdown.

`Possible No-ETA` / `No-ETA` drive the No-ETA review workflow (see "Tasks" below). New
statuses don't appear in databases seeded before they were added (seeding only fires on an
empty collection), so `scripts/add-bug-statuses.js` back-fills any missing `STATUS_OPTIONS`
into the `BugStatus` collection — idempotent, `--prod` / `--dev` / `--dry-run` flags
(PowerShell-friendly). Run once per env, e.g. `node src/jiraBacklog/scripts/add-bug-statuses.js --prod`.

`deriveStatus()` is the migration decision tree (first match wins): `closed →
Fixed/Closed`, else `reviewSquad → Review with Squad`, else `checkedSquad → In a Sprint`,
else `Backlog`. `Delayed` has no legacy signal, so it is only ever set by hand. The seed
export keeps the three booleans and the import maps them through `deriveStatus()`, and
existing rows that still carry the booleans are migrated by `scripts/migrate-status.js` —
idempotent, `$set status` + `$unset` the booleans, targeting `dev-jira-issues` /
`jira-issues` by `NODE_ENV`. For prod, run once:
`NODE_ENV=production node src/jiraBacklog/scripts/migrate-status.js`.

## Endpoints

All mounted under `/jira-backlog` behind `requireAuth()` (any signed-in agendo user can
read). Mutations and Jira fetches additionally require an admin via `adminOnly`.

| Method | Path | Purpose | Admin? |
| --- | --- | --- | --- |
| GET | `/jira-backlog/config` | `{ jiraConfigured, dropdownOptions }` | no |
| GET | `/jira-backlog/issues` | All issues (seeds on first call if empty) | no |
| POST | `/jira-backlog/issues` | Create a row | yes |
| PATCH | `/jira-backlog/issues/:id` | Update fields on a row | yes |
| DELETE | `/jira-backlog/issues/:id` | Delete a row | yes |
| POST | `/jira-backlog/issues/:id/refresh-zd` | Re-fetch one row's Zendesk count | yes |
| POST | `/jira-backlog/issues/:id/autofill` | Pull title/priority/squad/sprint/client/ZD count from Jira onto the row | yes |

> The toolbar **"Sync from Jira"** action refreshes each visible row through the per-row
> `autofill` endpoint above (bounded concurrency on the client — no long-running batch
> request to time out). `autofill` overwrites the Jira-sourced fields (blank Jira values never
> wipe existing data) and leaves the agendo-only triage `status` + urgency inputs untouched.

> `adminOnly` intentionally bypasses the role check when `NODE_ENV=development`, matching
> the rest of agendo — so locally every signed-in user can edit.

## Urgency score

Auto-calculated (0–100) from `scope`, `planTier`, `workaround`, `frustration`,
`scopeConf`, `workaroundQ`; `null` for Regressions or when any input is blank. The
formula and its **half-to-even rounding** reproduce all 89 seed scores exactly (the seed
stores the computed value, not the sheet's own "Urgency score" column — 14 `.5`-cases
differ by 1 because the sheet rounds half up) — see the header comment in `lib/urgency.js`. Admins can override the value by hand (the row then
carries `urgencyOverridden: true` and stops auto-recalculating until the value is
cleared). The frontend keeps an identical mirror in `pages/JiraBacklog/urgency.ts` for
instant feedback; the server is authoritative on save.

## Tasks & the No-ETA workflow

Tasks (`taskModel.js`, `taskService.js`) are first-class: a task may be **linked to a bug or
standalone** (`issueId` is optional), carries an optional **`deadline`**, and is fully
editable. `getAllTasks` keeps standalone tasks (only true orphans — a linked issue that was
deleted — are dropped). Task routes (all `adminOnly`): `POST /tasks` (standalone create),
`POST /issues/:id/tasks` (linked create), `PATCH /tasks/:taskId`, `DELETE /tasks/:taskId`,
plus the kanban `task-statuses` CRUD and `PUT /task-statuses/order` (bulk reorder).

**Default task status.** `TaskStatus` carries an explicit `isDefault` flag (seeded onto
"Not done"); new tasks land in `resolveDefaultStatusId()` — the flagged status, falling back
to lowest `order` for pre-flag databases. Marking a status default (`PATCH /task-statuses/:id`
with `{ isDefault: true }`) clears the flag on the others; deleting the default promotes the
new lowest-order status, so exactly one default always exists. This replaces the old implicit
"top status is default" rule, which silently broke when a column was deleted/renamed. Existing
databases work without a migration (the fallback covers them); to make the flag explicit there,
mark a default once from the Manage-statuses dialog.

**No-ETA review.** When a bug is set to `Possible No-ETA`, the UI offers to create a 30-day
re-evaluation reminder via `POST /issues/:id/no-eta-task` → `createNoEtaReviewTask`: a task
linked to the bug, `deadline = now + 30d`, and a `noEtaReview { flaggedAt, cycles }` marker.
Idempotent per bug (an existing unresolved review task is returned, not duplicated). The task
then advances via `POST /tasks/:taskId/no-eta` (`{ action }`):

- `reevaluate` → push the deadline another 30 days, `cycles++` (recursive, indefinitely).
- `resolve` → clear the marker and park the task in the **Done** column (a column named "Done",
  else the highest-`order` one). The UI separately sets the bug to `No-ETA`.

`NO_ETA_REVIEW_DAYS` (30) lives in `taskService.js`. The `noEtaReview` marker is managed only
by these endpoints — never writable through the generic `PATCH /tasks/:taskId`.

## Persistence

One Mongoose collection: `jira-issues` (or `dev-jira-issues` when
`NODE_ENV=development`). On the first `GET /issues` where the collection is empty, the 89
seed rows are imported once; subsequent runs never re-import. To refresh a database that
already holds rows (first-run seeding only fires on an empty collection), use the import
script below.

## Refreshing the backlog from the sheet

`seed/jiraBacklogSeed.js` is regenerated from the "SUP Jiras Backlog" Google Sheet (JIRAs
tab). To push that data into a database that isn't empty, run `scripts/import-sheet-data.js`:
it upserts every row by `issueKey` through the same `mapSeedRecord()` the seeding uses, so
existing rows are overwritten field-for-field (incl. `status`/`urgency`/`order`) and new
ones inserted. `_id`s are preserved (linked tasks stay attached); it is idempotent. The
target collection is chosen by flag, so the commands are identical in PowerShell, cmd, and
bash (no POSIX `NODE_ENV=… node …` prefix). Run from `calendar-api-backend/`:

```
node src/jiraBacklog/scripts/import-sheet-data.js            # dev (default)
node src/jiraBacklog/scripts/import-sheet-data.js --prod     # production (jira-issues)
node src/jiraBacklog/scripts/import-sheet-data.js --dry-run  # preview only, writes nothing
```

With no flag it targets dev (falling back to `NODE_ENV`, then development) — it never hits
prod by accident. There are no stale rows to remove (every key in the DB also exists in the
sheet); if you ever need a guaranteed-clean collection, add `--wipe` (note: wiping changes
`_id`s and orphans any linked tasks).

## Jira integration — # Connected tickets (optional)

Server-side only; the token never reaches the browser. Reads the linked Zendesk count
from a Jira custom field (`customfield_13671` by default). Configured via the fenced
`# === Jira backlog ===` block in `calendar-api-backend/.env`:

- Required to enable fetches: `JIRA_BASE_URL`, `JIRA_API_TOKEN`
- `JIRA_API_EMAIL`: required for **API tokens** (the `ATATT…` tokens). Atlassian API
  tokens authenticate with HTTP Basic (email = username, token = password), so when an
  email is set the client uses Basic; with no email it falls back to Bearer (OAuth
  tokens). Despite the spec, an `ATATT` token sent as Bearer fails with 403 "Failed to
  parse Connect Session Auth Token" — see `lib/jiraClient.js`.
- Optional: `JIRA_CLOUD_ID`, `JIRA_ZD_COUNT_FIELD`

Until those are set, `isJiraConfigured()` is false: the column simply shows `—`, the
refresh controls are hidden, and `refresh-zd` returns `409 JIRA_NOT_CONFIGURED`. A
missing/invalid var never crashes the server.

## Files

```
jiraBacklog/
├── jiraBacklogRouter.js       routes (+ adminOnly on mutations)
├── jiraBacklogController.js    req/res handlers
├── jiraBacklogService.js       DB ops, seeding, urgency-override rules, ZD orchestration
├── jiraBacklogModel.js         Mongoose schema (dev/prod collection split)
├── seed/jiraBacklogSeed.js     89 cleaned seed issues from the sheet (auto-generated, do not edit)
├── seed/mapSeedRecord.js       seed-record → JiraIssue doc mapping (shared by seeding + import)
├── taskModel.js / taskService.js / taskController.js  tasks + kanban statuses (+ No-ETA review)
├── scripts/migrate-status.js   one-time booleans→status migration (idempotent)
├── scripts/import-sheet-data.js  refresh an existing DB from the sheet (upsert by key)
├── scripts/add-bug-statuses.js  back-fill missing STATUS_OPTIONS into existing DBs (idempotent)
└── lib/
    ├── urgency.js              computeUrgency() — verified against the seed
    ├── status.js               STATUS_OPTIONS + deriveStatus() decision tree
    ├── dropdowns.js            canonical dropdown option values (incl. status)
    ├── config.js               env getters (never throws at import)
    └── jiraClient.js           server-side Zendesk-count fetch
```

## Remove it

1. Delete this folder (`calendar-api-backend/src/jiraBacklog/`).
2. In `app.js`, delete the `jiraBacklogRouter` import and its
   `app.use("/jira-backlog", …)` line.
3. In `.env`, delete the `# === Jira backlog ===` block.
4. (Optional) Drop the `jira-issues` / `dev-jira-issues` MongoDB collection.
5. Remove the frontend half — see `calendar-api-frontend/src/pages/JiraBacklog/README.md`.

No other part of agendo imports this module, and it adds no new npm dependencies.
