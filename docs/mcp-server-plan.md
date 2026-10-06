# Plan: agendo MCP server

_Remote MCP server exposing agendo's schedule to Claude clients, authorized per-user via
Clerk OAuth, with admin/normal permissions resolved from Mongo._

_Written 2026-08-13. Prerequisites verified landed as of this date._

## Goal

Let the support team query agendo's schedule from their own Claude clients ("when am I
working Thursday?", "who's covering tickets at 3pm?"), and let admins make schedule
changes conversationally. Only Duda employees may connect. A normal user may read; only
an admin may write.

## Prerequisites — DONE

These landed before this plan and are what make it tractable:

- `src/services/authz.js` — `resolveUser(clerkUserId) -> { mongoUser, isAdmin }`, the
  single authority for caller identity + role. Fails closed when no Mongo user exists.
- `utils/userIsAdmin.js` (Clerk `publicMetadata`) deleted; Mongo `User.type` is the only
  admin authority. See `docs/knowledge/clerk-mongo-boundary.md`.
- Every shift / skill / location / position mutation is `adminOnly` server-side.
- `adminOnly`'s `NODE_ENV`-keyed bypass replaced by an explicit, logged `ADMIN_BYPASS=1`.

## Decisions already made

| # | Decision | Rationale |
|---|---|---|
| 1 | Client is the **support team** (humans in Claude clients). Internal agents later. | Rules out a local stdio server: ~20 non-engineers won't install Node and paste tokens. |
| 2 | **Remote Streamable HTTP**, mounted in the existing Express app. | `@clerk/mcp-tools` reduces OAuth-resource-server work to ~4 route registrations. **Amended while building:** the package is unusable here — 0.6.0 peer-requires express ^5 + `@clerk/express` ^2 (agendo is on 4 / 1) and npm refuses it; 0.3.1 vendors its own copy of `@clerk/backend`. Its ~60 lines of metadata generation now live in `src/mcp/lib/clerkOauth.js`. |
| 3 | **Mongo is authoritative for role**, via `resolveUser`. OAuth scopes are a secondary, coarse gate only. | Scopes say what the *client asked for*, not what the *user may do*. Clerk has no knowledge of `User.type`. |
| 4 | **REST admin gating first**, then MCP. | Done. MCP now inherits correct authorization instead of working around a hole. |
| 5 | **Extract service-level functions incrementally** (per tool), rather than calling controllers or looping back over HTTP. | Controllers are `(req,res)`-coupled and hold the Google Calendar orchestration. Duplicating it would let the two copies drift — the exact bug class that previously wiped events from calendars. |
| 6 | **Task-shaped tools**, not a 1:1 REST mirror. | A single day of schedule data is ~100 KB (`docs/schedule-example.json`) — ~25-30k tokens. Pass-through is unusable; shaping is required regardless, so put it where it belongs. |
| 7 | **Full CRUD for admins; read-only for everyone else.** | Matches what the UI has always enforced and what the API now enforces. |
| 8 | **Constraints app writes via REST + M2M, not MCP** (recommended, not final). | MCP auth assumes a human consenting in a browser; Clerk does not yet support the OAuth client-credentials flow. The shared service layer from #5 is what keeps options open — not the protocol. |

## Open questions — resolve before/while building

1. ~~**Does your Clerk plan expose OAuth Applications?**~~ **Answered 2026-08-17: yes.**
   The instance already serves `/.well-known/oauth-authorization-server` with
   `authorization_endpoint`, `token_endpoint`, PKCE S256 and the `profile`/`email`/
   `offline_access` scopes. It does **not** advertise a `registration_endpoint`, so DCR is
   off — and should stay off. Phase 0 does not need it: a pre-registered Clerk OAuth app
   already covers claude.ai (see `mcp-server-setup.md`). CIMD is what unlocks desktop
   clients later (checked against the dev instance from the local `.env`; confirm the same
   for the production key).
2. ~~**Request CIMD beta access from Clerk support.**~~ **Resolved 2026-10-05: CIMD went
   GA on 2026-09-17.** No support request, no beta gate — it is self-serve on every Clerk
   application. It is no longer a Phase 2 blocker, and should be enabled in Phase 0 in
   place of DCR (see below).
3. **Is agendo's Render instance on a paid plan?** Free-tier instances spin down; a cold
   start is mildly annoying in a browser and reads as a hard failure in an MCP client.
4. Should `apply_schedule` (bulk) exist in the MCP surface at all, or only in REST?

## Security design

### Who can connect

The gate is unchanged from the web app and is genuinely enforced by Google: Clerk login is
Google-only, and agendo's Google Cloud OAuth app is **Internal**, so Google itself refuses
consent for accounts outside Duda's Workspace. MCP adds no new way in — a client still
cannot obtain a token without a Duda Google account completing Clerk's consent flow.

Two hardening steps, because MCP credentials are longer-lived and live on laptops rather
than in a browser session:

- **Assert the email domain (or Workspace membership) server-side** in the MCP auth layer,
  so the perimeter fails closed rather than depending on three uncommitted dashboard
  settings (Clerk's enabled strategies, Clerk's social providers, the GCP consent screen's
  User Type). Cheap; worth doing in the REST layer too.
- **Document the revocation procedure.** `resolveUser` fails closed when no Mongo user
  exists, so **deleting or demoting the Mongo user is the instant kill switch** for MCP
  access, independent of Clerk and Google. This is the deprovisioning story agendo
  currently lacks. Add it to offboarding.

### Which clients may connect — use CIMD, not DCR

**Dynamic Client Registration is deprecated in the MCP spec.** It creates a public,
unauthenticated registration endpoint that anyone can use, with no audit trail. The
replacement is **Client ID Metadata Documents (CIMD)**: a client's `client_id` is an
HTTPS URL serving a JSON document with its `client_name` and `redirect_uris`; the
authorization server fetches it, verifies `client_id` matches the URL exactly, and
validates the requested redirect URI against the list. Client priority order per spec is
pre-registration → CIMD → DCR (backwards compatibility only) → prompt the user.

**Clerk shipped CIMD on 2026-08-05 and made it generally available on 2026-09-17.** No
support request, no beta gate: the settings appear on the OAuth applications settings page
for **every** application, and it is **off by default** — nothing changes for existing
OAuth flows until it is switched on.

Setup, entirely self-serve in the Clerk Dashboard:

1. OAuth applications → Settings → **Client onboarding** → enable **Publish CIMD support**.
2. **Client admission** → **Pre-registered clients only**.
3. Applications → **Add application → Pre-register CIMD client**, once for Claude and once
   for ChatGPT, setting the scopes each may request.

Each client then carries an admission status — *Explicitly allowed*, *Implicitly allowed*
or *Blocked* — so what has actually attempted to connect is reviewable rather than
invisible.

**Target posture: CIMD on, Claude and ChatGPT explicitly allowed, admission set to
pre-registered only.**

Two caveats to hold onto:

- **Allowlisting is strong for hosted connectors, weak for native clients.** claude.ai and
  chatgpt.com redirect to HTTPS domains nobody can impersonate. Desktop clients (Claude
  Desktop, Claude Code, Cursor) redirect to `http://localhost:PORT/callback`, and any
  local process can listen there — so a malicious local app can run the flow under a
  trusted client's `client_id` and the consent screen will show that trusted name. This
  is inherent to public native OAuth clients, not a Clerk deficiency, and CIMD does not
  fix it.
- **Keep proportion.** MCP grants no access the user does not already have in the web app;
  a support agent can already read the whole schedule in a browser. The marginal risks are
  exfiltration at automation speed and admin write tools in a rogue client — real, but
  bounded, and the data is shift schedules.

**Sequencing (revised 2026-10-05):** the original plan was to spike with DCR and migrate
to CIMD before rollout. With CIMD now GA that detour has no purpose — **enable CIMD in
Phase 0 and never turn DCR on at all.** It keeps a deprecated public registration endpoint
out of the picture entirely, and means the posture proved in the spike is the posture that
ships, rather than a configuration swapped out under real users.

### Per-tool authorization

Read-only does **not** mean unrestricted — agendo already has admin-only reads
(`GET /coverage-meter` is `adminOnly`; the schedule page fetches Google Calendar events
only when `isAdmin`). So every tool declares a level.

**The tool registration helper must require a permission argument**, so it is impossible
to define a tool without stating its level. Unlike Express routes there is no mount point
that covers them all by default, and a forgotten guard is a silent hole.

```js
// src/mcp/lib/registerTool.js — shape, not final code
registerTool(server, {
  name: "get_coverage_at",
  level: "user" | "admin",   // required — no default
  description: "...",
  inputSchema: z.object({ ... }),
  handler: async (args, { mongoUser, isAdmin }) => { ... },
});
```

The wrapper resolves `authInfo.extra.userId` through `authz.resolveUser`, enforces
`level`, logs the call, and hands the handler an already-resolved caller. Handlers never
see a raw Clerk id and never make their own authorization decision.

### Audit logging

Every tool call logs `requestId`, `clerkId`, tool name, and a summary of arguments —
writes especially. An LLM acting on a fuzzy instruction is exactly the situation where
"what happened and who asked for it" needs to be reconstructable after the fact.

## Architecture

Self-contained module under `src/mcp/`, matching the existing convention of `discovai/`,
`jiraBacklog/` and `bugTriage/` — each ships a `README.md` describing how to remove it.

```
src/mcp/
  README.md
  mcpRouter.js         # mounts /mcp + the two .well-known routes
  server.js            # McpServer instance, registers tools
  lib/
    registerTool.js    # permission-enforcing wrapper (above)
    format.js          # response shaping: row caps, tz rendering, ids -> names
  tools/
    identity.js        # whoami
    schedule.js        # read tools
    shifts.js          # admin write tools
```

New dependencies: `@modelcontextprotocol/sdk`, `@clerk/mcp-tools`. `cors` and `zod` are
already present.

### Wiring notes (real integration friction, not theory)

- **CORS conflict.** `app.js` applies a single global `corsOptions` locked to the Vercel
  origin. The MCP routes need their own CORS with `exposedHeaders: ['WWW-Authenticate']`,
  and the `.well-known` endpoints **must be publicly accessible** for client discovery.
  Mount per-route CORS; do not loosen the global policy.
- **`.well-known` paths live at the app root**, not under the router mount:
  `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`.
- `app.js` calls `clerkMiddleware()` twice (lines ~53 and ~55). Harmless, but worth
  removing while touching this file.
- Clerk Dashboard: enable **Dynamic client registration** on the OAuth applications page,
  or `npx clerk@latest api instance/oauth_application_settings -X PATCH -d
  '{"dynamic_oauth_client_registration": true}'`.

### Response shaping rules — apply to every tool

1. **Hard row caps**, with an explicit `"N more omitted"` note. Silent truncation reads as
   "that's everyone", which is worse than an error.
2. **Names, never ids.** Resolve users and positions server-side. There are three id
   spaces in play (Clerk `user.id`, Mongo `_id`, `slingId`) plus two position id-spaces;
   the LLM should never see an id it could confuse. Ids appear only where a subsequent
   write tool needs one.
3. **Render every timestamp in the caller's timezone** from `mongoUser.timezone`, never
   raw ISO. Do **not** reuse `getLocalTimeframeISOld` — it is offset-broken (see
   `docs/knowledge/frontend-schedule-date.md`). Sling data also carries per-user
   timezones (e.g. `Asia/Manila`), so "my schedule" and "the team's schedule" are not the
   same rendering problem.

## Tool surface

### v1 read tools

| Tool | Level | Returns |
|---|---|---|
| `whoami` | user | Caller's name, email, role, timezone. Phase 0 auth proof; keep it — it's how a user debugs "why can't I see X". |
| `get_my_schedule(range)` | user | Caller's own shifts, position names, caller's timezone. |
| `get_agent_schedule(name, range)` | user | One named colleague's shifts. Mirrors what the schedule page already shows everyone. |
| `get_coverage_at(datetime)` | user | Who is on which position at a moment. Names only. |
| `find_coverage_gaps(date)` | **admin** | Compares staffing against coverage targets. Admin-only, matching `GET /coverage-meter`. |

### v2 admin write tools

| Tool | Level | Notes |
|---|---|---|
| `create_shift` | admin | Requires extracting `shiftController.createShift`'s orchestration (validate → GCal sync per user → `isSynced`/`syncedEvent` → per-user error collection) into a callable service function. |
| `update_shift` | admin | Same extraction for `updateShift` (delete old GCal event, add new). |
| `delete_shift` | admin | Same for `deleteShift`. |
| `apply_schedule(date, shifts[], mode, dry_run)` | admin | Optional. Batch apply with `mode: "skip" \| "merge" \| "replace"`, mirroring the semantics `duplicateShiftsFromDay` already uses. Useful for reviewing a constraints-app run conversationally. |

**Write tools must default to showing a diff before acting.** An admin's LLM with
`delete_shift` can wipe a week of coverage from a fuzzy instruction. `dry_run` should be
the default on anything batch-shaped, returning "would create N, delete M" for
confirmation. This is a tool-design problem, not an authorization one — authorization is
already correct.

## Phases

**Phase 0 — Auth spike. Code built 2026-08-17** (`src/mcp/`, see its README). What remains
is not code and not Clerk configuration: a pre-registered OAuth app already covers
claude.ai, so the remaining work is **deploy, then connect a real client end to end**.
Neither DCR nor CIMD is required to finish this phase.

The routes and the single `whoami` tool already exist. This phase proves the one genuinely
risky assumption — that Clerk OAuth works end to end, through Render, with the CORS split —
before any tool design is committed. If it fails, the approach needs rethinking, so it
comes first.

**Phase 1 — Read tools. Shipped 2026-10-05.** `get_my_schedule`,
`get_agent_schedule`, `get_coverage_at` and admin-only `find_coverage_gaps`, over
`src/mcp/lib/format.js` (rendering) and `src/mcp/lib/roster.js` (id → name). No
controller extraction was needed: `shiftService.findShiftsByRange` and
`coverageMeterService.getMeters` were already callable.

**Timezone reality check (audited 2026-10-05): `User.timezone` is unusable.** All 18
production users and all 15 dev users hold the schema default `"UTC"` — not one real
value. The field was added but never wired up: the web UI reads the *browser's* timezone,
so nothing ever wrote it.

An MCP client has no browser to ask, so that trick is unavailable here. Until Phase 5
populates the field, the rule is:

- **Never render a bare time.** Every timestamp carries its zone explicitly — `14:00 UTC`,
  not `14:00`. A bare time that is silently wrong by several hours is worse than an
  obviously-labelled one, because it looks authoritative.
- Use `mongoUser.timezone` where it is set. Today that always yields UTC, which is at
  least honest once labelled, and it means the tools need no change when Phase 5 lands.
- Do not infer a timezone from anything else — not the shift data, not the locale, not
  Sling. Guessing produces confident wrongness.

`whoami` reports the caller's timezone precisely so a surprising answer is explicable
without an engineer. That is no longer hypothetical: it is how this was found.

**Phase 2 — Rollout to the support team. Resequenced 2026-10-05 to run last**, since
it is gated on org permission for claude.ai custom connectors rather than on any
engineering work. Everything else ships first so the request is backed by a working,
demonstrable integration.

**Phase 2, in detail.** CIMD and the allowlist are already in place
from Phase 0; before real users connect, confirm **Client admission is "Pre-registered
clients only"** and review anything sitting at *Implicitly allowed*. Then: setup
instructions, revocation procedure in the offboarding checklist, watch the audit log. Do this *before* write tools — real usage will reshape the
write surface, and read-only is a safe thing to be wrong about.

**Phase 3 — Admin write tools. Shipped 2026-10-05.** `create_shift`,
`list_draft_shifts`, `update_shift`, `delete_shift` — all admin-only.

**Scope decision: MCP writes the draft layer only.** It never publishes, and refuses to
change or delete a shift that is already published. This is narrower than "full CRUD for
admins" (decision #7) and deliberately so, because of where the orchestration sits:

- `shiftService.publishShifts` flips status only; syncing the newly published shifts to
  Google Calendar is the *controller's* job, afterwards. A tool calling the service
  directly would mark shifts published with no calendar event behind them.
- `shiftService.deleteShift` removes the document only; removing the matching calendar
  event is likewise the controller's. Deleting a published shift here would orphan a real
  event on a real person's calendar.

So: **an LLM may draft a schedule; a human commits it.** That also supplies what this plan
wanted from dry runs — the draft layer already is one, and a durable, reviewable one.
Drafts are excluded from the schedule view, from Google Calendar sync and from coverage
counts, so a wrong draft costs nothing until someone publishes it.

Publishing from MCP needs the sync orchestration extracted out of the controller first.
That is its own piece of work and is not blocked by anything here.

Everything written carries `source: "mcp"`, so a draft's provenance is in the data rather
than inferred. `list_draft_shifts` exists because the Phase 1 read tools deliberately
exclude drafts — without it an admin could not see back what they had just drafted.

**Phase 4 — `apply_schedule` / constraints-app integration**, if Phase 3 shows it earns
its place.

**Phase 5 (last) — Timezone settings UI.** Make `User.timezone` real.

Two capabilities on agendo's settings screen:

- **An agent sets their own timezone.** Default the picker to the browser's detected zone
  so it is one confirming click, but *store the choice* rather than continuing to infer
  it — inference is exactly why the field is empty today.
- **An admin sets anyone's timezone**, from the same roster view used elsewhere in
  settings. The support team spans several countries and people do not reliably update
  their own profile; an admin needs to fix a wrong one without asking.

Gate the admin path with `adminOnly` server-side, not only in the UI — that is the hole
closed for shift mutations and it should not be reopened here.

Worth knowing when building the backfill: **Sling already holds real per-user timezones**
(`docs/schedule-example.json` shows `Asia/Manila` for one agent), so a one-time seed from
Sling beats asking 18 people to fill in a form. Seed once; do not read Sling live —
agendo is migrating off it.

Why last: nothing else is blocked on it. The read tools work correctly without it as long
as they label the zone, and this is a UI change with a data migration, which is a
different kind of work from everything above. It is on the list because leaving the field
permanently fictional means every future time-rendering decision inherits the same trap.

## Verification

There are no automated tests in this repo. Verification is manual:

- Express router-stack introspection to confirm what is mounted and in what order.
- Throwaway Node scripts against the `dev-*` Mongo collections.
- **Test authorization with `ADMIN_BYPASS` unset** — otherwise every gate passes locally
  and role bugs stay invisible until production. Give a test Clerk user `type: "normal"`
  in `dev-users` and confirm admin tools are both *hidden from listing* and *refused on
  call*.
- Connect a real Claude client against the deployed Render instance before declaring any
  phase done; local-only success does not prove the OAuth discovery flow.
