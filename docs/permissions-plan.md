# Per-user area permissions: plan

**Status:** approved design, 2026-10-06. All decisions are answered (§4). The REST token-type fix (Appendix C) shipped in joaoluizc/agendo#44 (merged 2026-10-07). **Phase 1** (shadow foundation) is joaoluizc/agendo#45. **Phase 2** (enforce + admin write API) is joaoluizc/agendo#46. **Phase 4** (frontend + access editor + self views) is implemented on `feat/permissions-frontend`. João chose (2026-10-07) not to wait out the full shadow window: phase 1's mismatch logs run while phase 2 is reviewed. See [knowledge/permissions.md](knowledge/permissions.md) for how it works.

**Basis:** origin/main at `cc96223`, plus the untracked bug-triage work in the main working copy.

**How this plan was made:** five code inventories (every backend route, every frontend gate, the MCP server, the user data model, the areas), two external research passes (hub MCP servers and RBAC patterns), and three competing designs. This document starts from the "smallest correct change" design. It adds the strongest ideas from the "platform" design and the "least privilege" design.

---

## 1. TL;DR

- **Model.** Admins grant each user one level per area. The levels are stored as names on `User.permissions` in Mongo.

  | Area | Levels |
  |---|---|
  | `scheduling` | `none < view < edit` |
  | `bugs` | `none < view < edit` |
  | `reports` | `none < self < edit` |
  | `performance` | `none < edit` |

  Reports and performance are **separate areas with separate headings**. Agents never see the performance score. Their own reports are a different screen.
- **Admin.** `User.type === "admin"` stays the single superuser flag, and only one function reads it. Admins get the top level of every area, including future ones, plus a short list of admin-only actions.
- **No new dependencies.** No library, no roles or groups, no Clerk metadata, no OAuth scopes. One registry in code drives REST, MCP, `/user/info` and the admin editor.
- **Every route declares exactly one requirement.** A router-stack test fails the build when a route has none.
  - Identity comes from a **session token only**. This closes a real hole where MCP OAuth tokens were accepted on plain REST routes. That part is **already fixed** on `fix/rest-session-tokens-only` (Appendix C).
  - Every request also needs a Mongo user, resolved once per request.
- **The MCP never needs an uninstall, reinstall or re-login.** Permissions are read from Mongo on every MCP request, and the OAuth scopes only carry identity.
  - A revoke takes effect on the next call.
  - A grant shows up once the client fetches its tool list again: quit and reopen Claude Desktop, or press Refresh in claude.ai.
- **Today's access is kept on deploy day.** A backfill script, plus a shadow-mode release that logs every disagreement with today's gates before anything is enforced. The deliberate changes are listed in §10.2: admins gain Performance, agents gain their own reports, and two security fixes.
- **Five PRs:**
  1. Foundation, in shadow mode.
  2. Enforcement plus the admin write API.
  3. MCP.
  4. Frontend, the admin editor and the "self" views.
  5. Bug triage moved onto main.

---

## 2. Do users need to reinstall the MCP when they get more access?

**No.** Agendo already works the way Atlassian's MCP does.

### 2.1 How hub products handle it

| Hub | Who decides access | Tools you can't use | When your access changes |
|---|---|---|---|
| **Atlassian Rovo MCP** | Server checks your live Jira/Confluence permissions on every call | Admin-blocked tool groups are listed and then refused. v2 uses a few discover/execute meta-tools | Admin changes "take effect immediately, no restart or reconnection". Re-consent is only needed if the app's OAuth scopes change |
| **GitHub remote MCP** | GitHub's API, per call | OAuth: everything listed, and a missing scope triggers a 403 step-up challenge. Classic PAT: tools hidden when the server starts | PAT: restart the server. OAuth: approve the extra scope (a re-auth, not a reinstall) |
| **Notion, Asana** | Your live product permissions | Static list | Nothing to do (no granular scopes) |
| **Cloudflare, Stripe, Google** | The API, with scopes chosen at consent | Static or meta-tools | Re-authorize to widen the scopes |
| **Linear** | Your token | A separate `/mcp/readonly` endpoint hides write tools | Re-authenticate |

**Where the industry has landed:**
- OAuth proves who you are. Authorization runs on every call against your current permissions.
- Scopes, if used at all, are coarse ceilings. Widening them means re-consent, which is a re-login, not a reinstall.
- **Hiding a tool is never the security control.** Every call is re-checked.
- The latest MCP spec explicitly allows `tools/list` to vary per user's authorization.

Reinstalling is never the mechanism anywhere. The only thing that varies is how long a client caches its tool list.

### 2.2 Why agendo needs no reinstall

- **Fresh check on every request.** `mcpAuth` resolves the Mongo user on every HTTP request, with no cache (`mcp/lib/mcpAuth.js`, `services/authz.js`).
- **Fresh tool list on every request.** `mcpHandler` builds a new `McpServer` per request (stateless transport), and which tools get registered depends on that caller (`mcp/server.js`, `mcp/lib/registerTool.js`).
- **Scopes carry no permissions.** They are `openid profile email offline_access` (`mcp/lib/clerkOauth.js`). The plan keeps it that way, and PR 3 adds a test that fails if a permission scope is ever added.

**Revoking** access applies on the server at the next call, in every client.

**Granting** access applies on the server immediately. The user only *sees* the new tools once their client asks for the tool list again:

| Client | What the user does to see newly granted tools | Confidence |
|---|---|---|
| **Claude Desktop + mcp-remote** (the setup in `docs/mcp-team-setup.md`) | Fully quit Desktop (tray → Quit; closing the window isn't enough) and reopen it. mcp-remote doesn't cache the tool list and reuses the stored token, so there's no login | High for the bridge. Whether Desktop re-lists mid-session is unverified; assume not |
| **claude.ai connector** | Anthropic caches the list for about 1 hour (per Anthropic staff). Field reports show 15–24 hours. There is a "Refresh tools list" button. Removing and re-adding the connector reportedly doesn't help. `list_changed` notifications are not supported (anthropics/claude-ai-mcp#45) | Medium |
| **Claude Code** | Each new session fetches fresh, and `/mcp` → reconnect works mid-session. Use the mcp-remote config, because Clerk only admits the registered CIMD client | High |
| **ChatGPT** (not set up) | Press Refresh on the connector. In workspaces, ChatGPT's own admin must also approve new actions | Medium |

### 2.3 Tool-list strategy

**Keep hiding tools by permission, re-check on every call, and refuse stale calls clearly.**

- **Hide what the caller can't use** (today's model; only the predicate changes).
  - A `scheduling:view` user's model never sees `delete_shift`. That keeps the context small as bug and report tools arrive, and keeps destructive tools out of reach of prompt injection.
  - With about 18 users, grants are rare, so "restart your Claude client once" is a small cost. The admin editor shows that hint after every save.
- **Re-check on every `tools/call`.** This is the actual security control. The `registerTool` wrapper already does it.
- **Friendly refusal for stale lists.**
  - Today a revoked tool returns the SDK's bare `Tool X not found`.
  - In `mcpHandler`: if the incoming `tools/call` names a catalog tool this caller can't use, register a stub for that name on this one request only. The stub returns `isError` with the text: *"`create_shift` needs Scheduling: edit. You have Scheduling: view. Ask an agendo admin. If access was just granted, restart your client so its tool list refreshes."*
  - The stub never appears in `tools/list`, because listing is a separate request.
- **Stop falsely advertising `listChanged: true`.** The SDK merges `listChanged: true` in automatically, but a stateless server can't push notifications. Before `connect`, set `server.server.registerCapabilities({ tools: { listChanged: false } })`.
- **Not used:**
  - **Step-up scopes** (403 `insufficient_scope`). They would put permissions into tokens. Claude Code turns them into a manual `/mcp` re-auth, and hosted Claude reportedly loops on them.
  - **Pushing `list_changed`.** It needs stateful sessions plus Redis pub/sub, claude.ai ignores it, and the newest spec drops sessions.
- **Alternative to keep in mind (decision 9):** list every tool in an area as soon as the user has any level there, and refuse at call time. A view→edit upgrade then needs no refresh, but viewers see the write tools. Switching is a one-line change in `registerTool`'s visibility predicate.
- **Later:** when the SDK supports the new spec's caching fields, return `cacheScope: "private"` with a short `ttlMs`. Above about 40 tools, consider Atlassian-style discover/execute meta-tools for a busy area.

---

## 3. The permission model

### 3.1 Matrix

| Area | Level | Web | MCP |
|---|---|---|---|
| **scheduling** | `view` | Published team schedule (agendo and Sling grids); read-only shift popover; skills | `get_agent_schedule`, `get_coverage_at`, `find_shifts` (published only), `summarize_shifts` (everyone's hour totals: an allowed transparency measure, decision 7) |
| | `edit` | Above, plus: drafts; create, edit, delete and duplicate shifts (including `replace`); publish and unpublish; coverage rows and **coverage targets**; other agents' sync rules; **reading** manager notes; per-agent legacy Sling sync | Above, plus `find_shifts` drafts, `find_coverage_gaps`, `list_draft_shifts`, `create_shift`, `update_shift`, `delete_shift` (drafts only, unchanged) |
| **bugs** | `view` | Jira backlog and Tasks boards, read-only (existing read-only UI branches come alive); bug-triage tickets, findings and streams. MRR totals and account details (`mrrAccounts`) visible (decision 8) | Future bug tools |
| | `edit` | Above, plus: create and edit issues and tasks, No-ETA workflow, refresh-zd/mrr/autofill, Sync from Jira, delete issue, **run the triage agent** | Future |
| **reports** | `self` | Your own row of the Reports page: total shift hours per group (Tickets, Chats, Other) for the chosen range. No ratio, no score (decision 4) | Future report tools: own row only |
| | `edit` | Everyone's rows (and refresh), plus **Report groups** config | Future report tools: everyone |
| **performance** | `edit` | The whole Performance screen, as today: score/leaderboard, all tabs, new quarter, agent setup, imports, lock/unlock, agents, aliases, methodology switch. **No self level: agents never see the score** | Future |

**How the levels behave:**
- Ordinal: each level includes everything below it.
- Stored as **names**, never numbers, so a level can be inserted later without changing what stored values mean. Examples: a read-only `all` between `self` and `edit` for team leads, or a `draft` level below `edit` in scheduling.

### 3.2 What "admin" means

- `User.type === "admin"` is read in exactly one place: `levelOf()` returns the top level of every area for an admin (Django's `is_superuser` pattern). No other code checks `isAdmin` for area access.
- Admins also do the **admin-only actions**, which no level ever grants:
  1. **User and permission management.** The access editor, other users' timezone and manager notes, and the full roster shape (emails, type, permissions).
  2. **Org config with cross-area effects.**
     - Positions, including `enforceSync`. Report groups match positions by name.
     - Locations and team membership. These drive the schedule filter, report grouping and Performance regions.
     - Skills.
  3. **Bug-tracking taxonomy and money config.** Bug statuses, task statuses and MRR overrides (decision 6).
  4. **Everyone's personal Google Calendar events** (`/gcalendar/all-events*`).
  5. **Bulk legacy Sling sync** (`POST /gcalendar/days-shifts-to-gcal`). This is the path behind the past "shifts wiped" bug.
  6. **Raw Sling roster** (`GET /sling/users`, no frontend caller).
  7. **API token minting** (the Settings card). It is still only a UI gate.
  8. **Future** bug-triage approvals and Jira writes.
- A demoted admin falls back to their stored `permissions`. The backfill sets these to normal-user values, and the editor forces an explicit choice when demoting.

### 3.3 Baseline: every signed-in user with a Mongo account

| What | Routes and tools |
|---|---|
| Own profile and effective permissions | `GET /user/info` |
| Own timezone | `PUT /user/me/timezone` |
| Own calendar sync | `GET/PUT /position/sync`, `GET/PUT /position/default-color`, `POST /gcalendar/user-day-shifts-to-gcal` |
| Lookups the app shell loads | `GET /position/all`, `GET /location/all`, `GET /location/:id`, minimal `GET /user/all` (id, names, avatar), new `GET /user/permission-registry` |
| Health | `/auth-check`, `/version` |
| MCP | `whoami`, `get_my_schedule` |

A Clerk identity with no Mongo document gets a 403 `no_agendo_account`. Today it can read the schedule and roster, because the sign-in gate checks Clerk only, not Mongo.

### 3.4 Adding areas later

1. **Add one registry entry:** `key, label, levels (starting with "none"), describe, defaultForNewUsers`. The Mongoose subschema is generated from the registry. The editor renders from `GET /user/permission-registry`. The frontend uses `pages.ts`.
2. **Tag routes** with `requirePermission("<area>:<level>")`. The route test forces this.
3. **Add MCP tools** as a new module, e.g. `mcp/tools/bugs.js`, with `requires: "<area>:<level>"` on each tool. One line in `createMcpServer`.
4. **What existing users get:**
   - Non-admins get `none`, because a missing key resolves to `none`.
   - Admins get the new area automatically.
   - **Exception:** if the new area is *carved out* of one users can already reach (Tasks out of `bugs`, once tasks have owners), the same PR runs a dry-run-by-default `grantAccess.js --area X --level Y --where <filter>` so nobody loses access on deploy day.
5. **The first non-nested power** (one that doesn't fit the ladder, such as a separate `publish` or `run triage` toggle) can be added as an `extras` list in the registry and on the user, with no migration of existing values. Not needed in v1.

---

## 4. Decisions (all answered by João, 2026-10-06)

| # | Decision | Answer |
|---|---|---|
| 1 | Default access for new users (auto-provisioned by the Clerk webhook) | `scheduling: view` and `reports: self`; everything else `none` |
| 2 | Reports and performance | **Separate areas with separate headings:** `reports: none / self / edit` and `performance: none / edit` |
| 3 | Admins gain Performance | **Yes.** The `PERFORMANCE_ACCESS_EMAILS` allowlist was only a stopgap until permissions existed. The backfill folds it into `performance: edit`, then the env var is deleted |
| 4 | What agents see | **Agents never see the performance score.** The score screen requires `performance: edit` (or admin), and there is no self level. **By default every user sees their own report** (`reports: self`): only their total shift hours per group (Tickets, Chats, Other) for the chosen range, exactly what today's Reports page computes. No ratio and no score. A tickets/chats-per-hour ratio on Reports is a future feature, and it will go through the same `reports` row filter when it's built |
| 5 | Does scheduling `edit` include publishing and coverage targets? | **Yes to both.** Positions, locations, skills and the bulk sync stay admin-only |
| 6 | Bug-tracking config (bug and task statuses, MRR overrides) | **Admin-only in v1.** Running the triage agent is under `bugs: edit`. Future Jira writes and approvals stay admin-only. Moving config under `bugs: edit` later is a one-line route change |
| 7 | MCP `summarize_shifts` / `find_shifts format=summary` show everyone's hour totals | **Leave them open at `scheduling: view`, unchanged.** Seeing everyone's shifts is encouraged (for example, "who's on chats with me right now"). Measuring other people's hours or shifts is an allowed transparency measure. Reports access adds friction, and monitoring hours is the leads' and management's job, but anyone who wants the number can get it |
| 8 | Sensitive data | **Everyone's Google Calendar events: admin-only.** `mrrAccounts` (customer emails and business names) **stay visible to anyone with `bugs: view`**, since everyone who can sign in is inside the org. Manager notes are **readable with `scheduling: edit`** and writable by admins only. **Emails are not hidden anywhere new:** the MCP keeps showing colleagues' emails as it does today |
| 9 | MCP tool list | **Hide** tools the caller can't use (§2.3) |
| 10 | Admin toggle in the editor | **Yes**, with guardrails: you can't change your own access, the last admin can't be demoted, and aim for at least 2 admins |

**What decision 7 means for "self".** `reports: self` is about **friction and focus, not secrecy**. Your own row is the default view, and everyone's rows are the leads' tool. It is still filtered on the server, because that costs no more than filtering in the UI. Nothing has to be hidden from other surfaces to keep it consistent.

**Deploy-day grant.** Agents can't see Reports at all today. The backfill gives every non-admin `reports: self`, so this is an intended new grant (§10.2).

---

## 5. Data model and registry

### 5.1 Registry: `calendar-api-backend/src/permissions/registry.js` (new)

```js
export const REGISTRY_VERSION = 1;
export const PERMISSION_AREAS = Object.freeze({
  scheduling: {
    label: "Scheduling", levels: ["none", "view", "edit"], defaultForNewUsers: "view",
    describe: {
      none: "No schedule pages (own shifts still sync to your calendar)",
      view: "See the published team schedule",
      edit: "Build the schedule: drafts, edits, publish, coverage targets, read manager notes",
    },
  },
  bugs: {
    label: "Bug tracking", levels: ["none", "view", "edit"], defaultForNewUsers: "none",
    describe: {
      none: "No access",
      view: "Read the backlog, tasks and triage",
      edit: "Edit bugs and tasks, run triage",
    },
  },
  reports: {
    label: "Reports", levels: ["none", "self", "edit"],
    selfLevel: "self", defaultForNewUsers: "self",            // see §4, "Default for reports"
    describe: {
      none: "No access",
      self: "Your own report",
      edit: "Everyone's reports; edit report groups (also affects Performance hours)",
    },
  },
  performance: {
    label: "Performance", levels: ["none", "edit"], defaultForNewUsers: "none",
    describe: {
      none: "No access (agents never see the score)",
      edit: "The Performance screen: scores, quarters, imports, lock, methodology",
    },
  },
});
```

`GET /user/permission-registry` serves this as public JSON:

```
{ version, areas: [{ key, label, levels: [{ key, description }], defaultForNewUsers }] }
```

### 5.2 `User` schema (`src/models/UserModel.js`)

```js
permissions:          { type: PermissionsSchema, default: () => ({}) }, // generated: each area {type:String, enum:levels, default:"none"}, _id:false
permissionsUpdatedAt: { type: Date,   default: null },
permissionsUpdatedBy: { type: String, default: null },                  // clerkId, or "migration"
```

- **Fail-closed by default.** The schema default is `none` for every area, so a legacy document that was never backfilled hydrates as "no access".
- **New users get the registry defaults explicitly** in `userService.createUser` / `provisionClerkUser`.
- **Not `select: false`.** Every authorization decision reads it. It is still kept out of the non-admin roster shapes.
- **Writes use `doc.save()` only,** never `findOneAndUpdate` without validators.
- **Also in PR 1:** add an index on `clerkId`, since it is the per-request lookup key.

### 5.3 Audit trail: `src/models/PermissionAuditModel.js` (new, append-only)

- **Collections:** `permission-audits` in production, `dev-permission-audits` in development. This is the same env split as users.
- **Document shape:**

  ```js
  { at, via: "web" | "migration" | "script", requestId,
    actorClerkId, targetClerkId, targetUserId,
    before: { type, permissions }, after: { type, permissions } }
  ```

- **No update or delete routes.**
- **403s** are logged as `console.warn` lines carrying the requestId (the existing convention), not stored in Mongo.

### 5.4 Evaluator: `src/permissions/evaluate.js` (pure; no Mongo)

```js
export function levelOf(caller, area) {
  const def = PERMISSION_AREAS[area];
  if (!def) throw new Error(`Unknown permission area "${area}"`);   // programmer bug
  if (!caller?.mongoUser) return "none";
  if (caller.isAdmin) return def.levels.at(-1);                      // the ONLY admin short-circuit
  const stored = caller.mongoUser.permissions?.[area];
  return def.levels.includes(stored) ? stored : "none";              // fail closed
}
export const can = (caller, area, min) => rank(area, levelOf(caller, area)) >= rank(area, min); // rank throws on an unknown level
export const meets = (caller, req) => /* "public" | "signedIn" | "admin" | "<area>:<level>" */;
export const scopeFor = (caller, area) => {           // null = deny, "all", or { clerkId }
  const lvl = levelOf(caller, area);
  if (lvl === "none") return null;
  return lvl === PERMISSION_AREAS[area].selfLevel ? { clerkId: caller.clerkId } : "all";
};
export const effectivePermissions = (caller) => /* { scheduling: "edit", ... } */;
export const defaultPermissions = () => /* registry defaults */;
export const validatePermissionsPatch = (patch) => /* rejects unknown areas and levels */;
export const canGrant = (actor, target, change) => /* v1: actor.isAdmin && actor !== target && last-admin rule; the one place delegation would go later */;
```

---

## 6. Backend enforcement

### 6.1 One caller per request: `services/authz.js`

- **`resolveUser(clerkId)` is unchanged** and remains the only reader of `type`.
- **`getCaller(req)` is new**, memoized on `req.caller`:
  - reads `getAuth(req, { acceptsToken: "session_token" })`, which **pins the token type**;
  - calls `resolveUser` once;
  - returns one of: `null` (no session), `{ noAccount: true }` (no Mongo user), or `{ clerkId, mongoUser, isAdmin, permissions }`.
- **`ADMIN_BYPASS=1`** sets `isAdmin` here and only here, which fixes today's inconsistent bypass. MCP still ignores the bypass.
- **`callerFromUser(mongoUser)`** is new and builds the same shape for MCP, scripts and tests.
- **`isAdminRequest`** is deleted in PR 2.
- **Why session tokens only:**
  - The browser cookie and the Settings API token are both session tokens, so both keep working. The API token is a Clerk JWT-template token; verify this in the shadow logs.
  - MCP OAuth access tokens are refused on REST. **Already fixed ahead of this plan** by the `requireSession` gate (Appendix C); `getCaller` keeps the same `acceptsToken: "session_token"` pin.

### 6.2 Middleware: `src/middlewares/requirePermission.js` (new)

- **The markers:**
  - `requirePermission(area, level)` validates `area` and `level` against the registry when the module loads.
  - `requireAdmin`, `signedIn`, `publicRoute` and `webhookRoute` cover the other cases. The last two are no-op markers so the route test can tell "public on purpose" from "forgotten".
  - Each sets `fn.requirement` for the route test.
- **Shared behavior:**
  - One shared guard, wrapped in try/catch, because Express 4 drops async rejections.
  - JSON errors, never a redirect:

    | Case | Response |
    |---|---|
    | No session | `401 {error:"Unauthorized"}` |
    | No Mongo account | `403 {error:"Forbidden", reason:"no_agendo_account"}` |
    | Level too low | `403 {error:"Forbidden", required:"bugs:edit", have:"view"}`, plus a warn line with requestId, method, URL, clerkId |
    | Internal failure | `500 {error:"Could not verify permissions"}` |

  - The `error` strings match today's bodies, so the existing frontend 403 handling keeps working.
- **Shadow mode (PR 1 only):**
  - The guard decides, always calls `next()`, and once the response is sent compares its verdict with the status today's gates produced. It logs **only disagreements**: `[perm] shadow mismatch: … would DENY …, legacy answered 200` or `… would ALLOW, legacy answered 403`. Today's gates stay mounted after it and keep enforcing.
  - Non-session tokens are already refused (and logged as `requireSession refused a …`) by the joaoluizc/agendo#44 fix.
  - PR 2 removes the shadow branch together with the legacy gates. There is no long-lived env flag, because a forgotten shadow flag would mean "wide open".
- **Mounting (PR 2):** `app.use(path, requireSession, router)` becomes `app.use(path, router)`. Each route authenticates through its own requirement marker. That fixes `/user` and `/gcalendar`, which mix public, webhook, self and admin routes.

### 6.3 What each old check becomes

| Today | Replacement |
|---|---|
| `middlewares/adminOnly.js` (54 mounts, plus 8 in bug triage) | `requirePermission(...)` or `requireAdmin`. File deleted |
| `authz.isAdminRequest` → `shiftController.shouldReturnDrafts` | `can(req.caller, "scheduling", "edit")` |
| `userController.getAllUsers` inline `resolveUser` | `rosterShapeFor(req.caller)` (§6.5) |
| `performance/lib/access.js` (env allowlist; `canManage === canView`) | `requirePermission("performance", "edit")`. File deleted. `GET /performance/access` answers `can(caller, "performance", "edit")` until PR 4 deletes it |
| `userController.getMyProfile` | Uses `req.caller`. Adds `isAdmin` and `permissions: effectivePermissions(caller)`, and keeps `type` for old clients |
| MCP `LEVELS` / `caller.isAdmin` / `find.js:192` / `identity.js` | `requires` / `caller.can` (§9) |

### 6.4 Route map

Each router gets a default requirement, and every exception is listed. Together they cover all 110 routes on main plus the 8 bug-triage routes.

| Router | Default | Exceptions |
|---|---|---|
| Inline in `app.js` (move to `routers/metaRouter.js` so it can be tested) | — | `GET /` → public. `/auth-check`, `/version` → signedIn |
| Swagger `/api-docs` | public (an `app.use`, not a route — outside the route test) | Follow-up: admin-only or off in production |
| `mcpRouter.js` | — | 3 × `/.well-known/*` and `/mcp-client.json` → public. `ALL /mcp` → `mcpAuth` (tagged `requirement="mcp"`). Tool requirements in §9 |
| `/gcalendar` (no mount-level auth) | per route | `GET /` → public. `GET /calendars`, `GET /events` → **delete** (broken; they hang). `GET /all-events`, `/all-events-excluding-platform`, `POST /days-shifts-to-gcal` → admin. `POST /user-day-shifts-to-gcal` → signedIn. `POST /admin-sync-user-day-shifts` → `scheduling:edit` |
| `/sling` | `scheduling:view` | `GET /users` → admin (raw roster, no caller). `GET /positions` → **delete** (broken) |
| `/position` | signedIn | `GET /` → **delete** (broken). `GET /sync-rules` → `scheduling:edit`. `POST /new`, `PUT /:positionId`, `DELETE /:positionId` → admin |
| `/coverage-meter` | `scheduling:edit` | — |
| `/user` | signedIn | `POST /clerk/new` → webhookRoute (svix). `PUT /:clerkId/timezone`, `PUT /:clerkId/preferences` → admin. **New:** `GET /permission-registry` → signedIn; `PUT /:clerkId/permissions` → admin. `GET /all` → signedIn, shaped |
| `/shift` | `scheduling:edit` | `GET /range` → view (drafts only with edit). `GET /?shiftId` → view, **404 for a draft without edit** (fixes the draft leak). `GET /range/with-sling` → view (deletion is a follow-up) |
| `/location` | admin | `GET /all`, `GET /:id` → signedIn |
| `/skills` | admin | `GET /`, `GET /:skillId` → `scheduling:view` |
| `/dns`, `/discovai` | public (tagged `publicRoute`) | **Kept public on purpose:** both have consumers outside agendo (João, 2026-10-07) |
| `/jira-backlog` (27) | `GET` → `bugs:view`, other methods → `bugs:edit` | `GET`/`POST`/`DELETE /mrr-overrides`, `POST`/`DELETE /bug-statuses`, task-status CRUD and reorder → **admin** (decision 6). `GET /issues` returned unchanged to `bugs:view` (decision 8) |
| `/reports` (3) | `reports:edit` | `GET /hours` → `reports:self`, scoped |
| `/performance` (19) | `performance:edit`, reads included | `GET /access` → signedIn (temporary, deleted in PR 4). No self routes: agents never see the score |
| `/bug-triage` (8, PR 5) | `GET` and SSE → `bugs:view` | `POST /agent1/run` → `bugs:edit` |

**Re-check during PR 2:** `setMyTimezone` writes only `timezone` (no mass assignment).

### 6.5 Scoping and shaping

These are small pure helpers on the server, with unit tests.

- **`rosterShapeFor(caller)`:**
  - admin: full shape plus `permissions*`;
  - `scheduling:edit`: full shape minus `type` and `permissions*`, because editors need email, slingId and manager notes;
  - everyone else: today's five fields.
- **`GET /reports/hours`:** keep the team-wide Redis cache. When `scopeFor` returns `{clerkId}`:
  - filter to `row.key === clerkId` after reading the cache;
  - drop team totals;
  - ignore `refresh`, so self users can't force the expensive recompute.

  Build the filter from the caller, never from a client-supplied id. Per decision 7 this is friction rather than secrecy, but it is just as cheap to do properly. When the tickets/chats-per-hour ratio is added to Reports later, the new data goes through the same row filter.

### 6.6 Admin write API: `PUT /user/:clerkId/permissions` (admin)

- **Body:** `{ type?: "admin"|"normal", permissions?: { [area]: level } }`. Any other key → 400.
- **Validation:**
  - Run `validatePermissionsPatch`. An unknown area or level (e.g. `performance: "self"`) → 400 naming the field.
  - Changing yourself → 403 "You can't change your own access". This rules out both self-escalation and self-demotion.
  - Demoting the last admin → 409.
  - Two admins demoting each other at the same instant is accepted at this scale. Recovery is the same manual Mongo edit used today.
- **Write:** `doc.save()`, then stamp `permissionsUpdatedAt/By`, then insert an audit record with `via: "web"`.
- **Response:** the target's admin roster entry.

---

## 7. Frontend

- **`GET /user/info`** adds `isAdmin` and `permissions` (effective values). The frontend never derives access from `type`.
- **Provider (`providers/user-settings-provider.tsx`):**
  - Fetches `/api/user/permission-registry` in the sign-in effect.
  - Exposes `isAdmin`, `permissions`, `registry`, `can(area, level)` and `refreshUserInfo()`.
  - Re-fetches `/user/info` when the tab becomes visible, if the last fetch is older than 60 s. A grant then lands without a reload; today nothing refetches.
  - A failed load still means "nothing".
  - Wraps `value` in `useMemo`.
- **New `src/permissions/`:**
  - `useCan.ts`.
  - `RequirePermission.tsx`: a generalized `AdminRoute`. It waits for `userInfoLoaded` and renders a "You don't have access to Bug tracking — ask an agendo admin" screen instead of bouncing to `/`.
  - `pages.ts`: one `{to, label, requires}` table read by `main.tsx` **and** both Header menus. It replaces three hand-copied nav definitions and fixes the mobile Sling link that shows when signed out.
  - `AdminRoute` stays (reading `isAdmin`) for Settings › Users.
- **Routes:**

  | Requirement | Routes |
  |---|---|
  | `scheduling:view` | `/app/schedule`, `/app/sling-schedule` |
  | `bugs:view` | `/app/jira-backlog`, `/app/tasks`, `/app/bug-triage` |
  | `reports:self` | `/app/reports` |
  | `performance:edit` | `/app/performance` |
  | admin | `/app/settings/users` |

- **Per page** (full list in Appendix B):
  - **Schedule:** `ScheduleCalendar.tsx:219` `isAdmin` → `canEdit = useCan("scheduling","edit")`. The ~12 components that check on their own switch to the hook. The Google Calendar overlay → `isAdmin`.
  - **Bug Tracker and Tasks:** `canEdit` → `useCan("bugs","edit")`, which brings the existing read-only branches to life. The "Manage statuses" and "MRR overrides" buttons → `isAdmin`.
  - **Settings:** split `Settings.tsx:94` per card:
    - Locations, Positions, API token → admin;
    - Coverage targets → `scheduling:edit`;
    - Report groups → `reports:edit`.

    `SettingsNav` changes `adminOnly` to `requires`.
  - **Reports:** below `edit`, title it "Your report", show the single server-filtered row, and hide the copy-layout and team controls. Header nav shows "Reports" to everyone with `reports:self`.
  - **Performance:** delete `access.ts` and `usePerformanceAccess`. The route and nav link need `performance:edit`, and there is no reduced view.
- **"View as" preview:** the dev-only `viewAsAgent` boolean becomes `previewPermissions`.
  - One select per area, stored in localStorage.
  - Labelled "UI preview — the server still treats you as admin".
  - Still limited to dev builds with a real admin.

---

## 8. Admin UI: Permissions card on Settings › Users

- **Placement:** a fourth card, `PermissionsCard.tsx`, next to Preferences, Timezone and Synced positions. `usersApi.setPermissions()` goes in `api.ts`.
- **Admin switch** at the top:
  - When it's on, the area rows read "Full access (admin)", and the stored values show muted as "If admin is removed: …".
  - It is disabled for yourself and for the last admin. The server enforces both rules anyway.
- **One segmented control per area,** rendered from the registry: Scheduling, Bug tracking, Reports, Performance. Each level shows its description underneath.
- **Saving:**
  - Dirty tracking, plus the `useBlocker` unsaved-changes guard that `PreferencesCard` already uses.
  - After a save, an inline note: *"They'll see this on their next page load. Using agendo in Claude? Quit and reopen Claude Desktop, start a new Claude Code session, or press Refresh tools in claude.ai."*
  - A footer: "Last changed by ‹name› · ‹date›".
- **Roster list:** the bare "Admin" badge becomes chips, e.g. `Admin` or `Sched edit · Bugs view · Reports self`.
- **No presets in v1.** Four radio rows take seconds for 18 users. If presets come later, they should be copy-on-apply templates, never live roles.

---

## 9. MCP changes

- **`mcpAuth.js`:** build the caller with `callerFromUser(mongoUser)`, adding `permissions` and `can`. Scopes are unchanged.
- **`registerTool.js`:**
  - `level` becomes a required `requires: "signedIn" | "admin" | "<area>:<level>"`, validated against the registry. A missing or unknown value fails the server load.
  - Visibility uses `meets(caller, requires)`.
  - The wrapper re-checks on every call. Its message names the missing level.
- **`mcpRouter.js`:** the per-request stale-call stub (§2.3).
- **`server.js`:** `registerCapabilities({ tools: { listChanged: false } })` before `connect`. Update `INSTRUCTIONS` to say "your agendo permissions (see `whoami`)" instead of "admin vs normal".

**Tool mapping.** Existing access is preserved exactly (decision 7):

| Tool | Today | `requires` | Handler-level rules |
|---|---|---|---|
| `whoami` | user | `signedIn` | Lists access per area, admin yes/no, and the refresh hint |
| `get_my_schedule` | user | `signedIn` | Already self-only |
| `get_agent_schedule` | user | `scheduling:view` | Unchanged (emails in ambiguous-name replies stay, decision 8) |
| `get_coverage_at` | user | `scheduling:view` | — |
| `summarize_shifts` | user | `scheduling:view` | Unchanged: everyone's totals (decision 7) |
| `find_shifts` | user | `scheduling:view` | `status ≠ published` needs `scheduling:edit`. `format=summary` unchanged |
| `find_coverage_gaps` | admin | `scheduling:edit` | — |
| `list_draft_shifts`, `create_shift`, `update_shift`, `delete_shift` | admin | `scheduling:edit` | Drafts only, unchanged |

Resulting tool lists: admin and `scheduling:edit` get 11, `scheduling:view` gets 6, `scheduling:none` gets 2.

**Future areas' tools:**
- Put them in `mcp/tools/<area>.js` with `requires` on each tool.
- "Self" tools must call `scopeFor(caller, area)` and **ignore** any agent or user argument the client supplies (IDOR protection). `find_shifts`' `"me"` alias is the pattern to follow.

**Docs:** add a "When your access changes" section to `docs/mcp-team-setup.md` with the per-client steps from §2.2, rewrite its admin/normal wording, and update the stale `src/mcp/README.md` (it still describes Phase 0 and DCR).

---

## 10. Migration and rollout

### 10.1 Backfill: `src/database/scripts/backfillPermissions.js`

It follows the house pattern for scripts.

- **Modes:** dry run by default; `--apply` writes; `--collection=users|dev-users|both` (default `both`). Collections are read by literal name, so `NODE_ENV` doesn't matter.
- **Safety:** refuses if `users` has fewer than 5 documents, unless `--force`.
- **What it writes,** for each document without `permissions`:

  | Area | Value |
  |---|---|
  | `scheduling` | `view` |
  | `bugs` | `none` |
  | `reports` | `self` (§4, "Default for reports"; switch to `none` if that reading is wrong) |
  | `performance` | `edit` if the email is in `PERFORMANCE_ACCESS_EMAILS` (case-insensitive), otherwise `none` |

  Admins get the same normal-user values: their access comes from the flag, and a later demotion means "normal user, as today".
- **How it writes:** native `updateOne({_id, permissions: {$exists: false}}, {$set: …, permissionsUpdatedBy: "migration"})`, so it is idempotent. It also inserts a `via: "migration"` audit record.
- **Output:** counts only. Allowlist entries that matched no user are printed to the local console. Nothing about real users is committed, because the repo is public.

### 10.2 Effective access on deploy day

| Who | Before | After |
|---|---|---|
| Admin | Everything except Performance, unless on the allowlist | Everything (decision 3) |
| Normal user | Published schedule, minimal roster, 6 MCP tools | The same, **plus** their own row on the Reports page (`reports:self`) |
| Normal user on the allowlist | Above, plus all of Performance | Above, plus all of Performance (`performance:edit`) |
| MCP OAuth token used on REST | Passes routes behind the sign-in gate | 401 (already fixed by `requireSession`, Appendix C) |
| Clerk identity without a Mongo document | Can read the schedule and roster | 403 `no_agendo_account` (security fix; shadow logs show whether anyone is affected) |

### 10.3 Sequence

1. **Branch from origin/main.** Your local `feat/schedule-shift-dialogs` is far behind main and carries uncommitted work, including bug triage.
   - *Actual order (2026-10-07):* PR 1 and PR 2 were built back to back. Deploy PR 1, run the backfill, glance at the shadow logs, then deploy PR 2. **The backfill must run before PR 2 is live**, or every non-admin reads as `none`.
2. **Deploy PR 1** (backend, shadow mode).
3. **Run the backfill:** dry run → `--apply --collection=dev-users` → verify → `--apply --collection=users` **with `PERFORMANCE_ACCESS_EMAILS` set to Render's value** (it isn't in the local `.env`; the script refuses an empty list on `users` unless `--allow-empty-allowlist`). A dry run on 2026-10-07 found 18 production users (7 admins) and 35 in `dev-users`, none with permissions yet.
4. **Shadow window of at least 3 working days.** It should include a schedule-building session, a Performance session and an MCP session. Grep the Render logs for `[perm] shadow mismatch`.
   - **Exit criterion:** every mismatch is one of the intended changes in §10.2 (agents' own report, admins gaining Performance, `/sling/users` becoming admin-only, accounts with no agendo user).
5. **Tell the current Performance allowlist holders,** then **deploy PR 2** (enforce). Rollback is reverting PR 2: the legacy gates come back and the data is untouched.
6. **PR 3 (MCP)** can follow right after PR 2.
7. **Deploy PR 4 (frontend on Vercel) only after PR 2 is live on Render.** `/user/info` changes are additive, so the old frontend keeps working in between.
8. **After PR 4:** delete `GET /performance/access` and remove `PERFORMANCE_ACCESS_EMAILS` from Render.
9. **Acceptance greps** after PR 2 and PR 4. Backend: no `adminOnly|isAdminRequest|canViewPerformance|hasPerformanceAccess|LEVELS`. Frontend: no `type === "admin"`, `type !== "admin"`, `usePerformanceAccess`, `viewAsAgent`.

---

## 11. PR plan

| PR | Scope | Key files | Acceptance |
|---|---|---|---|
| **1. Foundation (shadow)** — *implemented* | Registry, evaluator, `getCaller`, requirement markers first on **every** route ahead of the existing gates, schema plus `clerkId` index, audit model, backfill script, `/user/info` permissions, `GET /user/permission-registry`, mount table in `src/routes.js`, meta router, `docs/knowledge/permissions.md` | new `src/permissions/{registry,evaluate,backfill}.js` (+ tests), `src/permissions/routeRequirements.test.js`, `src/middlewares/requirePermission.js` (+ test), `src/models/PermissionAuditModel.js`, `src/routes.js`, `src/routers/metaRouter.js`, `src/database/scripts/backfillPermissions.js`; edited `UserModel.js`, `authz.js`, `userService.js`, `userController.js`, `app.js`, `package.json` (test script), all router files | `npm test` green (56), including the route test (110 routes, exactly one marker each, first, matching §6.4 as data). Unauthenticated smoke test: every gated route a JSON 401, public routes unchanged, no mismatches. Backfill dry run prints the expected counts |
| **2. Enforce + admin write API** — *implemented* | Enforcing guard; remove mount-level `requireAuth`, `adminOnly` and the performance allowlist; draft fix; roster shaping; `/reports/hours` self scoping; `mrrAccounts` stripping; `PUT /user/:clerkId/permissions`; delete the 4 broken routes; fix stale comments and docs (`app.js`, `jiraBacklogRouter.js`, jiraBacklog README, `clerk-mongo-boundary.md`) | the above plus `shiftController.js`, `reportsController.js`, `performanceRouter.js`, `jiraBacklogController.js`; delete `adminOnly.js` and `performance/lib/access.js` | Middleware matrix tests green, including the `oauth_token` → 401 regression. Old-check grep empty. Manual checks M1–M6 |
| **3. MCP** | `requires`, `callerFromUser`, stale-call stub, `listChanged:false`, email hiding, `whoami`, instructions, team docs, scopes-unchanged test | `mcp/lib/{registerTool,mcpAuth}.js`, `mcp/{server,mcpRouter}.js`, `mcp/tools/*.js`, new `mcp/mcp.test.js`, `docs/mcp-team-setup.md`, `src/mcp/README.md` | In-memory matrix: tool lists of 11/11/6/2 per persona; `listChanged === false`; a viewer gets refused on drafts before any DB call; stale-call stub text. Real Claude Desktop check: grant → quit and reopen → new tools appear; revoke → friendly refusal |
| **4. Frontend + editor + self views** — *implemented* | Provider, `src/permissions/*`, routes and nav from `pages.ts`, every gate in Appendix B, PermissionsCard, Reports "Your report" view, Performance gated at `edit`, preview; delete `access.ts` and backend `/performance/access` | `providers/user-settings-provider.tsx`, `main.tsx`, `Header.tsx`, `routes/AdminRoute.tsx`, `pages/Settings/**`, schedule components, `pages/{JiraBacklog,Tasks,Reports,Performance}/**` | `tsc` and lint pass on touched files. Frontend grep empty. Preview walk-through per persona. A real grant shows up on the next tab focus without signing out |
| **5. Bug triage onto main** | Bring `src/bugTriage/**` and `pages/BugTriage/**` from the working copy onto a branch cut from main, adding one mount, one `pages.ts` entry and one route. **Do not** copy the old `main.tsx`, `app.js` or `Header.tsx` | `src/bugTriage/**`, `app.js`, `pages/BugTriage/**`, `main.tsx`, `permissions/pages.ts` | Route test green. `bugs:view` sees tickets and streams but no run buttons; `bugs:edit` can run. Check that the SSE streams carry the session cookie |

---

## 12. Testing

The repo uses `node:test`, with synthetic fixtures only, because the repo is public.

- **Evaluator unit tests:**
  - admin gets the top level of every area;
  - a missing, unknown or numeric stored value → `none`;
  - an unknown area or level throws;
  - ordering is respected;
  - `scopeFor` returns `self` → `{clerkId}`, `edit` → `"all"`, `none` → `null`;
  - `validatePermissionsPatch` rejects unknown areas and levels (e.g. `performance: "self"`);
  - registry integrity: every area starts with `none`, levels are unique, defaults are valid;
  - `canGrant` rules;
  - the shaping helpers: `rosterShapeFor` and the reports self filter.
- **Route test:**
  - Walk the real mount table (`src/routes.js`) plus `mountMcpRoutes` on a fresh `express()` app. Swagger is an `app.use`, not a route, so it sits outside the test.
  - Each route must have **exactly one** layer with `.requirement`.
  - Compare against an expected map that is §6.4 written as data, so any requirement change shows up in review.
  - Router imports do I/O (the Redis client's top-level `await connect()`, the Sling service's `init()`), so the test mocks those two modules; `npm test` runs with `--experimental-test-module-mocks`. Don't add `--test-force-exit`: on Windows it races closing HTTP handles and crashes libuv.
- **Middleware matrix:**
  - Mount `requirePermission` on a throwaway app.
  - Fake `req.auth` the way `@clerk/express` 1.7 does: a Proxy around a function, with `tokenType`.
  - Personas: admin, edit, view, none, no Mongo user, no session (expect 401 JSON, not 302), and `oauth_token` (expect 401).
- **MCP matrix:**
  - `InMemoryTransport.createLinkedPair()` with an SDK `Client` and `createMcpServer(persona)`.
  - Assert the exact tool lists, `listChanged`, the drafts refusal, the stale stub, and that `MCP_REQUIRED_SCOPES` equals the four identity scopes.
- **Manual checks** on dev-users:
  - **M1** — viewer: no edit affordances; a draft id returns 404.
  - **M2** — editor: create, publish and duplicate work; coverage rows and notes show; no calendar overlay; 403 on the Positions API.
  - **M3** — `bugs:view`: read-only backlog, `mrrAccounts` present. `bugs:edit` can mutate but has no status or MRR config.
  - **M4** — `reports:self`: a single row on Reports, with `refresh` ignored. Performance is not reachable: no nav link, the route shows "no access", and every `/performance/*` call returns 403.
  - **M5** — an admin who is not on the old allowlist can open Performance, and the Settings API token still works.
  - **M6** — editor guardrails (self-edit, last admin) work and audit rows are written.

---

## 13. Risks and pre-existing holes

Ids such as A1 refer to the anomaly list in the backend-routes inventory.

| Item | In scope? |
|---|---|
| MCP OAuth tokens accepted on REST; admin roster and drafts leak to an admin's MCP token (A1, A2) | **Done** on `fix/rest-session-tokens-only` (Appendix C) |
| Sign-in gate returned 302; async errors are dropped; mixed routers (A3, A17, A19) | 302 → JSON 401 **done** (`requireSession`); the rest **yes** |
| Admin checks inside controllers; repeated Mongo reads; inconsistent `ADMIN_BYPASS` (A4, A5, A18) | **Yes** |
| Performance allowlist vs admin; roles can only be changed in Mongo (A6, A7) | **Yes** (decisions 3, 10) |
| Draft leak via `GET /shift?shiftId`; raw Sling roster; customer MRR details; no self views (A9, A10, A21, A22) | **Yes** |
| MCP hour totals for everyone | **Not a hole.** It is an allowed transparency measure (decision 7) |
| Clerk identity without a Mongo user can read data (A15) | **Yes**; watch the shadow logs |
| Broken routes (A12) | **Yes:** delete 4. **Follow-up:** `/shift/range/with-sling`, `GET /gcalendar/`, the `/all-events` `?date` hang |
| Stale comments and docs (A14) | **Yes** (PR 2) |
| Public `/discovai` (spends credits), `/dns` (A8) | **Kept public on purpose** (external consumers); tagged `publicRoute` so the test documents them |
| Public Swagger `/api-docs` (A8) | Follow-up |
| Dead pages `/ada`, `/ada-stats`, `pages/Calendar`, `pages/Dashboard` (A13) | Follow-up |
| API token is likely mintable by any signed-in user; it carries the holder's permissions; no scope or revocation (A16) | Follow-up: real scoped API keys are a separate feature |
| `GET /jira-backlog/issues` hard-deletes archived rows on read, and view users now trigger it | Follow-up: move it to the scheduler |
| `createUser` doesn't relink `clerkId` for an existing email | Follow-up |
| claude.ai can serve a stale tool list for up to about 24 h | Accepted; documented in the editor hint and the team docs |
| Self views can come out empty (no Tickets/Chats time, unmatched alias) | UX copy |
| `edit` levels are broad (decision 5) | Accepted for v1; insert `draft` or extras later without migration |
| Frontend/backend deploy order | Backend first, every time |

---

## Appendix B: frontend gate → replacement

| Gate today | Replacement |
|---|---|
| `routes/AdminRoute.tsx` on `/app/jira-backlog`, `/app/tasks`, `/app/reports` | `RequirePermission` (`bugs:view`, `bugs:view`, `reports:self`); `/app/performance` gets `performance:edit` instead of its own allowlist check |
| `Header.tsx:205, 312` (admin link block), `:77` `usePerformanceAccess` | Links built from `pages.ts` with `can()` |
| `Header.tsx:340-360` view-as-agent toggle | `previewPermissions` selects |
| `ScheduleCalendar.tsx:219` (feeds `:220-221, 243, 603, 677, 772, 779`) | `useCan("scheduling","edit")` |
| `ScheduleCalendar.tsx:319, 590, 773`, `ScheduleToolbar.tsx:239` (Google Calendar overlay) | `isAdmin` |
| `ToggleBulkSelector:23`, `CreateShiftBtn:26`, `DuplicateShifts:20`, `EmptySlot:182`, `AgentRow:250`, `Shift.tsx:148/233/285/300/468/479/496/535/575` | `useCan("scheduling","edit")` |
| Manager notes: `AgentRow:125`, `CreateShiftDialog:886`, `EditShiftDialog:174`, `PreferencesHoverCard:43` | `useCan("scheduling","edit")` |
| `SyncWithGCalBtn:46` / `SyncUserGCalBtn:20`, `SlingSunsetBanner:20` | `isAdmin` / `useCan("scheduling","edit")` |
| `user-settings-provider.tsx:256` (coverage-meter fetch) | `can("scheduling","edit")` |
| `Settings.tsx:94`, `GenerateAPIToken.tsx:21`, `SettingsNav.tsx:42/50/62` | Per card: admin (API token, Locations, Positions, Users link); `scheduling:edit` (Coverage targets); `reports:edit` (Report groups) |
| `JiraBacklog.tsx:90` `canEdit`, `Tasks.tsx:170` `canEdit` | `useCan("bugs","edit")`; Manage statuses and MRR overrides buttons → `isAdmin` |
| `JiraBacklog.tsx:251` "Only admins can edit." toast | "You need Bug tracking: edit" (or "admin" for config) |
| `pages/Performance/access.ts`, `Performance.tsx:72-75` | Deleted; route guard plus `useCan("performance","edit")` for management UI |
| `Users.tsx:217, 261` Admin badge | Access chips |
| (LOCAL) `BugTriage.tsx:167, 171`, `finding-panel.tsx:162` run buttons | `useCan("bugs","edit")` |

---

## Appendix C: the token-type hole, explained

**Verified** by reading the installed source of `@clerk/express` 1.7.81 and `@clerk/backend` 2.33.5, and the controllers on main. **Not yet reproduced** with a real token.

1. `clerkMiddleware()` (global, `app.js`) and `requireAuth()` both verify a bearer token with `acceptsToken: "any"`. `requireAuth` forces `"any"` even if you pass an option, because it spreads your options *before* setting it.
2. For a Clerk OAuth access token (what the MCP bridge holds), the resulting auth object has `userId: <the user's clerk id>`, `tokenType: "oauth_token"`.
3. `requireAuth()` only checks that `userId` exists, so the MCP token **passes**. `req.auth.userId` (the deprecated property most controllers read) returns that id.
4. `getAuth(req)` with no options defaults to session tokens only and reports an OAuth token as signed out. So `adminOnly` and the Performance gate, which use `getAuth`, **refuse** it with a 401.
5. Result: whether a REST route accepts the MCP token depends on which of two Clerk functions that route happens to use.
   - The 25 `requireAuth`-only routes accept it: schedule, roster, positions, locations, the Sling roster, and self-service writes (own timezone, own sync settings, sync my day).
   - Two of those check "is admin?" inside the controller from `req.auth.userId`: `GET /user/all` (`getAllUsers`) and `GET /shift/range?includeDrafts=1` (`shouldReturnDrafts`). An **admin's** MCP token gets the admin roster (emails, admin flags, manager notes) and draft shifts.
   - Routes behind `adminOnly`, and all of `/performance`, refuse it.

**Why it matters.**
- **This is not privilege escalation:** a token only ever acts as its owner, with at most its owner's access.
- **It is blast radius:**
  - The MCP token was issued for one door, the curated MCP tools behind `mcpAuth` (must be an agendo user, must be `@duda.co`). It also opens the REST API, where `requireAuth` only asks "is this *some* Clerk user?".
  - The token lives in a plain file on each laptop (`~/.mcp-auth`, written by mcp-remote), with a refresh token that mints new access tokens without a login.
  - A leaked copy of that file (malware, a synced backup, copied dotfiles) therefore exposes the owner's REST access, and for an admin, the admin roster and drafts. It does this indefinitely, until the grant is revoked in Clerk.

**Fix (merged in joaoluizc/agendo#44, 2026-10-07).**
- New `src/middlewares/requireSession.js` replaces every `requireAuth()`: 11 route and mount sites in `app.js`, 5 in `routers/userRouter.js` and 7 in `controllers/gCalendarController.js`.
  - It reads `getAuth(req, { acceptsToken: "session_token" })` and answers a JSON 401 (not a 302).
  - It logs a warning when a valid token of another type (e.g. an MCP OAuth token) is refused, so the Render logs show whether anything relied on the old behavior.
- `getAllUsers` and `shouldReturnDrafts` now take the caller from `getAuth(req).userId` instead of `req.auth.userId`.
- The browser cookie and the Settings API token are session-type tokens, so they keep working. `/mcp` is unchanged: it still accepts only OAuth tokens.
- `requireSession.test.js` drives the real Clerk `getAuth` with faked session, OAuth, API-key, M2M and signed-out auth objects. The full suite passes (29 tests).
- **Not part of this fix:** "any Clerk identity without a Mongo user can read". It needs the Mongo lookup in `getCaller` (PR 1 and PR 2).
