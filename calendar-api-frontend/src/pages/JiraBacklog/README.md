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
  the page. A sticky toolbar keeps the view tabs + Add row / Refresh ZD counts visible (and
  shows a compact title) once you scroll; the column header is sticky just beneath it. The
  main table is **display-only** and fits without a horizontal scrollbar.
- **Detail panel (`detail-panel.tsx`):** clicking a row opens a right-side panel where
  **every field is editable**. The urgency-composing fields (scope, plan tier, workaround,
  frustration, scope confidence, workaround quality, bug type) plus comment and the
  customer-signal fields live **only** in the panel — that's what keeps the table narrow.
  Delete and per-row ZD refresh live in the panel; the bulk refresh stays in the toolbar.
- **Status:** one field replaces the old `closed` / `checkedSquad` / `reviewSquad` booleans.
  Values: `Backlog`, `Review with Squad`, `Delayed`, `In a Sprint`, `Fixed/Closed`
  (colour-coded; edited via the panel's Status dropdown).
- **Views:** `All` (insertion order) · `Open` (`status !== "Fixed/Closed"`) · `To Review`
  (`status === "Review with Squad"`, grouped into collapsible squad sections; Regressions
  first, then urgency desc, nulls last).
- **Colours (`badges.ts`):** Client = light purple when set; Priority = Minor blue / Major
  red / Critical louder red; Status = one hue each; Urgency = ≥80 red, 60–79 amber, <60 green.
- **Urgency:** auto-calculated; admins override it in the panel and clear it to revert to
  auto (the ✎ marker shows in the table cell too). `urgency.ts` mirrors the backend formula
  for instant feedback; the server is authoritative on save.
- **Jira:** when the backend reports `jiraConfigured`, the panel shows the ZD count + a ↻,
  the toolbar "Refresh ZD counts" re-fetches every row in the active view, and a new row's
  count auto-fetches once a valid Jira URL is entered. When not configured, counts show `—`
  and the controls are hidden.

## Files

```
JiraBacklog/
├── JiraBacklog.tsx     page: views, sticky/shrinking toolbar, panel state, optimistic updates, delete confirm
├── data-table.tsx      All/Open table — sticky header, click-to-open rows, no inner scroll
├── to-review-view.tsx  grouped collapsible squad view (click-to-open rows)
├── detail-panel.tsx    Notion-style side panel — every field editable
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
