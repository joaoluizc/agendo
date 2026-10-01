# Schedule screens & date handling (frontend)

_The two schedule screens, how the selected day is driven by a URL param, how clock times are written, the Google-events switch, the pinned hour rows and their scrollbars, zoom, the phone layout, row order, and the date footguns._

_Last updated: 2026-09-30_

The frontend (`calendar-api-frontend`) has **two schedule screens**, one per
shift source (see [agendo overview](agendo-overview.md) for why both exist):

- **agendo view** — `src/components/ScheduleCalendar/ScheduleCalendar.tsx`,
  route `/app/schedule` (rendered via `pages/Schedule/Schedule.tsx`).
- **Sling view** — `src/components/SlingSchedule/SlingSchedule.tsx`,
  route `/app/sling-schedule`. Being retired: admins see `SlingSunsetBanner` above
  the grid, asking them to schedule in agendo from 2026-10-01 (the link keeps the
  `?date=`) and saying the Sling integration ends 2026-11-01. Agents don't see it.

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
  vertically. So the grid card holds two scrollers: the pinned block and the agent rows,
  both `overflow-x-auto` with their bars hidden, kept in step by `syncScrollFrom` (below).
  The pinned block used to be `overflow-hidden` with sideways wheel events forwarded to the
  rows, which meant a finger swiped along the hours did nothing — touch sends no wheel
  events.
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
- **Coverage rows go compact while pinned.** Once the block is stuck under the header, each
  `CoverageRow` drops from 52px to 30px: flatter bars, smaller counts, and the name without
  its summary line (the slot tooltips still carry every number). Heights animate. A
  zero-height sentinel at the top of the grid card marks where the block starts, read on
  scroll: compact once it passes under the header, full again only once it is clear by as
  much as the rows saved. That hysteresis matters: shrinking shortens the page, so on a
  short roster the browser clamps the scroll and pulls the sentinel back down — expanding
  at the same line would loop grow/shrink.

## Zoom

Each step of the toolbar's zoom buttons takes two hours off the view: 24, 22, … down to 2
(`MAX_ZOOM = 11`). Both ends stay clickable and do nothing.

- It only sets the track's width: `labelPx + 24 × (scroller width − labelPx) / visible
  hours`, never below `trackMinPx(geometry)`. Everything inside the track — rows, `NowLine`,
  the drop ghost, drag-to-create — already positions as a fraction of that width, so nothing
  else needs to know. Keep it that way: a fixed pixel offset inside the track breaks zoom.
- **Zoom keeps the hour in the middle of the view where it is.** `centerHourRef` records it
  from the user's own scrolling, and each step, day change and resize scrolls it back to
  the middle. It is a ref rather than read off the scroll position because two scrolls are
  not the user's: the loading skeleton is narrower than the track and snaps the scroll to 0,
  and our own write can be clamped at either end of the day. A scroll event that finds the
  rows where we last put them is ours and is skipped (`programmaticLeft`). Compare by
  position, not "skip the next event": a write does not always fire exactly one event (a
  hidden tab fires none, and a user scroll in the same frame merges with it), and a
  skip-next flag then swallowed the user's next real scroll. This replaced zooming toward
  midday, which at 2 hours always showed 11:00–13:00 whatever you had been looking at.
- **On today, zoom centres on now while the now line is on screen.** `changeZoom` checks
  the view *before* the step. If the line is in it, the current time becomes the centre
  hour; if you have scrolled it out of view, the step keeps your hour as on any other day.
  Without this, zooming in from the whole day closed in on midday rather than now.
- **The widest level depends on the screen.** `minZoom` is the smallest level whose hours
  are still at least the slot floor wide (`2 × slotMinPx` per hour). Wider than that, the
  floor binds and the track stops shrinking, so a zoom-out step would change nothing on
  screen — which on a phone used to be every step from the whole day to about 5 hours.
  Lower levels are read as `minZoom` and zoom-out stops there.
- The scroll uses the hour width as drawn, `(trackWidth − labelPx) / 24`. Using the width
  the zoom asked for landed each step short of its hour whenever the floor was binding.
- The tooltip says how much is on screen (`8h on screen`), not which hours — that depends
  on where the grid is scrolled.
- The zoom level is component state: it resets on reload and isn't in the URL.

## On phones

Below Tailwind's `md` (768px, `useIsMobile` in `hooks/useMediaQuery.ts`, written as
Tailwind's own `max-md` query so JS and CSS switch at the same pixel) the grid uses
`MOBILE_GRID` instead of `DESKTOP_GRID` (`scheduleUtils.ts`):

- **Label column 104px (desktop 168), slot floor 10px (desktop 24).** Both reach the rows,
  the ruler, the coverage rows and `NowLine` through two CSS variables that
  `ScheduleCalendar` sets on the grid card — `--schedule-label-col` and
  `--schedule-slot-min`, read by `GRID_COLUMNS`/`SLOT_COLUMNS`/`LABEL_COLUMN` — so the
  geometry is still decided in one place. The label cell drops its avatar, tightens its
  padding and shortens "7.5h scheduled" to "7.5h".
- **It opens at 4 hours** (`MOBILE_START_ZOOM = 10`), centred on the current time when the
  day is today and on midday otherwise. Zoom runs from about 12 hours (where the 10px floor
  binds at 375px) down to 2. Only the starting level is phone-specific: rotating or
  resizing keeps whatever zoom the user chose.
- **Coverage rows are always compact**, not only while pinned — the pinned block would
  otherwise take a third of the screen.
- **The toolbar fits three lines down to 360px**: day stepper, date (without its year) and
  zoom, with slightly narrower buttons; then the location filter and the events switch
  (labelled "Cal. events"); then the actions on a full-width line of their own —
  Duplicate and Select icon-only at the start, New shift at the end, leaving room for
  select mode's buttons. `max-md:order-1`/`order-2` do the reordering, and an agent, who
  has no actions, gets no third line.
- **The header** keeps the avatar and theme menu at the right edge, with the localhost
  badge centred.
- Margins drop from `mx-5` to `mx-3`, and the drafts bar drops its explanation after the
  count.

Resizing and moving shifts are decided by **pointer type, not width** — see
[shift drafts](shift-drafts.md).

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
