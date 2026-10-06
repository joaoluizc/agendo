# Performance (Agent Performance Score)

The quarterly agent-performance review, inside agendo. Each quarter the team used to
assemble a Google Sheet by hand:
- exported tickets, chats and screen-shares with their CSAT;
- shift hours copied from agendo's hours report;
- a "Total Support Interactions" tab of per-hour productivity and changes against the
  previous quarter.

The CRO then proposed a scoring model on top, the APS. Performance (`/app/performance`,
open to a named allowlist set in the backend's `PERFORMANCE_ACCESS_EMAILS` env var, not to all
admins) replaces the sheet's assembly and computes the score.

## How it fits together

- **Shift hours are agendo's.** They are the hours report's Tickets/Chats report groups,
  read through the same code (`reportsService.computeGroupMinutes`). So the hours report
  and Performance always agree, and Performance inherits the rule that shifts of users
  missing from `users` (dev data, departed accounts) don't count.
- **Everything else is pasted per quarter, for now.** Per-agent counts and CSAT go in,
  names are matched to agendo users, and confirmed spellings are kept as aliases. A
  later Zendesk or Ada connector would write the same "facts".
- **The rules are data.** A methodology is an immutable, versioned config. Scores are
  computed on every read from facts + hours + the quarter's agent setup + a version, and
  never stored. Changing the rules means adding a version, and each quarter records which
  version officially scores it. Re-scoring a past quarter under new rules is a decision
  (`PATCH` the period), not a migration, and any quarter can be previewed under any version.
- **Locking freezes a quarter's hours.** They're snapshotted with the report-group lists.
  Locked quarters accept no imports or setup changes.

## v1 decisions to remember

- APAC is its own cohort with its own benchmark. Its volume per hour is much lower, so
  comparing it with US/BR/IL skews both. Productivity there is chats only, as the CRO had it.
- Benchmarks are each quarter's cohort mean of regular agents' rates, not the CRO's fixed
  Q1 numbers (2.61 chats/h, 0.87 tickets/h). σ is shown for context. On Q1, chat rates
  were tight (σ ≈ 19% of the mean) and ticket rates loose (≈ 62%, with one agent at +2.4σ),
  which is why z-scores aren't used for scoring yet.
- Team leads (volume 30% + quality 70%) and billing roles are scored on their own models
  and listed apart from the leaderboard. Roles are assigned per quarter in the UI, never
  in code.

## People without an agendo account

Someone scored but never signed in (no `users` doc) is added in the Data tab as a
Performance-only agent: name, email and region. Don't pre-create them in `users`. First
sign-in doesn't attach a clerk id to an existing user with the same email, so the person
couldn't use agendo. Performance instead links the agent to whoever later signs in with
that email, at read time, and their data follows them.

## Gotchas

- **Quarter bounds are UTC-3 instants** (Q3 = 2026-07-01T03:00Z → 2026-10-01T03:00Z).
  The Reports page's quarter presets are built in the browser's timezone instead, so the
  two only match from a Brazil-time browser.
- **Hours are floored per channel before dividing**, as the sheet did. 50 chat minutes
  means no chat rate at all.
- **Overnight team in Q4 2026:** their shifts may exist only in Sling. Import their hours
  for that quarter (the `hours` source overrides shifts per agent) before trusting their
  rates.
- **Redis is shared with local runs.** Performance's cache keys carry a `dev:` segment
  under `NODE_ENV=development`. The hours report's key does not: a local hours report run
  can write to the same key production reads.

Details, routes and "remove it" steps: `calendar-api-backend/src/performance/README.md`.
