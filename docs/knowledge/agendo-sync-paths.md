# Calendar sync paths

_The two ways shifts reach Google Calendar, plus the position id-space gotcha._

_Last updated: 2026-09-29_

Agendo syncs shifts to each user's Google Calendar through **two distinct paths**
in `calendar-api-backend/src/services/gCalendarService.js`. Anyone changing sync
behavior has to handle both. For the bigger picture, see the
[agendo overview](agendo-overview.md).

## 1. Sling sync (bulk-oriented)

Pulls shifts from the Sling API for a date and writes them to calendars. All
entry points are **admin-triggered HTTP — there is no cron job** (the only
`node-cron` import is commented out):

- `POST /gcalendar/days-shifts-to-gcal` → `addDaysShiftsToGcal_cl` — everyone,
  one day. The primary path; its per-user enabled-position list comes from
  `positionService.getPositionsToSyncForUsers`.
- `POST /gcalendar/user-day-shifts-to-gcal` and
  `POST /gcalendar/admin-sync-user-day-shifts` → `addUsersDayShifts` — a single
  user's day.

(Two older functions, `addDaysShiftsToGcal` and `addUsersDayShifts_cl`, still
exist but are unwired/dead.)

## 2. Agendo sync (per-shift)

Publishing a draft (`POST /shift/publish`) is what syncs an agendo-native shift. Creating,
editing or duplicating one does **not** — a new shift is a draft, and a draft never reaches
a calendar (see [shift drafts](shift-drafts.md)). Editing or moving an already-published
shift still re-syncs it as it always did.

All of these funnel through `addEventForShift` → the single gate `shouldSyncShift`, which
now also refuses anything still in draft.

## The sync filter = per-position user preference

Each shift has a *position* (tickets, chats, "Unavailable", …). Each user picks
which positions sync to their calendar, stored as `user.positionsToSync` =
`[{ positionId, sync }]` in Mongo. (This was once mirrored into Clerk
`publicMetadata.positionsToSync`; it no longer is, and that copy must not be read —
see [Clerk / Mongo boundary](clerk-mongo-boundary.md).)
Sync only adds shifts whose position the user enabled. Admins can additionally
force a position to always sync for everyone, overriding the per-user choice
(`Position.enforceSync`).

## Gotcha: positions are matched in two different id-spaces

- **Sling paths** compare the Sling shift's `event.position.id` against the
  position's Sling **`positionId`** (a string).
- **The agendo path** (`shouldSyncShift`) compares `shift.positionId` (a Mongo
  ObjectId) against the position's Mongo **`_id`**.

So "which position is this?" is keyed differently in the two worlds — any logic
that spans both must resolve both id-spaces.

## Tracking & cleanup

Events agendo creates are tracked in Mongo (via `addedGCalEventsService`) so a
re-sync can delete the previously-added events before re-adding them. Bulk
re-sync deletes tracked events first, then re-adds — a flow that has previously
caused an intermittent "shifts wiped from Google Calendar" bug, so treat the
delete-then-add ordering and its error handling carefully.

## Each path only deletes its own events

Both paths write to that one tracking collection, and nothing in it says which path
made which event. The rule that keeps them apart:

- **An event is agendo's when a shift holds it as its `syncedEvent`.** Only the agendo
  path writes that field, and it is on every event published before the rule existed,
  so no migration or tag was needed. `shiftService.findSyncedEventIds` asks the question
  (indexed on `syncedEvent.id`).
- **Sling sync deletes only what is left.** Both Sling entry points read the day's
  tracked events through `gCalendarService.findSlingEventsByDate`, which drops every
  agendo-owned one before the delete-then-re-add runs. If that lookup fails, the sync
  stops before deleting anything; falling back to the full list would bring the wipe back.
- **The agendo path needed no change.** Every delete it makes (edit, unpublish, delete,
  duplicate-day replace) targets the one event its own shift points at, so it cannot
  reach an event Sling made.

Before this, Sling sync deleted the whole day's tracked list. In Sept 2026 a day built
and published in agendo was then synced from the Sling screen: those agents had nothing
in Sling, so every agendo event of the day was deleted and nothing was put back. The
shifts still claimed `isSynced`.

Side effects worth knowing:

- A tracked event whose shift is gone (deleted, unpublished, re-timed) is owned by no
  shift, so a Sling sync treats it as its own and deletes it: Google answers "already
  deleted" and the stale tracking row is cleared. That is the only cleanup those rows
  get; the agendo path deletes the event but leaves its tracking row.
- If the same shift exists in both Sling and agendo, the agent now gets **both** events.
  Before, the Sling sync happened to delete agendo's copy.
- An agendo shift whose event went missing is repaired by unpublishing and publishing it
  again. No day re-sync covers agendo shifts.

## Working with sync

When changing sync behavior, account for **both** paths (bulk Sling + per-shift
agendo) and **both** position id-spaces — and remember bulk sync is
manual/admin-triggered, never scheduled. Anything new that deletes tracked events
by date has to go through `findSlingEventsByDate`, or it will delete agendo's.
