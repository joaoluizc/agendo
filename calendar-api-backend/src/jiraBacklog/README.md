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
| POST | `/jira-backlog/issues/:id/refresh-mrr` | Re-resolve one row's MRR (Jira -> Zendesk -> DOMO) | yes |
| GET/POST | `/jira-backlog/mrr-overrides` | List / add MRR resolution overrides | yes |
| DELETE | `/jira-backlog/mrr-overrides/:id` | Delete an MRR override | yes |
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

## MRR resolution (optional — Zendesk + DOMO)

For each bug, resolves the MRR of every client that reported it, summed across distinct
accounts: **Jira issue -> linked Zendesk ticket(s) -> each ticket's requester email -> DOMO's
owning account for that email -> that account's latest-complete-month MRR.** Fields on
`JiraIssue`: `zendeskTicketIds`, `mrr`, `mrrAccounts` (per-account breakdown: email, resolved
owner email, business name, MRR), `mrrFetchedAt`.

**Step 1 — Jira issue -> Zendesk ticket(s)** (`lib/zendeskClient.js`). Source of truth:
Zendesk's "Jira Links" API (`/api/v2/jira/links`) — the live table the Zendesk-Jira app
maintains. Two quirks, both verified against Duda's instance: `filter[ticket_id]` only
accepts *Zendesk ticket ids* (despite the docs claiming it also takes Jira issue ids, and
issue-key filtering isn't supported at all), so the reverse lookup fetches the whole table
(~18k rows, 18 paginated requests) and indexes it by `issue_key`, cached in-process for 10
minutes — the bulk sync pays that once for every bug. And pre-2016 rows carry
`issue_key: null`; they're skipped. Verified exact: SUP-6378 -> 2 (Jira count 2), SUP-5180
-> 4 (Jira count 4), SUP-7002 -> 1 (a link an earlier full-text-search approach missed
because the sync bot never commented the key on that ticket).

**Step 2 — ticket -> requester email**: `GET /api/v2/tickets/:id.json?include=users`
(sideloaded, one request per ticket).

**Step 3 — email -> owner account -> MRR** (`lib/domoClient.js`), per Duda's BI agent's spec:
resolve the input email to its account in the accounts dataset; if it has a
`parent_account_uuid`, the *parent* is the MRR owner (staff/child accounts must roll up —
`parent_account_email` is a display-only fallback, `parent_account_uuid` is the stable join
key). Then sum `revenue_net_amount` from the revenue dataset where `payment_type = 'recurring'`
and `frequency NOT IN ('onetime', 'sfl')`, for the latest complete month
(`charge_date >= max_netsuite_charge_date AND charge_date < max_netsuite_charge_date + 1
month`). Two sequential single-dataset queries (Domo's dataset-query endpoint can't join
across datasets), auth via OAuth2 client-credentials (`scope=data`), token cached in-process.

**Owner-resolution caveats** (both verified live, both handled in `domoClient.js`):
`account_uuid`/`account_id` are only unique *per instance* (the same uuid/id names unrelated
accounts on `duda` vs `eu`), so every parent lookup is pinned to the child's `instance`; and
on some instances (seen on `eu`) the child's `parent_account_uuid` doesn't match any account
row, so the lookup falls back to `parent_account_email` (also instance-pinned). Owner accounts
self-reference (`parent_account_uuid` == own `account_uuid`) — only a *different* parent uuid
triggers the roll-up.

**Diagnostics (`mrrTrace`).** Every refresh records one trace entry per Zendesk ticket (plus a
single `no_tickets_found` entry when the search found none): `{ ticketId, email, stage,
detail }`, stage one of `ok | via_override | duplicate_owner | no_tickets_found |
requester_lookup_failed | no_account_match | mrr_lookup_failed | zero_mrr`. A ticket failure
never aborts the row — it's recorded and skipped, so a 0 or missing MRR is diagnosable after
the fact. The UI shows an amber warning on the MRR cell when any ticket has a problem stage,
and the detail panel lists each failed ticket with its reason. `zero_mrr` is deliberately its
own stage: the account resolved fine but latest-month MRR is $0 (free account or data gap) —
different from "couldn't resolve".

**Overrides (`mrr-overrides` collection, managed in the UI).** Some enterprise clients file
Zendesk tickets from emails that aren't Duda accounts — e.g. 1&1/IONOS's
`hosting-jira@1und1.de` — so requester-email resolution finds nothing. An override maps a
matcher to the Duda account email whose MRR should be counted instead: `matchType "org"`
(a Zendesk organization id — preferred, one row covers every requester the client uses;
orgs are curated by Duda's support team) or `matchType "email"` (exact requester email).
Overrides **win** over requester-email resolution — a partner employee's personal Duda
account must never be counted in place of the real enterprise account. Endpoints:
`GET/POST /jira-backlog/mrr-overrides`, `DELETE /jira-backlog/mrr-overrides/:id` (admin);
UI: the toolbar's "MRR overrides" dialog. Seeded mapping: Zendesk org `16877541108` ("1&1",
domains 1und1.de/ionos.com/web.de/gmx.net) -> `duda-owner-ionos@ionos.com` (account_id 354 on
the `one` instance — verified to hold all of that instance's latest-month recurring revenue).

**Configured via env vars** (`ZD_SUBDOMAIN`, `ZD_API_EMAIL`, `ZD_API_TOKEN`, `DOMO_CLIENT_ID`,
`DOMO_CLIENT_SECRET`, `DOMO_ACCOUNTS_DATASET_ID`, `DOMO_REVENUE_DATASET_ID` — see the
`# === MRR resolution ===` block in `.env`). `isMrrConfigured()` requires Jira + Zendesk + DOMO
all configured; until then `refresh-mrr` returns `409 MRR_NOT_CONFIGURED` and the daily sync's
MRR pass is skipped entirely. The two dataset ids in Duda's instance: **"Accounts"**
(`2f47373f-0537-449c-b088-9fd11e7e678e`, mirrors `bi_par.view_account_segment_flat` — has
`account_uuid, account_id, instance, account_name, user_type, parent_account_uuid,
parent_account_email, billing_master_business_name, account_plan_type, 2020_segment`) and
**"Revenues"** (`8062fa5b-e2c1-4b2c-877f-0c0d71967b35`, mirrors `bi_dwh.fact_revenues` — has
`account_id, athena_env, charge_date, max_netsuite_charge_date, payment_type, frequency,
revenue_net_amount`). Validated end-to-end against the BI agent's reference case
(`sofia.mazzoli@register.it` -> owner `websitebuilder@register.it`, MRR 22535.63 for 2026-06).

## Daily automatic sync

`jiraBacklogService.syncAllFromJira()` runs the bulk "Sync from Jira" server-side: it
autofills every linked bug (key or URL) a few at a time, tallying ok/failed and skipping
gracefully when Jira isn't configured. It never throws for a single-row failure. A second,
independently-gated MRR-refresh pass rides along (logs with a `[jira-backlog][mrr-sync]`
prefix) — skipped entirely unless `isMrrConfigured()` (see "MRR resolution" above). Two ways to
run it daily at **00:00 UTC** — both call the same function and log with a `[jira-backlog][sync]`
prefix so runs are easy to confirm in Render's log stream:

1. **In-process cron** (`scheduler.js`, started once from `app.js` via
   `startJiraBacklogScheduler()`): a `node-cron` job (`0 0 * * *`, timezone UTC). Reliable on an
   **always-on** web service; on a tier that sleeps when idle the midnight tick can be missed
   (you'll see no `tick` log at 00:00). Logs on registration and on every run.
2. **Standalone script** for a **Render Cron Job** (robust even if the web service sleeps — it
   runs in its own process): set the job command to
   `node src/jiraBacklog/scripts/sync-all-jira.js --prod` and schedule `0 0 * * *` (Render cron
   is UTC). Exits non-zero if Jira is unconfigured so the platform flags it.

Pick whichever fits your setup (running both is harmless — the sync just overwrites the same
Jira-sourced fields twice). To confirm it works right now, run the script manually and watch the
log lines: `starting — N linked of M bug(s)` … `done — X synced, Y failed`.

## Files

```
jiraBacklog/
├── jiraBacklogRouter.js       routes (+ adminOnly on mutations)
├── jiraBacklogController.js    req/res handlers
├── jiraBacklogService.js       DB ops, seeding, urgency-override rules, ZD orchestration
├── jiraBacklogModel.js         Mongoose schema (dev/prod collection split)
├── mrrOverrideModel.js         MRR resolution overrides (Zendesk org/email -> Duda account)
├── seed/jiraBacklogSeed.js     89 cleaned seed issues from the sheet (auto-generated, do not edit)
├── seed/mapSeedRecord.js       seed-record → JiraIssue doc mapping (shared by seeding + import)
├── taskModel.js / taskService.js / taskController.js  tasks + kanban statuses (+ No-ETA review)
├── scheduler.js                daily 00:00 UTC "Sync from Jira" (node-cron, started from app.js)
├── scripts/migrate-status.js   one-time booleans→status migration (idempotent)
├── scripts/import-sheet-data.js  refresh an existing DB from the sheet (upsert by key)
├── scripts/add-bug-statuses.js  back-fill missing STATUS_OPTIONS into existing DBs (idempotent)
├── scripts/sync-all-jira.js    standalone bulk sync (for a Render Cron Job / manual runs)
└── lib/
    ├── urgency.js              computeUrgency() — verified against the seed
    ├── status.js               STATUS_OPTIONS + deriveStatus() decision tree
    ├── dropdowns.js            canonical dropdown option values (incl. status)
    ├── config.js               env getters (never throws at import)
    ├── jiraClient.js           server-side Zendesk-count fetch
    ├── zendeskClient.js        server-side MRR resolution step 1-2 (Jira key -> ticket(s) -> requester email)
    └── domoClient.js           server-side MRR resolution step 3 (email -> owner account -> MRR)
```

## Remove it

1. Delete this folder (`calendar-api-backend/src/jiraBacklog/`).
2. In `app.js`, delete the `jiraBacklogRouter` import + its `app.use("/jira-backlog", …)` line,
   and the `startJiraBacklogScheduler` import + its call.
3. In `.env`, delete the `# === Jira backlog ===` and `# === MRR resolution ===` blocks.
4. (Optional) Drop the `jira-issues` / `dev-jira-issues` MongoDB collection, and remove any
   Render Cron Job pointing at `scripts/sync-all-jira.js`.
5. Remove the frontend half — see `calendar-api-frontend/src/pages/JiraBacklog/README.md`.

No other part of agendo imports this module. It reuses `node-cron` (already a dependency) and
adds no new npm dependencies.
