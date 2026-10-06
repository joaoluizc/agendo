# Performance (frontend half)

`/app/performance`, open only to the people in the backend's `PERFORMANCE_ACCESS_EMAILS`
allowlist (not all admins). It shows the Agent Performance Score per quarter. The
backend half, and the model behind it, are in
`calendar-api-backend/src/performance/README.md`.

## Tabs (`?tab=`)

- **Leaderboard:** one card per cohort, ranked by APS, in the CRO's leaderboard
  columns. The header shows each benchmark with σ and n. Click a row for
  `ScoreBreakdown`, which shows the full arithmetic with that agent's numbers.
- **Leads & billing:** the roles scored on volume + quality, and agents shown but not
  graded.
- **Interactions:** the quarterly sheet's "Total Support Interactions" table: counts,
  hours, per-hour productivity, weighted CSAT, and changes against the previous quarter.
  "Copy as TSV" exports it.
- **Data:**
  - hours source and lock;
  - paste imports (`ImportDialog`: paste → preview → confirm people → import);
  - the per-quarter agent setup (region, role, cohort override).
- **Methodology:** rendered from the version's config, so a new version describes itself.

`?period=2026-Q3` selects the quarter. `?methodology=aps-v2` shows a what-if under
another version; the selector only appears once there are two.

## Conventions

- `api.ts` follows `pages/Reports/api.ts`.
- `access.ts` asks `GET /performance/access` once per page load. The nav links and the
  page use it, and the route sits outside `AdminRoute`, since access isn't an admin perk.
- Quarter dates are formatted in the quarter's own timezone (`period.tz`). Don't reuse
  Reports' `DateRangePicker`, which builds quarters in the browser's timezone.

## Remove it

Delete this folder, the `Performance` import and route in `src/main.tsx`, and the two
links in `components/Header/Header.tsx`. Then remove the backend half (see its README).
