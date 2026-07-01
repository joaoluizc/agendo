# Calendar sync paths

_The two ways shifts reach Google Calendar, plus the position id-space gotcha._

_Last updated: 2026-06-22_

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

When a shift is created, updated, or duplicated in agendo (`POST /shift/new`,
`PUT /shift/`, `POST /shift/duplicate-shifts`), that one shift is synced
immediately. All of these funnel through `addEventForShift` → the single gate
`shouldSyncShift`.

## The sync filter = per-position user preference

Each shift has a *position* (tickets, chats, "Unavailable", …). Each user picks
which positions sync to their calendar, stored as `user.positionsToSync` =
`[{ positionId, sync }]` (mirrored into Clerk `publicMetadata.positionsToSync`).
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

## Working with sync

When changing sync behavior, account for **both** paths (bulk Sling + per-shift
agendo) and **both** position id-spaces — and remember bulk sync is
manual/admin-triggered, never scheduled.
