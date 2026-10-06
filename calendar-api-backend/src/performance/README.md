# Performance (self-contained module)

Admin-only agent performance per quarter: the **Agent Performance Score (APS)** the CRO
designed on Q1 2026 data, computed inside agendo from

- **imported facts**: per-agent tickets, chats, screen-shares (count, CSAT, surveys) and,
  for quarters agendo has no shifts for, hours. They're pasted from the quarterly exports
  (`importService`);
- **agendo's own shift hours**: the hours report's Tickets/Chats report groups, read
  through `reportsService.computeGroupMinutes` (so the same unmatched-user guard and
  classification apply);
- **a methodology version**: the scoring rules as data (`seeds/methodologyV1.js`).

The frontend half is `calendar-api-frontend/src/pages/Performance/`.

## The one idea: facts, setup and rules are kept apart

Scores are **never stored**. `engine/score.js` is a pure function of four things:

| Input | Where it lives | Changes when |
|---|---|---|
| facts | `performance-facts` (one doc per period × agent × source) | an import replaces a source |
| hours | live shifts, or `period.hoursSnapshot` once locked, or imported `hours` facts | shifts change (until locked) |
| agent setup | `period.agents[]`: region, role, cohort override per agent, per quarter | an admin saves the setup |
| methodology | `performance-methodologies`, immutable versions | never; a new version is added instead |

That is what makes the rules adjustable: when Q4 brings an `aps-v2`, Q3 can stay on
`aps-v1` (its `methodologyKey`) or be re-scored by pointing it at `aps-v2`
(`PATCH /periods/:key`, logged in `methodologyHistory`). No data moves either way, and any
quarter can be viewed under any version as a what-if (`?methodology=` on the scores
route). `ENGINE_VERSION` in `engine/score.js` is bumped if the engine itself changes how
the same inputs and config score.

### Adding a methodology version

1. Copy `seeds/methodologyV1.js` to `seeds/methodologyV2.js`, give it `key: "aps-v2"`,
   change the config, and append it to `METHODOLOGY_SEEDS`. The newest seed is the
   default for new quarters.
2. Never edit a stored version. The model refuses updates, and if a seed's config no
   longer matches what's stored, the stored one wins and a warning is logged.
3. A new knob needs engine support (and a test in `engine/score.test.js`). The
   frontend's Methodology tab renders from the config, so describe the knob there too.

## Methodology v1 in short

- **Rates:** interactions ÷ worked hours per channel. Hours are floored (as the
  quarterly sheet did), and at least 1h is needed for a rate.
- **Channel index:** `min(rate ÷ benchmark, 1.5) ÷ 1.5 × 100`.
- **Benchmark:** the cohort's mean of per-agent rates, over regular agents only,
  recomputed every quarter. σ and n are reported next to it; z-scores are context, not
  scoring.
- **Productivity:** channel indexes blended by each channel's share of the agent's
  interactions.
- **Quality:** `clamp((weighted CSAT − 70%) ÷ 30% × 100, 0, 100)`, ×0.8 under 5 surveys;
  no surveys means not graded.
- **APS by role:**
  - regular and billingSplit: 60/40 productivity/quality (billingSplit counts chats only);
  - billingSpecialist: 50/50 volume/quality;
  - teamLead: 30/70 volume/quality;
  - excluded: not graded.

  Volume is total interactions ÷ the cohort's regular-agent mean, capped at 100%.
- **Cohorts:** `core` (US, BR, IL) and `apac`, each with its own benchmark and
  leaderboard. APAC productivity is chats only.
- **Grades** (on APS rounded to 1 decimal): A+ ≥ 90, A ≥ 80, B ≥ 70, C ≥ 60, D otherwise.

## Rules worth knowing

- **Quarter boundaries are instants in UTC-3.** `lib/quarters.js` makes Q3 run from
  2026-07-01T03:00Z to 2026-10-01T03:00Z (exclusive). Never derive them from server-local
  date parts (the server is UTC).
- **Live hours stop at now.** Future shifts are scheduled, not worked.
- **Hours are cached briefly.** Live hours for an open quarter are cached in Redis for 10
  minutes under `performance:hours:<key>`, or `performance:dev:hours:<key>` when
  `NODE_ENV=development`, so a local run can't overwrite production's entry in the shared
  Redis. `?refresh=true` recomputes.
- **Locking freezes a quarter.** It stores the minutes and the report-group lists in
  `hoursSnapshot` and blocks imports and setup changes. Unlocking keeps the old snapshot
  but ignores it; locking again retakes it.
- **Imports replace their source** for the quarter: the pasted list is the whole list. The
  preview names anyone it would drop. Each import is kept, raw text included, in
  `performance-imports`, with the facts it replaced.
- **Names are matched without touching identity data.** The match tries the email
  column, then a saved alias (`performance-aliases`), then the exact full name. Fuzzy
  matches are suggestions only and never applied automatically. Confirming a fuzzy match
  can save the export's spelling as an alias.
- **People without an agendo account** (e.g. a billing specialist with no shifts) are
  added as Performance-only agents (`performance-agents`, id `ext_…`). Their facts and
  setup are keyed by that id. They are not placeholders in `users`: first sign-in only
  provisions a user when no doc has the email, and would leave a placeholder without
  its clerk id. Instead `services/directory.js` resolves the agent id to the user who
  later appears with the same email, at read time. Their data follows them, and
  identity data is never written.
- **Agents not in a quarter's setup are still scored.** They get defaults (regular, and
  a region from their Location if they're in exactly one of the four flag locations) and
  are flagged. A new quarter copies the previous quarter's setup.
- **Imported hours override shifts.** An agent's imported `hours` facts replace their
  shift minutes in agendo mode. This is the escape hatch for people whose shifts only
  exist in Sling (the overnight team in Q4 2026).
- **This repository is public.** No agent names or real numbers in code, seeds, tests
  or docs. Roles like team lead and billing are assigned in the UI.

## Routes

Every route is gated by `lib/access.js`: a named allowlist, not all admins. Access goes to the
agendo users whose email is in the `PERFORMANCE_ACCESS_EMAILS` env var (comma-separated).
Unset means nobody; `ADMIN_BYPASS=1` lets a local run through. The list lives in the
environment because this repository is public. `GET /performance/access` (any signed-in user)
returns `{ allowed }`, so the frontend can hide the page. `lib/access.js` is the one file to
change for finer roles.

Routes:

- `GET /performance/methodologies`, `GET /performance/methodologies/:key`
- `GET /performance/periods`, `POST /performance/periods {year, quarter, hoursSource?}`
- `GET /performance/periods/:key`: overview for the Data tab (setup, coverage, hours
  source, imports, warnings)
- `PATCH /performance/periods/:key {methodologyKey?, hoursSource?, note?}`
- `PUT /performance/periods/:key/agents {agents}`: whole-list replace
- `POST /performance/periods/:key/lock`, `POST /performance/periods/:key/unlock`
- `POST /performance/periods/:key/imports/preview {source, text}`, then
  `POST /performance/periods/:key/imports {source, text, decisions}`
- `GET /performance/periods/:key/imports`
- `GET /performance/periods/:key/scores?methodology=&refresh=`: everything the
  Leaderboard, Leads & billing, Interactions and Methodology tabs show, with each row's
  previous-quarter figures under the same methodology
- `GET /performance/agents`, `POST /performance/agents {name, email, region, periodKey?, role?}`,
  `DELETE /performance/agents/:agentId` (refused once they have imported data)
- `GET /performance/aliases`, `DELETE /performance/aliases/:id`

Writes to a locked quarter return 409.

## Tests

`npm test` runs `node --test "src/**/*.test.js"`, built into Node with no dependencies.
The engine and `lib/` are pure, so their tests need no database or Redis. Fixtures are
synthetic, and expected numbers are worked out by hand in the test comments.

## Remove it

1. Delete this folder.
2. Remove the two `performance` lines from `app.js`: the import and the `app.use`.
3. Optionally fold `reportsService.computeGroupMinutes` back into `computeHoursReport`.
   Reports works either way.
4. Delete `calendar-api-frontend/src/pages/Performance/`, its route and import in
   `src/main.tsx`, and the two "Performance" links in `components/Header/Header.tsx`.
5. Drop the `performance-*` and `dev-performance-*` collections.
