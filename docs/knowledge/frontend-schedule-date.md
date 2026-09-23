# Schedule screens & date handling (frontend)

_The two schedule screens, how the selected day is driven by a URL param, how clock times are written, the Google-events switch, the pinned hour rows and their scrollbars, zoom, row order, and the date footguns._

_Last updated: 2026-09-23_

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

## Clock times: one formatter, 24-hour or AM/PM

Every clock time the app writes goes through `src/utils/timeFormat.ts`. Components read
`useTimeFormat().clock`; utilities that produce text take a `clock` argument
(`buildCoverageSeries`, `readZones`). **Don't format a time with `toLocaleTimeString`,
`padStart` or date-fns `HH:mm`** — one-off formatters are how the grid header came to be
24-hour while the blocks on it were AM/PM.

- The choice is `"auto" | "24h" | "12h"`, set in the header's theme menu — the sun/moon
  button, which carries a small clock to say so — on every page, and kept per browser in
  localStorage (`agendo.timeFormat`). It is a module-level store read through
  `useSyncExternalStore`, so switching it re-renders exactly the components that write a
  time and never touches the schedule provider.
- **"Auto" is only as good as the browser.** It reads
  `Intl.DateTimeFormat().resolvedOptions().hourCycle`. Chrome and Edge derive that from the
  browser's *language* (en-US gives AM/PM; en-GB, pt-BR and he-IL give 24-hour), not from
  the OS 12/24-hour switch; Safari and Firefox can follow OS regional settings. Hence the
  explicit override, and the menu's "Auto (browser: …)" label saying what it resolved to.
- Resolved once per page load, and there are only two clock objects: about 500 grid
  components call the hook on every render, and an `Intl.DateTimeFormat` each would show.
- Rules the old formatters had, kept:
  - `clock.hour(h)` on fractional hours: 24 stays `24:00` (`12:00 AM`) and past 24 wraps
    (`25` is `01:00`) — the overnight-edit rule from [shift drafts](shift-drafts.md).
  - `clock.range(start, end)` writes an end at exactly midnight as `24:00` too, so a block
    reads like its dialog. `clock.hourRange` is the same on fractional hours.
  - 12-hour ranges write a shared suffix once (`9–11 AM`), except across midnight
    (`9 PM – 1 AM`), where `9–1 AM` would read backwards.
- Written by hand, not by `toLocaleTimeString`. ICU 72 put a narrow no-break space
  (U+202F) before AM/PM in some engines, which silently broke the old string surgery on
  `"10:00 AM"`. The only browser-locale timestamps left (Bug Tracker tooltips) pass
  `hourCycle: clock.hourCycle`.
- Typing is unaffected: `parseHourInput` reads both clocks whichever one the field shows
  (`9:30 PM`, `21:30`, `930p`).

## Hiding Google Calendar events

The toolbar's **Google Calendar** switch (`CalendarEventsToggle`; admins only, since nobody
else loads events) shows or hides every agent's Google events on the grid. It is for reading
the shifts on their own — someone unsure when their shift is can drop the day's meetings and
see where it falls. `ScheduleCalendar` holds it and keeps it in localStorage
(`agendo.showCalendarEvents`, written only while hidden), so it stays as left across
reloads, sessions and days.

- Hidden means *not fetched*: `fetchData` skips `getGCalendarEvents`, the heavy call, so
  switching days is faster too. Rows lose their event lanes and shrink, and the legend drops
  its entry. A switch rather than a menu item, because its position is the state.
- Showing them again refetches quietly. A fetch that did not ask for events leaves them
  alone — hiding is what clears them — so one still in flight cannot blank what the newer
  fetch loaded.
- **Accepted trade-off: hidden events hide meeting clashes.** The shift dialogs have never
  looked at Google events — their conflicts come from agendo shifts alone — so while the
  under-lane is off, nothing shows a shift being drawn over a meeting.

## Pinned hours and coverage rows

While the page scrolls, the hour row and the coverage rows stay pinned under the site header
(`sticky top-16`, the header's `h-16`), so the hours stay readable deep in the roster.

- **They can't be a sticky row inside the grid's scroller.** An `overflow-x` element is a
  scroll container in both axes, so a sticky child sticks to it — and it never scrolls
  vertically. So the grid card holds two scrollers: the pinned block (`overflow-hidden`),
  and the agent rows (`overflow-x-auto`, which owns the sideways scroll). The rows'
  `onScroll` copies `scrollLeft` into the pinned block, and a sideways wheel over the pinned
  block is forwarded to the rows.
- **The card is `overflow-clip`, not `overflow-hidden`.** Hidden would make the card a
  scroll container too and capture the pinned block; clip still rounds the corners without
  that.
- `NowLine` is drawn in both parts; only the pinned one has the time label.
- **The rows' own scrollbar is hidden** (`schedule-scrollbar-hidden`). In its place are two
  `ScrollRail`s that start after the agent column: one inside the sticky block, under the
  coverage rows (so it's in reach at any page scroll), and one under the last agent. A rail
  is an empty box as wide as the track minus the agent column, offset by that column, so its
  scroll range equals the rows' and `scrollLeft` copies one to one. `syncScrollFrom` copies
  whichever of the four scrollers moved into the other three; writing the value a scroller
  already holds fires no scroll event, so there's no feedback loop. Rails only render when
  the track is wider than the view.

## Zoom

The toolbar's zoom buttons drop one hour off **each** edge of the view per step (00 and 23,
then 01 and 22, …) down to 8 hours (08–15, `MAX_ZOOM = 8`). Zoom out restores the last pair
and does nothing on the whole day.

- It only sets the track's width: `LABEL_COLUMN_PX + 24 × (scroller width − label) / (24 −
  2 × zoom)`, never below `TRACK_MIN_PX`. Everything inside the track — rows, `NowLine`, the
  drop ghost, drag-to-create — already positions as a fraction of that width, so nothing
  else needed to change. Keep it that way: a fixed pixel offset inside the track breaks zoom.
- Each step scrolls to `zoom × hourPx`, so the kept hours fill the view and the dropped ones
  sit off either edge. Any sideways scroll the user had done is lost on a zoom.
- The zoom level is component state: it resets on reload and isn't in the URL.

## Row order

Agent rows are ordered by when each agent's day starts, then by name
(`scheduleUtils.firstShiftStart`). Agents with nothing starting that day come last.

- Only a shift that **begins** on the day counts. One carried over from the night before is
  drawn from 00:00, but it ends yesterday rather than starting today.
- Every kind of block counts, unavailable time and drafts included, so the order matches
  where each row's first block sits — an agent whose day opens with an Unavailable block
  sorts by that block.
- The order is re-derived from the day's shifts, so moving an agent's first shift earlier
  moves their row once the change is saved.

## Footguns

- **Parse date params in local time.** `new Date("2026-06-23")` parses as **UTC**
  midnight, which renders the wrong day in negative-offset timezones. Use
  `formatDateParam` / `parseDateParam` in `src/utils/utils.ts`, which build the
  `Date` from local calendar parts and validate it.
- **air-datepicker generic.** `new AirDatepicker("#date", …)` with a string
  selector infers `AirDatepicker<HTMLElement>`, which will not assign to a
  `useRef<AirDatepicker | null>` (the class defaults to `<HTMLInputElement>`).
  Pin it explicitly: `new AirDatepicker<HTMLInputElement>("#date", …)`.
