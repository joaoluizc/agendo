# Shift drafts

_The draft/published lifecycle: what a draft is excluded from, and the one filter rule that matters._

_Last updated: 2026-08-28_

An agendo shift is a **draft** until an admin publishes it. Creating one no longer syncs
it to anybody's calendar — publishing does. This is the first real step toward agendo
owning shift creation instead of Sling (see [agendo overview](agendo-overview.md)), and it
buys the one thing Sling could do that agendo could not: build a day, look at it, then
commit it.

## The lifecycle

```
create (UI, or a copied day)  ->  status: "draft"     nothing synced, nothing reported
POST /shift/publish           ->  status: "published" (+ a calendar event, if the agent
                                  has that position's sync on)
PUT  /shift/ (status: draft)  ->  status: "draft", calendar event deleted
delete                        ->  gone
```

The create dialog also offers a **"Publish now"** checkbox, which posts
`status: "published"` and syncs in the same request — for a shift already known to be
final. It is off by default, so the reviewable outcome is the one you get without
choosing. `POST /shift/new` rejects any `status` value other than the two known ones
rather than falling back to draft: silently ignoring it would let a client believe it had
published something it had not. Both paths share `syncPublishedShift`, so the sync, the
"no event because the agent switched this position off" case, and the failure handling
exist once.

## Un-publishing, and the re-time safety rule

`PUT /shift/` accepts `status`, so an edit can move a shift either way. The edit dialog
shows the state as a **Published** checkbox: unchecking it and saving takes the shift back
to draft and deletes its calendar event. That is the only un-publish path — there is no
separate endpoint, because the edit dialog is where you already are when you want it.

**Re-timing a published shift turns that checkbox off automatically**, once per dialog
open, so the new time cannot reach an agent's calendar unless someone re-checks it. The
footer says why; a toggle that moves on its own and stays silent reads as a glitch. It is
one-shot on purpose: re-check the box deliberately, nudge the time again, and it stays
checked.

Omitting `status` leaves it untouched, so callers that don't care are unaffected.

## Grid gestures ask, they don't decide

Resizing a shift by an edge and dragging one to a new time or agent both end in the same
prompt: *publish this change, or keep it a draft?*

- Raised by parking a `PendingShiftChange` on the schedule provider; `PendingChangePrompt`
  is rendered **once** by `ScheduleCalendar` and does the write. It lives there rather than
  in the components because a drop is raised by `EmptySlot`, of which there are 384 on a
  full roster.
- **Only a published shift is asked about.** Re-timing a *draft* has nothing at stake — it
  stays a draft, nothing syncs — so it saves immediately and reports in a toast, which also
  carries what the prompt would have said (crosses midnight, moved to another agent). See
  `autoKeepDraft`.
- **Three ways out of the prompt:** Cancel (throw the gesture away), Keep as draft, or
  Publish change. Escape and an outside click both mean Cancel — dismissal used to save as
  a draft, which was right while that was the only alternative to publishing, but a dialog
  whose Escape does something other than its own Cancel button is a trap.
- **A delete always asks**, draft or not, because it is the one irreversible option.
- The block holds its dragged size until the prompt is answered, so the dialog is never
  describing a change the grid has already snapped back from.
- The prompt says publishing *might* update the calendar, not that it will — whether an
  event appears depends on the agent's per-position sync settings.

Resize specifics: 15-minute steps (`HOUR_STEP`, the same increment the dialog's steppers
use), one axis, right edge moves the end and left edge moves the start. Scale comes from the
row track (width / 24 = one hour), not from the block, because a 15-minute block is a few
pixels wide and the worst possible thing to calibrate against.

**A shift that crosses midnight gets no handles at all** — see the overnight section below.
A resize works on the day's clamped span, which cannot express "past midnight", so either
edge would write back only the visible part.

Shrinking a shift until the dragged edge reaches the opposite one — one step past the
15-minute minimum — is read as wanting it gone: the block turns destructive-coloured mid-drag
and releasing asks for delete confirmation.

Move specifics: `dropTarget` on the provider records whose row and which hour the pointer is
over, and each `AgentRow` derives its own dashed preview from that plus the dragged shift's
duration. HTML5 drag-and-drop only gives the browser's snapshot of the block under the
cursor, which shows *what* is moving and nothing about *where* it lands. Two details:

- The write to `dropTarget` is guarded on the target actually changing. `dragover` fires
  continuously, and an unguarded write re-renders the whole schedule on every mouse move.
- `Shift` clears the drag state on `dragend`, not just on drop. `dragend` fires for a
  cancelled drag (Escape, or a drop on nothing) where `drop` never does — without it,
  `shiftInDrag` stayed pointing at a shift indefinitely and the preview stranded on the last
  cell crossed.

Drops land on 15-minute boundaries, like a resize. The cells are still one per hour, so the
landing time comes from `EmptySlot.pointerHour` — where inside the cell the pointer sits —
and **both the preview and the drop call it**, which is what stops them disagreeing.
Rounding happens on the absolute hour rather than on the fraction, so the far right of the
09:00 cell resolves to 10:00 instead of being pinned to 09:45.

Dropping a shift back where it already is writes nothing and raises no prompt. Before that
check, picking a shift up and putting it down asked whether to publish a change that did not
exist — and answering would have re-timed it to identical values and, if published, deleted
and recreated its calendar event for no reason.

## Overnight shifts: anchored on the day they start

A shift running past local midnight is **one record shown on two days** —
`findShiftsByRange` returns anything overlapping the day and `dayBounds` clamps it, so
21:00→01:00 draws as 21:00–24:00 on its start day and 00:00–01:00 on the next, each losing a
rounded corner on the side it continues from.

Editing one used to **truncate it, from either day**. The dialog read its range through
`dayBounds` (clamped to the day you were *looking at*) and wrote back with
`rangeToIso(selectedDate, …)`, so a save from the start day produced 21:00→00:00 (1h lost)
and from the spill day 00:00→01:00 (3h lost). Silent, and live in production data.

The fix: **the dialog anchors on the shift's own start day**, not the viewed one, and the
range is left unclamped so `end` can exceed 24 — `hourToDate` already turns 25 into 01:00
the next day, so nothing new was needed to build the instants. `clampRange` takes a `maxEnd`
and only the edit dialog raises it, and only for a shift that *already* crosses midnight:
a normal shift still cannot be pushed past its own day, so no dialog gained the ability to
*create* an overnight. Creating one remains a drag-only outcome.

Three details that follow:

- The **End** field relabels to "End · next day", and `formatHour` wraps past 24 so the
  number stays a clock time (`01:00`, not `25:00`). Which day it falls on is the label's job.
- A typed end at or before the start means the next day when that is allowed. Unambiguous
  because shifts never run near 24 hours.
- **Start** stays inside the anchor day whatever `maxEnd` is. A shift belongs to the day it
  begins; moving its start to an earlier day is a drag, not a typed time. That is what keeps
  the axis one-ended.

How common is this? Measured on the 246 real shifts: **48 (20%) cross midnight for
*somebody*** — but only 6.5% in São Paulo, 5.3% in Jerusalem or Manila, 10.6% in New York.
"Overnight" is a property of the viewer, not the shift, because the grid clamps to the
browser's local day. Two admins in different zones each see a different set. Note also that
every roster user still has the schema-default `timezone: "UTC"`, so the app cannot render
an agent's day as that agent sees it.

### Trap: `validateShift`'s user field differs by route

`POST /shift/new` takes a `userIds` **array** (one slot, many agents); `PUT /shift/` takes a
single `userId`. Both called `validateShift` with the `userIds` list, so **every update was
rejected** with `Missing fields: userIds` — editing a shift and dragging one both failed
with "1 change could not be saved" and nothing else. It sat on `main` unnoticed because the
frontend threw away the server's message. `validateShift` now takes
`{ userField }`, and `shiftRequests.updateShift` surfaces the response's `message`.

### Trap: `validateObjFields` eats the body

`validateShift` → `validateObjFields` **mutates the object it is given and deletes every
key outside its required list** — and it is handed `req.body` directly. So anything read
off the body *after* that call is already gone.

This shipped as a bug: "Publish now" read `req.body.status` on the line below
`validateShift(req.body)`, got `undefined`, and every shift was silently created as a
draft. Both `createShift` and `updateShift` now read `status` **before** validating. If you
add another body field to either, read it before the validate call or add it to the
required list.

## What a draft is excluded from — and what it is not

| Reader | Sees drafts? | Why |
|---|---|---|
| Hours report (`reports/reportsService.js`) | **No** | A draft is a plan; counting it as time worked is a reporting error |
| Google Calendar sync (`gCalendarService.shouldSyncShift`) | **No** | Publishing is the only thing that reaches an agent |
| Schedule grid (`GET /shift/range?includeDrafts=1`) | Yes, for admins | Reviewing drafts is the point of the grid |
| Duplicate-day, both source and target | Yes | See the trap below |
| Coverage meters (grid row *and* dialog strip) | Yes, shown separately | See "coverage" below |

### Trap: the duplicate-day flow needs drafts

It would seem natural to exclude drafts there too. Don't. A day worth copying is usually
one that was *just built*, so it is entirely draft — excluding them makes "copy Monday
onto the rest of the week" silently copy nothing. And a target day holding drafts is not
empty, so `skip` has to skip it and `replace` has to clear it, or replacing a day stacks a
second set of drafts on top of the first.

Copies always land as drafts themselves, whatever the source was, and never inherit its
`runId`, `notes`, or publish stamps.

## A missing status means published

Every shift written before this field existed has no `status` at all, and those are real,
published history. Two rules keep that true, and both are the counter-intuitive direction:

- **Query with `{ status: { $ne: "draft" } }`, never `{ status: "published" }`.** Measured
  on the live collection: `$ne` matched all 246 legacy shifts, the positive form matched
  **0**. Filtering the obvious way empties the schedule and every report.
- **Test for `=== "draft"`, never `!== "published"`.** The negative form turns all of that
  history into drafts. The frontend routes every such test through `scheduleUtils.isDraft`
  so there is one place to get it right.

### Why the schema has no default

`status` deliberately has no `default` and is not `required`, which looks like an omission
and is not. Mongoose applies a default when it **hydrates** a document, not only when it
creates one — with `default: "draft"` a legacy shift read back through the model arrives
claiming to be a draft (measured, not assumed), so all 246 would go unsynced and uncounted.
That would also contradict the query layer, which correctly treats those same documents as
published: filter and object would disagree, and correctness would depend on running a
migration before the deploy and never slipping.

Not `required`, because a legacy document loaded and re-saved (any edit) would otherwise
fail validation on a field it never had.

The fail-closed default lives one layer up, in `shiftService.createShift` — the only place
a `Shift` is ever constructed. New means draft; absent means published; nothing has to be
migrated for either to hold.

`src/database/scripts/backfillShiftStatus.js` stamps the field onto legacy documents
(dry-run by default, `--apply` to write, idempotent). It is **cleanup, not a prerequisite**:
worth running so the data describes itself, but the app is correct before and after. It
only becomes required if the `$ne` filters are ever tightened to `= "published"`.

## Where the choke points are

Only two places decide anything, which is what keeps this tractable:

- **`shiftService.findShiftsByRange(start, end, { includeDrafts })`** — every backend shift
  read goes through here, and drafts are excluded unless a caller opts in. The default is
  the safe one, so forgetting gets you the right answer.
- **`gCalendarService.shouldSyncShift`** — returns false for a draft. It was already the
  single gate for the per-shift sync path, so putting the check there covers the
  drag-to-move path (`PUT /shift/`) and anything added later for free.

One non-obvious consequence: `PUT /shift/` builds its shift from the request body, so the
controller has to put the *resolved* status onto that object before the sync attempt —
`shouldSyncShift` decides on that field, and an edited shift arriving without one would be
pushed to the calendar regardless of what it actually is. The resolved status is the
requested one, or the stored one when the request says nothing.

The controller also resets `isSynced`/`syncedEvent` to empty before the sync attempt rather
than letting the request body's (absent) values carry through: a shift going back to draft
would otherwise keep claiming a calendar event that had just been deleted.

## Coverage counts drafts, and says so

Drafts count toward coverage, in both the grid's `CoverageRow` and the dialogs'
`CoverageStrip`. This is the one place drafts are deliberately *not* filtered out: with
draft as the default state, a day being built is entirely draft, and a published-only
coverage row would read zero exactly when it is most needed. Coverage answers "does the
plan cover this hour?".

Both renderers split the bar — solid for published, a dotted hatch for the draft share —
so "covered" cannot be misread as "committed". The two series are computed by two separate
functions (`scheduleUtils.buildCoverageSeries` and `shiftPlanning.buildStripSeries`) that
are deliberately kept in agreement; change one and you must change the other.

The draft share is hatched rather than drawn as a translucent fill. The translucent
version shipped first and failed review: when a slot is below target the bar's fill *and*
the cell's background are both the warn colour, so a 45%-opacity draft segment disappeared
into it — washing out in precisely the case that matters. Full-opacity strokes with gaps
read on any backdrop, in either theme.

**Coverage counts agents, not shifts** — and this surprises people. An agent already
covering a slot with a published shift contributes nothing more by also having a draft
there, so `draftCounts` is 0 and no hatch appears. That is correct: coverage of that slot
genuinely does not depend on the draft. A draft only shows in the coverage row when it
covers a slot that published shifts do not. If you are trying to *see* the hatch, put the
draft on a slot or an agent that nothing published already covers.

## Bulk actions, and the cross-day delete that lost data

**Ctrl-click (or Cmd-click) a shift enters select-shifts mode** and takes that shift as the
first pick, instead of opening the edit dialog — only the first click needs the modifier.
Both keys are accepted rather than sniffing the platform: Ctrl is the multi-select modifier
on Windows and Linux, Cmd is on macOS, and Ctrl there also raises the context menu.

Select-shifts mode has four actions: clear, publish (`p`), unpublish (`u`), delete
(`delete`). Publish and unpublish send only the applicable half of the selection — drafts
to publish, published shifts to unpublish — so a mixed selection does the sensible thing,
and each button disables when the selection holds nothing of its kind.

Two rules, both learned the hard way:

- **The selection is cleared when the day changes** (`ScheduleCalendar`). It used to
  survive navigation while only the visible day renders, so shifts selected on one day
  stayed selected *invisibly*, with no way to see or deselect them. Select a few more on
  the next day, press delete, and both days went. That is how a real day of shifts was
  lost. The delete confirmation now also states the count and the distinct days, so if a
  stale selection ever survives again it is visible before the button, not after.
- **Every bulk action ends the mode**, via `exitBulkSelect` on the provider — one function
  rather than two setters per call site. Staying in select mode holding shifts that have
  just been acted on is how a stale selection survives to affect the next action. Pressing
  "Done selecting" clears it for the same reason: once the checkboxes are gone, a retained
  selection is invisible and impossible to deselect.

The `p`/`u` hotkeys carry a guard the older `esc`/`delete` ones do not: they bail out when
the event target is an input, textarea, select or contenteditable, and on any modifier
combination. A bare printable letter would otherwise fire while being typed into the agent
search box, and `Ctrl+P` has to stay print.

## Position picker order

`GET /position/all` returns Mongo's insertion order, which is meaningless to whoever is
choosing — the handful of positions a team actually schedules sat scattered through a list
of a dozen. `Position.lastUsedAt` records the day a position was last put on a shift, and
`scheduleUtils.byRecentUse` orders the picker by it, alphabetically within a day.

**Truncated to the start of the UTC day, and that is the point.** A precise timestamp would
reorder the dropdown after every shift and move the option you were reaching for; at day
granularity today's positions sit on top and hold still. Stamped by
`positionService.touchPositionUsage` as a single conditional `updateOne` — the filter only
matches when the stored day is older, so it is a no-op after the first shift of the day and
two concurrent calls cannot race. Failure is swallowed: it is dropdown ordering, and losing
it must never fail a shift write.

Sorted in `PositionCombobox` rather than in the provider, deliberately — Settings › Manage
Positions wants a list that never moves.

## Provenance fields

`source`, `runId` and `notes` exist on `Shift` but only `source` (`"ui"`) is set today.
They are there for the planned schedule-ingest endpoint, which posts a generated day as a
batch of drafts for review: `runId` identifies the batch so a re-run can replace it,
`notes` carries per-shift context for whoever reviews it. Added up front so that endpoint
does not need a second migration over the same collection.

## Still open

`shifts` is the one collection that is **not** env-split, so a backend run with
`NODE_ENV=development` writes into production `shifts` (see
[calendar sync paths](agendo-sync-paths.md) and `src/database/scripts/purgeOrphanShifts.js`).
Drafts make this cheaper — dev-created shifts are drafts, so they stay out of reports and
calendars by default — but they do not fix it.
