# MCP server (self-contained module)

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets the
support team query and draft agendo's schedule from their own Claude/ChatGPT clients,
authorized per-user through Clerk OAuth, with each person's agendo permissions resolved
from Mongo on every request (docs/knowledge/permissions.md). Everything for it
lives in this folder; `app.js` touches it in exactly one line.

Design and rationale: [`docs/mcp-server-plan.md`](../../../docs/mcp-server-plan.md).

**Status: in production.** Eleven tools: `whoami`, five read tools (`find_shifts` is the
general query the other four are special cases of), and five for schedule builders —
`find_coverage_gaps` plus create/update/delete/list confined to **draft** shifts, so
nothing here can reach a published schedule or Google Calendar. Who gets which is decided
per person by their agendo permissions (below). Clients connect through the `mcp-remote`
bridge, identified by CIMD, with no credential on anyone's machine. Still open: publishing
agendo in the claude.ai org connector directory, which would retire the bridge.

## Tools

| Tool | Requires | What |
| --- | --- | --- |
| `whoami` | signed in | Name, email, admin flag, a level per area, timezone |
| `get_my_schedule` | signed in | The caller's own published shifts |
| `get_agent_schedule` | `scheduling:view` | A colleague's published shifts |
| `get_coverage_at` | `scheduling:view` | Who is on shift at a moment |
| `summarize_shifts` | `scheduling:view` | Hours by agent and position over a period |
| `find_shifts` | `scheduling:view` | The general query; drafts need `scheduling:edit` |
| `find_coverage_gaps` | `scheduling:edit` | Where headcount falls below coverage targets |
| `create_shift`, `list_draft_shifts`, `update_shift`, `delete_shift` | `scheduling:edit` | Drafts only — never publish |

A new area's tools go in their own `tools/<area>.js`, each with `requires: "<area>:<level>"`,
registered in `server.js`. A "self"-level tool must scope with `scopeFor(caller, area)` and
ignore any agent or user id the client sends.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/.well-known/oauth-protected-resource/mcp` | none | RFC 9728 metadata — tells a client which authorization server to use |
| GET | `/.well-known/oauth-protected-resource` | none | Same, bare form, for clients that probe the root |
| GET | `/.well-known/oauth-authorization-server` | none | Mirrors Clerk's own OAuth metadata |
| GET | `/mcp-client.json` | none | CIMD document identifying the `mcp-remote` bridge, fetched by Clerk |
| ALL | `/mcp` | Clerk **OAuth** access token | The MCP endpoint (Streamable HTTP, stateless) |

The discovery routes must be publicly readable — that is how an unauthenticated client
learns where to send the user to log in. `/mcp-client.json` is public for a different
reason: Clerk fetches it to resolve a URL-shaped client id (see `lib/clerkOauth.js`). It
holds no secret — a native client cannot keep one — and it grants nothing on its own,
because Clerk still has to admit the client and the person still has to log in.

## Authorization

Three gates, all failing closed, in `lib/mcpAuth.js`:

1. Clerk must accept the bearer token as an **OAuth** access token (`acceptsToken:
   "oauth_token"`). A browser session token is rejected.
2. The Clerk id must resolve to a Mongo user via `services/authz.resolveUser` — the same
   single authority the REST permission checks use. **Deleting the Mongo user is the instant kill switch
   for MCP access**, independent of Clerk and Google. Put it in the offboarding checklist.
3. The user's email domain must be allowed (`MCP_ALLOWED_EMAIL_DOMAINS`, default
   `duda.co`). Redundant with Google's Internal-app consent gate on purpose: that gate is
   three uncommitted dashboard settings, and MCP credentials are long-lived and live on
   laptops.

Per-tool permission is enforced by `lib/registerTool.js`, which **requires**
`requires: "signedIn" | "admin" | "<area>:<level>"` — the same requirements the REST routes
use — and throws at registration time if it is missing or misspelled. There is no mount
point covering tools by default, so a forgotten guard would be silent. A tool the caller
lacks the level for is not registered at all (absent from `tools/list`), and the wrapper
re-checks on call. Every tool call logs requestId, caller, client and arguments.

**When someone's access changes, nobody reinstalls or logs in again.** Permissions are read
from Mongo on every request and the OAuth scopes are identity-only (a test pins them), so
the server's answer changes on the next request. Only the client's cached tool list lags:

- A **revoked** tool still in a stale list gets a one-request stub that explains what is
  needed (`caller.toolCallNames`, set in `mcpHandler`) instead of "Tool not found".
- A **granted** tool appears once the client re-lists — quit and reopen Claude Desktop,
  start a new Claude Code session, or Refresh in claude.ai / ChatGPT. The server says
  `tools.listChanged: false`: a stateless server has no session to push that on.

`ADMIN_BYPASS=1` is **not** honoured here — it only affects REST. Test MCP authorization
with real levels in `dev-users`.

## Layout

```
mcp/
├── mcpRouter.js        mountMcpRoutes(app): /mcp + the two .well-known routes, per-route CORS
├── server.js           createMcpServer(caller) — one McpServer per request
├── lib/
│   ├── mcpAuth.js      the perimeter: OAuth token → Mongo user → domain → req.mcpCaller
│   ├── registerTool.js permission-enforcing registration wrapper (`requires` is mandatory)
│   ├── roster.js       users, positions and locations for name lookups
│   ├── format.js       rendering times and tables
│   └── clerkOauth.js   OAuth discovery metadata (see "No @clerk/mcp-tools" below)
├── tools/
│   ├── identity.js     whoami
│   ├── schedule.js     schedules, coverage, totals, coverage gaps
│   ├── find.js         find_shifts
│   └── shifts.js       draft writes
└── mcp.test.js         the server over the SDK's in-memory client: tools per person, refusals
```

Two structural choices worth knowing before editing:

- **A fresh `McpServer` per request.** The stateless transport is per-request and an
  `McpServer` holds one transport, so a shared instance would let concurrent requests
  clobber each other. It also lets registration depend on the caller, which is what makes
  tools someone lacks access for genuinely invisible rather than listed-then-refused.
- **Mounted before the global CORS policy in `app.js`.** agendo's global policy is locked
  to the Vercel origin *and answers preflights itself*, so a route mounted after it never
  sees an `OPTIONS` request. MCP needs open CORS with `WWW-Authenticate` exposed, so it is
  mounted first with its own policy. Moving the `mountMcpRoutes(app)` call below
  `app.use(cors(corsOptions))` silently breaks browser-based clients.

## No `@clerk/mcp-tools`

The plan chose it; it is not usable on agendo's stack. 0.6.0 peer-requires `express ^5`
and `@clerk/express ^2` (agendo: express 4, @clerk/express 1), so npm refuses to install
it; 0.3.1, the last version without those peers, ships a *vendored copy* of
`@clerk/backend` with its own Clerk client singleton. What it provides is the ~60 lines in
`lib/clerkOauth.js`. If agendo moves to express 5 + @clerk/express 2, that file can be
deleted in favour of `@clerk/mcp-tools/express`.

Only one new npm dependency: `@modelcontextprotocol/sdk`.

## Configuration

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CLERK_PUBLISHABLE_KEY` | yes | — | Already present. The Clerk Frontend API origin (the OAuth authorization server) is derived from it |
| `CLERK_SECRET_KEY` | yes | — | Already present. Token verification |
| `MCP_ALLOWED_EMAIL_DOMAINS` | no | `duda.co` | Comma-separated allowlist |
| `MCP_PUBLIC_URL` | no | forwarded headers | Override the advertised public origin |
| `CLERK_FRONTEND_API_URL` | no | derived from the publishable key | Override for custom Clerk domains |

`MCP_PUBLIC_URL` exists because Render terminates TLS at its proxy: `req.protocol` is
`http` there while the client used `https`, and the advertised `resource` must match the
URL the client actually asked for, character for character. The forwarded headers are
trusted first; set this if that is ever wrong.

## Clerk setup

Clients are admitted by CIMD: the `mcp-remote` bridge's client id is the URL of
`/mcp-client.json`, and Clerk's *CIMD Clients* allowlist decides which clients may log in.
How it is configured, and why not dynamic client registration, is in
[`docs/mcp-server-setup.md`](../../../docs/mcp-server-setup.md); what a teammate does is in
[`docs/mcp-team-setup.md`](../../../docs/mcp-team-setup.md).

## Verifying

- **Protocol + permissions** — `mcp.test.js` (part of `npm test`) drives a server with
  synthetic callers over the SDK's own `Client` and `InMemoryTransport`: the exact tool
  list per access level, `listChanged: false`, the drafts refusal, the stale-tool stub
  (also over HTTP through `mcpHandler`), registration refusing a missing or misspelled
  `requires`, and the identity-only OAuth scopes.

These are still by hand, worth re-running after changes to the HTTP surface or Clerk:
- **HTTP surface** — import the real `app.js` on a spare port and check: the discovery
  documents, that `resource` follows `x-forwarded-proto`, `401` + a
  `WWW-Authenticate: Bearer resource_metadata="…"` challenge with no token, `401` with a
  bogus one, and that an `OPTIONS /mcp` preflight from `https://claude.ai` is answered
  with `Access-Control-Allow-Origin: *` (this is the check that catches the global-CORS
  ordering trap).
- **A real client against the deployed instance.** Local success does not prove the OAuth
  discovery flow. A Claude client should complete login against Render and `whoami`
  should return the right name, access and timezone; someone without `scheduling:edit`
  should see the draft tools neither listed nor callable.

## Remove it

1. Delete this folder (`calendar-api-backend/src/mcp/`).
2. In `app.js`, delete the `mountMcpRoutes` import and its call.
3. `npm uninstall @modelcontextprotocol/sdk`.
4. In the Clerk Dashboard, remove the bridge from the CIMD clients and revoke any
   authorized OAuth clients.

No other part of agendo imports this module. It reads `services/authz.js` and
`middlewares/addRequestId.js`; it writes nothing.
