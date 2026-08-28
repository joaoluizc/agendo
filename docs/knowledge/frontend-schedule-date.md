# Schedule screens & date handling (frontend)

_The two schedule screens, how the selected day is driven by a URL param, and the date footguns._

_Last updated: 2026-08-27_

The frontend (`calendar-api-frontend`) has **two schedule screens**, one per
shift source (see [agendo overview](agendo-overview.md) for why both exist):

- **agendo view** — `src/components/ScheduleCalendar/ScheduleCalendar.tsx`,
  route `/app/schedule` (rendered via `pages/Schedule/Schedule.tsx`).
- **Sling view** — `src/components/SlingSchedule/SlingSchedule.tsx`,
  route `/app/sling-schedule`.

They are separate components with their own fetching, but they share the same
date-navigation behaviour. Any change to how the day is selected should be made
in **both**.

## The selected day lives in the URL

The day being viewed is the `?date=YYYY-MM-DD` query param — it is the single
source of truth, not component state. This means a refresh (or a shared link)
reopens the same day instead of snapping back to today.

It is centralised in the `useScheduleDateParam` hook
(`src/hooks/useScheduleDateParam.ts`), which returns:

- `selectedDate: Date` — always valid; falls back to today.
- `dateKey: string` — the canonical `YYYY-MM-DD`. **Use this as the dependency
  for data-fetching effects**, not the `Date` object, so each calendar day is
  fetched exactly once (a memoised `Date` fallback would otherwise change
  identity and double-fetch).
- `setDate(date, { replace? })` — updates the param.

Behaviour: on first load with a missing/invalid param, today is written with
`replace` (no stray history entry). Manual navigation pushes history, so browser
back/forward steps through days.

The date picker (air-datepicker), the `DateNavButtons` control, and refreshes
all flow through this hook. The picker's highlighted day is kept in sync with
`datepicker.selectDate(date, { silent: true })` (silent avoids re-firing
`onSelect`).

## DateNavButtons

`src/components/DateNavButtons/DateNavButtons.tsx` is the shared control to the
right of the picker: glued previous/next-day arrows (one visual control via
`-space-x-px` overlapping borders) plus a separate **Today** button. It takes
`selectedDate` + `onSelectDate` and is reused by both screens.

## Shift times are quarter-hourly; the grid is half-hourly

`shiftPlanning.HOUR_STEP` is `0.25`, so the dialogs step and accept times in 15-minute
increments (the duration presets are 15m/30m/45m/1h/2h/4h). The grid track is still
**48 half-hour columns**, and `CoverageMeter.targets` is still `[7][48]` — neither changed.

`scheduleUtils.spanPlacement` is what reconciles the two. A block claims every half-hour
cell its span overlaps, then gives back the unused fraction at each end as a percentage
margin, so a 09:15–09:45 shift paints on the real minutes inside two cells. The
alternative — doubling the grid to 96 columns — would have halved the column width and
changed how the whole schedule looks for the sake of the occasional short break.

Two consequences worth knowing:

- `columnStart`/`columnSpan` still round to the half hour and are still used for the
  Google-events under-lane in `AgentRow`. Don't use them for shifts.
- Coverage requires a shift to span a **whole** half-hour slot to count, so a 15-minute
  shift contributes nothing to a coverage meter. That is intended — a meter asks "is this
  half hour covered" — but it means short breaks are invisible to coverage.

## Footguns

- **Parse date params in local time.** `new Date("2026-06-23")` parses as **UTC**
  midnight, which renders the wrong day in negative-offset timezones. Use
  `formatDateParam` / `parseDateParam` in `src/utils/utils.ts`, which build the
  `Date` from local calendar parts and validate it.
- **air-datepicker generic.** `new AirDatepicker("#date", …)` with a string
  selector infers `AirDatepicker<HTMLElement>`, which will not assign to a
  `useRef<AirDatepicker | null>` (the class defaults to `<HTMLInputElement>`).
  Pin it explicitly: `new AirDatepicker<HTMLInputElement>("#date", …)`.
