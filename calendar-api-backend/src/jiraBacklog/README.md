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
| Parse the seed `jiras_seed.pdf` at runtime | Seed was extracted + cleaned once into `seed/jiraBacklogSeed.js`, so the backend ships no PDF parser |

## Status (triage state)

A single `status` field replaces the original `closed` / `checkedSquad` / `reviewSquad`
booleans — one of `lib/status.js` `STATUS_OPTIONS`: `Backlog`, `Review with Squad`,
`Delayed`, `In a Sprint`, `Fixed/Closed`. It's a normal dropdown field (validated in
`sanitizeWritable`, returned in `/config` `dropdownOptions.status`); the frontend's three
views derive from it (Open = not `Fixed/Closed`, To Review = `Review with Squad`).

`deriveStatus()` is the migration decision tree (first match wins): `closed →
Fixed/Closed`, else `reviewSquad → Review with Squad`, else `checkedSquad → In a Sprint`,
else `Backlog`. `Delayed` has no legacy signal, so it is only ever set by hand. The seed
import maps the seed export's booleans through `deriveStatus()` (the seed file is
unchanged), and existing rows are migrated by `scripts/migrate-status.js` — idempotent,
`$set status` + `$unset` the booleans, targeting `dev-jira-issues` / `jira-issues` by
`NODE_ENV`. For prod, run once: `NODE_ENV=production node src/jiraBacklog/scripts/migrate-status.js`.

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

> The toolbar "Refresh ZD counts" action refreshes each visible row through the per-row
> endpoint above with bounded concurrency on the client — there is no long-running batch
> request to time out.

> `adminOnly` intentionally bypasses the role check when `NODE_ENV=development`, matching
> the rest of agendo — so locally every signed-in user can edit.

## Urgency score

Auto-calculated (0–100) from `scope`, `planTier`, `workaround`, `frustration`,
`scopeConf`, `workaroundQ`; `null` for Regressions or when any input is blank. The
formula and its **half-to-even rounding** reproduce all 53 seed scores exactly — see the
header comment in `lib/urgency.js`. Admins can override the value by hand (the row then
carries `urgencyOverridden: true` and stops auto-recalculating until the value is
cleared). The frontend keeps an identical mirror in `pages/JiraBacklog/urgency.ts` for
instant feedback; the server is authoritative on save.

## Persistence

One Mongoose collection: `jira-issues` (or `dev-jira-issues` when
`NODE_ENV=development`). On the first `GET /issues` where the collection is empty, the 53
seed rows are imported once; subsequent runs never re-import.

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
├── seed/jiraBacklogSeed.js     53 cleaned seed issues (auto-generated, do not edit)
├── scripts/migrate-status.js   one-time booleans→status migration (idempotent)
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
