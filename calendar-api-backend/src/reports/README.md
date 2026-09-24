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
looking `CoverageMeterModel.js`. A shift's `Shift.positionId` is resolved to its
`Position.name` and matched against the lists. Names were chosen while the report also
merged in Sling-sourced shifts, which only ever carried a raw position name string from
Sling's own API, with no agendo Mongo id at all — name matching was the only key that
worked for both. The report reads agendo shifts only now (see below), but the stored
shape is unchanged, so an entry with no matching `Position` (a name that only ever
existed in Sling, say) simply matches nothing. "Other" is never stored — it's whatever
doesn't match either group's list, computed at report time.

Exactly two documents ever exist. `reportsService.seedGroupsIfEmpty()` creates them with
a sensible default split on first read if the collection is empty (mirrors
`jiraBacklog/taskService.js`'s `seedStatusesIfEmpty` pattern).

## Hours: agendo shifts only, clamped, truncated

`reportsService.getHoursReport()`:
- **Reads agendo's `shifts` collection only — never Sling.** As of the end of Q3 2026
  every shift is created in agendo, and the Sling history was copied into `shifts`, so
  agendo alone covers every period the report can show. The report used to merge in
  Sling's calendar on top of agendo's (matched to an agendo `User` by email); once the
  copy landed, that merge would have counted every copied shift twice. The rest of the
  Sling integration (`slingController`, the Sling schedule view) is untouched — only
  the report stopped reading it.
- Pulls shifts via the existing `shiftService.findShiftsByRange`, then
  **clamps** each shift to the report's `[start, end]` window before computing duration —
  `findShiftsByRange` returns shifts that merely *overlap* the window uncut, so summing
  raw `endTime - startTime` would overcount any shift straddling a boundary.
- **Drops shifts whose `userId` matches no `users` document** (logged, with a
  count). `Shift` is a single shared collection, but `User` is env-split into
  `dev-users`/`users` (`models/UserModel.js`), so a backend run with
  `NODE_ENV=development` against the same cluster writes real rows into the production
  `shifts` collection keyed by a clerk id only `dev-users` knows. Before this guard those
  rows surfaced in the production report as agents named `user_2ria…` — dev test data in
  a management report. A *current* agent always has a `users` doc, so no active roster
  member's hours are affected. Shifts orphaned by deleted accounts (departed agents, or a
  re-created Clerk identity) are dropped by the same rule; the ones in this database
  predate a rebuild of the `positions` collection, so their `positionId` no longer
  resolves and they classified as "Other" — already filtered out by the rule below — but
  a future orphan with a live `positionId` would be silently excluded. The log line is
  the signal; `src/database/scripts/purgeOrphanShifts.js` lists and cleans them up.
- Hours are truncated to whole numbers with `Math.floor`, never rounded, per product
  decision. The Total column floors the true summed minutes rather than summing the
  already-floored group cells, so it can occasionally read 1h higher than what its group
  cells visibly add up to — expected, not a bug.
- Location grouping (optional) resolves through `Location.assignedUsers` membership, not
  a field on `Shift` or `User` — there is no such field. A user in zero or multiple
  locations falls back to "Unassigned" / first match respectively, since the model
  enforces neither uniqueness nor completeness. Currently unused by the frontend: while
  the report merged in Sling, Sling shifts unmatched to an agendo user (no email match)
  never joined a Location, most rows fell back to "Unassigned", and the toggle was
  removed from the UI. That cause is gone now that every row is an agendo user, but the
  toggle hasn't been brought back — the backend support is untouched, ready to re-expose.
- An agent with no Tickets/Chats time at all (only Other, or nothing) is dropped from the
  result entirely — checked against the raw summed minutes, not the floored display
  hours, so real but sub-hour Tickets/Chats time isn't mistaken for none.

## Caching

`getHoursReport` is expensive (a Position/User scan plus the `shifts` range query) and gets
re-requested a lot as an admin navigates between periods, so its result is cached in
Redis via the shared `src/database/redisClient.js` singleton — the same client
`userService`/`positionService` use, not discovai's separate Upstash client.

Key: `` `reports:hours:agendo-only:${start}:${end}:${groupByLocation}` `` — exact-match
on the request, no bucketing needed since quarter/preset navigation always regenerates
the same boundary-aligned ISO strings for a given period. The `agendo-only` segment was
added when the report stopped reading Sling: entries under the old
`reports:hours:${start}:…` key hold Sling-merged totals, and a past range's entry would
otherwise have kept serving them for up to 24h after the switch. They are never read
again and expire on their own. TTL is tiered: 24h for a range that's
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
