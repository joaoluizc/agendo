# Jira backlog (frontend, self-contained)

The UI for the Jira backlog triage board: a single-scroll list with a Notion-style detail
panel for editing, three views, a consolidated colour-coded **Status**, urgency
colour-coding, and the `# Connected tickets` Jira lookup. Talks to the `/jira-backlog`
backend module (`calendar-api-backend/src/jiraBacklog/`).

Everything lives in this folder; the feature touches the rest of the app in exactly two
places (the route and the nav link — see "Remove it").

## Behaviour

- **Auth/roles:** any signed-in agendo user can view. Editing (panel edits, add/delete
  rows, Jira fetches) is gated on `useUserSettings().type === "admin"`. The backend
  enforces the same with `adminOnly`, so the UI gate is convenience, not security.
- **Layout:** the page scrolls as a whole (no inner table scroll) and the table blends into
  the page. A sticky toolbar keeps the view tabs, search box, To-Review status filter, and
  Add row / Sync from Jira visible (and shows a compact title) once you scroll; the column
  header is sticky just beneath it. The main table is **display-only** and fits without a
  horizontal scrollbar.
- **Search:** a toolbar search box (in every view) filters by issue key, title, client,
  comment, squad, sprint, priority, status and bug type. It accepts a pasted **Jira link** —
  the query is reduced to the issue key (`normalizeQuery` in `constants.ts`) — so pasting a
  browse URL jumps straight to that ticket, the most common case. Available to all users.
- **Detail panel (`detail-panel.tsx`):** clicking a row opens a right-side panel where
  **every field is editable**. The urgency-composing fields (scope, plan tier, workaround,
  frustration, scope confidence, workaround quality, bug type) plus comment and the
  customer-signal fields live **only** in the panel — that's what keeps the table narrow.
  Delete and per-row ZD refresh live in the panel; the bulk refresh stays in the toolbar.
- **Status:** one field replaces the old `closed` / `checkedSquad` / `reviewSquad` booleans.
  Values: `Backlog`, `Review with Squad`, `Delayed`, `In a Sprint`, `Possible No-ETA`,
  `No-ETA`, `Fixed/Closed`, `Archived` (colour-coded; edited via the panel's Status dropdown).
- **Archival:** setting a bug to `Fixed/Closed` archives it — the server stores it as
  `Archived` with a 30-day expiry, then auto-deletes it. The panel shows a banner counting
  down to deletion; change the status to keep the bug. (The countdown lives on the server;
  see the backend README.)
- **Tasks & No-ETA workflow:** tasks (the panel's Tasks list + the `/app/tasks` kanban) are
  editable via a shared dialog (`task-edit-dialog.tsx`) — title, status, and an optional
  **deadline** picked with a shadcn calendar (`components/ui/calendar.tsx`; a red dot marks
  tasks whose deadline has been reached). Tasks can be linked to a bug (quick-add in the panel)
  or **standalone** (the kanban's "New task"). Setting a bug to `Possible No-ETA` prompts to
  create a 30-day re-evaluation task; opening that task shows a candidate card with **Evaluate
  now** → *Set as No-ETA* (bug → `No-ETA`, task → Done) or *Re-evaluate +30 days* (recursive).
  Date helpers live in `dates.ts`.
- **Task statuses (kanban columns):** managed from the Bug Tasks page's **Manage statuses**
  dialog (`task-status-manager-dialog.tsx`) — reorder columns (↑/↓), add/remove, and mark one
  as the **default** (★) that new tasks start in. The default is an explicit server-side flag,
  so reordering or deleting a column never silently changes where new tasks land.
- **Views:** `All` (insertion order) · `Open` (excludes `Fixed/Closed` + `Archived`) · `To Review`
  (the statuses chosen in the toolbar's status filter — defaults to `In a Sprint` +
  `Review with Squad`, but any combination can be selected to pull in bugs from other
  statuses; grouped into squad sections that are collapsed by default; within a group, by
  status (`In a Sprint` before `Review with Squad`), then Regressions first, then urgency
  desc, nulls last).
- **Colours (`badges.ts`):** Client = light purple when set; Priority = Minor blue / Major
  red / Critical louder red; Status = one hue each; Urgency = ≥80 red, 60–79 amber, <60 green.
- **Urgency:** auto-calculated; admins override it in the panel and clear it to revert to
  auto (the ✎ marker shows in the table cell too). `urgency.ts` mirrors the backend formula
  for instant feedback; the server is authoritative on save. Regressions bypass the formula
  (no score), so their urgency cell shows `REG` rather than a dash.
- **Jira:** when the backend reports `jiraConfigured`, the panel shows the ZD count + a ↻
  (count-only refresh), the toolbar **"Sync from Jira"** re-pulls every Jira-sourced field
  (title, client, priority, squad, sprint, ZD count) onto every row in the active view
  (overwriting local values; blank Jira fields never wipe), and a new row autofills once a
  valid Jira URL is entered. The triage status and urgency inputs are agendo-only and never
  touched. When not configured, counts show `—` and the controls are hidden.

## Files

```
JiraBacklog/
├── JiraBacklog.tsx     page: views, sticky/shrinking toolbar, panel state, optimistic updates, delete confirm
├── data-table.tsx      All/Open table — sticky header, click-to-open rows, no inner scroll
├── to-review-view.tsx  grouped collapsible squad view (click-to-open rows)
├── search-box.tsx      toolbar search input (accepts a pasted Jira link)
├── status-multi-select.tsx  dropdown checklist — which statuses the To-Review view shows
├── detail-panel.tsx    Notion-style side panel — every field editable
├── tasks-section.tsx   in-panel task list (quick-add + click-to-edit, overdue dot)
├── task-edit-dialog.tsx  shared task editor (title/status/deadline picker/delete + No-ETA card)
├── task-status-manager-dialog.tsx  Bug Tasks status manager (reorder / default / add / delete)
├── dates.ts            deadline helpers (isOverdue, formatDeadline, …) on date-fns
├── columns.tsx         TanStack column defs (display cells) built from COLUMN_DEFS
├── cells.tsx           display-only cell renderers + FieldCell dispatcher
├── badges.ts           colour palettes for status / priority / client pills
├── constants.ts        dropdown + STATUS options, main + To-Review columns, DETAIL_GROUPS, grouping/sort
├── urgency.ts          computeUrgency() mirror + colour bands (keep in sync with backend)
├── api.ts              /api/jira-backlog client
└── types.ts            JiraIssue, table meta, etc.
```

Built only from primitives agendo already has (shadcn/ui, `@tanstack/react-table`,
`lucide-react`, `sonner`) — no new npm dependencies.

## Remove it

1. Delete this folder (`calendar-api-frontend/src/pages/JiraBacklog/`).
2. In `src/main.tsx`, delete the `JiraBacklog` import and the
   `{ path: "/app/jira-backlog", element: <JiraBacklog /> }` route.
3. In `src/components/Header/Header.tsx`, delete the two "Jira Backlog" `NavLink`s (the
   desktop `NavigationMenuItem` and the mobile sheet link).
4. Remove the backend half — see
   `calendar-api-backend/src/jiraBacklog/README.md`.
