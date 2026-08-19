# Reports (self-contained module)

Admin-only reporting on top of agendo's schedule data. First (and so far only) report:
total hours worked per agent over a date range, broken into three groups — Tickets,
Chats, Other — plus a per-group and grand total. Everything for the backend half lives
in this one folder so it can be added or removed without touching the rest of agendo
(same approach as `src/jiraBacklog` and `src/discovai`). The frontend half lives in
`calendar-api-frontend/src/pages/Reports/` (the report) and
`calendar-api-frontend/src/pages/Settings/ReportGroups/` (the group config).

## Report groups: name strings, not Position ids

`reportGroupModel.js` stores `positionNames: [String]` per group ("Tickets"/"Chats"),
matched case-insensitively/trimmed — not `Position._id` references like the very similar
looking `CoverageMeterModel.js`. That's deliberate: agendo-native shifts resolve a
`Shift.positionId` to a `Position.name`, but Sling-sourced shifts (see below) only ever
carry a raw position name string from Sling's own API, with no agendo Mongo id at all.
Name matching is the only classification key that works for both sources. "Other" is
never stored — it's whatever doesn't match either group's list, computed at report time.

Exactly two documents ever exist. `reportsService.seedGroupsIfEmpty()` creates them with
a sensible default split on first read if the collection is empty (mirrors
`jiraBacklog/taskService.js`'s `seedStatusesIfEmpty` pattern).

## Hours: native + Sling, clamped, truncated

`reportsService.getHoursReport()`:
- Pulls agendo-native shifts via the existing `shiftService.findShiftsByRange`, then
  **clamps** each shift to the report's `[start, end]` window before computing duration —
  `findShiftsByRange` returns shifts that merely *overlap* the window uncut, so summing
  raw `endTime - startTime` would overcount any shift straddling a boundary.
- Best-effort merges in Sling-sourced shifts via `slingController.getCalendar`, matching
  each Sling block to an agendo `User` by **email** (simpler and more reliably present on
  the Sling response than bridging through `User.slingId`). Wrapped in try/catch: a Sling
  outage — or Sling being gone entirely, once that integration is discontinued — still
  returns a native-only report instead of failing the whole request.
- Hours are truncated to whole numbers with `Math.floor`, never rounded, per product
  decision. The Total column floors the true summed minutes rather than summing the
  already-floored group cells, so it can occasionally read 1h higher than what its group
  cells visibly add up to — expected, not a bug.
- Location grouping (optional) resolves through `Location.assignedUsers` membership, not
  a field on `Shift` or `User` — there is no such field. A user in zero or multiple
  locations falls back to "Unassigned" / first match respectively, since the model
  enforces neither uniqueness nor completeness. Currently unused by the frontend: with
  Sling shifts unmatched to an agendo user (no email match), most rows fell back to
  "Unassigned" and the toggle was removed from the UI until that's less common — the
  backend support is untouched, ready to re-expose once Sling is retired.
- An agent with no Tickets/Chats time at all (only Other, or nothing) is dropped from the
  result entirely — checked against the raw summed minutes, not the floored display
  hours, so real but sub-hour Tickets/Chats time isn't mistaken for none.

## Caching

`getHoursReport` is expensive (a Position/User scan plus a live Sling call) and gets
re-requested a lot as an admin navigates between periods, so its result is cached in
Redis via the shared `src/database/redisClient.js` singleton — the same client
`userService`/`positionService` use, not discovai's separate Upstash client.

Key: `` `reports:hours:${start}:${end}:${groupByLocation}` `` — exact-match on the
request, no bucketing needed since quarter/preset navigation always regenerates the same
boundary-aligned ISO strings for a given period. TTL is tiered: 24h for a range that's
already fully in the past (those shifts won't change retroactively), 10 minutes for
anything touching the present (still accumulating shifts). No invalidation on shift
mutation — matches this codebase's existing Redis usages, which are all TTL-only. A
Redis error on either the read or the write is caught and logged; the report always
falls through to computing fresh rather than failing.

## Routes

Admin-gated throughout (reads included — this is a management/reporting tool, not
user-facing data), same convention as `coverageMeterRouter.js`:

- `GET /reports/groups`, `PUT /reports/groups` (whole-list replace)
- `GET /reports/hours?start=<ISO>&end=<ISO>&groupByLocation=<bool>`
