# User preferences (manager-only)

_Managers' notes on how each agent likes to be scheduled: who can see them, where they show, and how they're kept away from everyone else._

_Last updated: 2026-09-24_

A preferences note is free-form rich text ("mornings only", "no Fridays after 3pm") that an
admin writes about an agent, so whoever builds shifts can glance at it while doing so.
**Only admins (`User.type === "admin"`) can read or write it — agents never see theirs.**

## Where it lives

- **Stored** on the Mongo `User` doc: `preferences` (HTML, `""` when none), plus
  `preferencesUpdatedAt` and `preferencesUpdatedBy` (the admin's Clerk id). Being on `User`,
  it is split by environment like the rest of the user doc (`dev-users` vs `users`), so a
  local backend never edits production agents' notes.
- **Edited** on **Settings → Users** (`/app/settings/users`, under `AdminRoute`). Settings is
  a layout route: `SettingsLayout` gives every settings page the same frame and sidebar
  (`SettingsNav` — **General**, today's long page, with its sections as `#hash` sub-items,
  then **Users**). General is planned to split into grouped pages (Your account, Team,
  Scheduling, Reports, Developer), each becoming a sidebar entry. The selected agent is
  `?user=<clerkId>`. The same
  page shows, read-only, which positions sync to that agent's Google Calendar, from the
  admin-only `GET /position/sync-rules` (see [calendar sync paths](agendo-sync-paths.md)).
- **Shown** in a hover card on the agent's name — the schedule grid's agent column, the
  create-shift dialog's agent picker and the edit-shift dialog's header — for admins, and
  only for an agent who has a note (a small note icon marks them). `PreferencesHoverCard`
  returns its trigger untouched otherwise.

## Keeping it admin-only

Two layers, both needed:

1. **`select: false` on the schema.** The field is left out of every query that doesn't ask
   for it with `.select("+preferences")`. Several paths load whole user docs —
   `gCalendarController` even logs one with `JSON.stringify(user)` — and none of them should
   carry an agent's notes. The one query that asks is `userService.findAllUsers`, which
   feeds only the roster.
2. **The response allowlists.** `/user/all` sends `preferences` in its admin shape only; the
   non-admin shape is an explicit five-field map (`userController.getAllUsers`). `/user/info`
   is an allowlist that never includes it.

**Adding a read of `preferences` anywhere else means adding the `+preferences` select there —
and making sure that response only reaches admins.**

The one write is `PUT /user/:clerkId/preferences` (`requireSession` + `adminOnly`), body
`{ preferences }`, a string of at most 20,000 characters. Markup with no text in it
(`<p></p>`) is stored as `""`. Last write wins: two managers editing the same agent at once
overwrite each other, which is fine for a short note.

## Rich text

- The editor is **Tiptap** (`@tiptap/react` + StarterKit), cut down to paragraphs, bold,
  italic, bullet and numbered lists, line breaks and undo. `"- "` or `"1. "` starts a list.
- It is **lazy-loaded** (`React.lazy` in `pages/Settings/Users/PreferencesCard.tsx`), so the
  ~125 kB-gzipped chunk only downloads on that page — the only code-splitting in the app. Keep
  Tiptap imports inside `PreferencesEditor.tsx`, or it lands back in the main bundle.
- Saved HTML is **rendered with interweave's `Markup`** (`PreferencesContent`), as Google
  event descriptions are, which drops tags and attributes outside its allowlist. Never render
  it with `dangerouslySetInnerHTML`.
- List styles come from `PREFERENCES_PROSE` (arbitrary variants — preflight strips bullets
  and there's no typography plugin), shared by the editor and the hover card.

## Gotchas

- **`ADMIN_BYPASS=1` doesn't show notes locally.** `/user/all` decides its shape with
  `resolveUser`, not the bypass, so testing needs a real `type: "admin"` in `dev-users`.
- **A save is mirrored into `allUsers`** (`setAllUsers`) rather than refetched, so the
  schedule's hover cards update at once. Another manager's edits appear after a reload.
- **The hover card portals.** `HoverCardContent` now portals (to body, or into the enclosing
  dialog via `useDialogContentElement`), because in place it was clipped by the grid's sticky,
  `overflow-clip` agent column.
