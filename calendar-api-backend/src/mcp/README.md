# MCP server (self-contained module)

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets the
support team query and draft agendo's schedule — and read Zendesk — from their own
Claude/ChatGPT clients, authorized per-user through Clerk OAuth, with each person's agendo
permissions resolved from Mongo on every request (docs/knowledge/permissions.md).
Everything for it lives in this folder; `app.js` touches it in exactly one line.

**One connection, two separate systems.** The connector is titled "Agendo + Zendesk". Tools
act on exactly one of them and say which, in four places a model reads: the name
(`zendesk_*` is Zendesk, everything else is agendo), the title (`Zendesk: …` / `agendo: …`),
the description opener (`[Zendesk, read-only]` / `[agendo …]`) and the server instructions,
which also define the words the two systems use differently (*agent*, *ticket*, *queue*).
`registerZendeskTool` enforces this for Zendesk tools and a test checks every listed tool.
No tool spans both systems.

Design and rationale: [`docs/mcp-server-plan.md`](../../../docs/mcp-server-plan.md) (agendo)
and [`docs/zendesk-mcp-plan.md`](../../../docs/zendesk-mcp-plan.md) (Zendesk).

**Status: in production** for agendo: eleven tools, `whoami`, five read tools (`find_shifts`
is the general query the other four are special cases of), and five for schedule builders —
`find_coverage_gaps` plus create/update/delete/list confined to **draft** shifts, so
nothing here can reach a published schedule or Google Calendar. Who gets which is decided
per person by their agendo permissions (below). Clients connect through the `mcp-remote`
bridge, identified by CIMD, with no credential on anyone's machine. Still open: publishing
agendo in the claude.ai org connector directory, which would retire the bridge.

**Zendesk: eight tools** — the connection status, ticket search and count, one ticket, its
conversation and its attachments, and user and organization search. Metrics, satisfaction
ratings and the lookup lists come next (see the Zendesk plan). Read-only, and not by a
setting: see "Zendesk" below.

## Tools

### agendo (scheduling)

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

### Zendesk (read-only)

| Tool | Requires | What |
| --- | --- | --- |
| `zendesk_connection_status` | `zendesk:view` | Which Zendesk account and user these tools read as, that user's role and ticket access, and the rate-limit headroom |
| `zendesk_search_tickets` | `zendesk:view` | Find tickets by structured filters (status, assignee, requester, organization, tags, dates, custom field, text), minimal fields unless more are asked for, optionally with the people and organizations behind the ids, paged by cursor |
| `zendesk_count_tickets` | `zendesk:view` | How many tickets match the same filters, as a number |
| `zendesk_get_ticket` | `zendesk:view` | One ticket by number, with a useful default; optionally the people, the organization and, for a problem ticket, its incidents |
| `zendesk_get_ticket_conversation` | `zendesk:view` | The comments: author and side, public or internal, channel, text, attachments listed by id; paged by cursor |
| `zendesk_get_ticket_attachment` | `zendesk:view` | One attachment by id: an image as an image, a text file as fenced text; only what Zendesk's malware scan cleared, only from Zendesk, up to a size |
| `zendesk_search_users` | `zendesk:view` | Users by structured filters (name, email, role, organization, group, phone, tags, dates …), or by id |
| `zendesk_search_organizations` | `zendesk:view` | Organizations by structured filters (name, external id, tags, dates), or by id |

**`zendesk_search_tickets` in brief.** The model gives filters; `lib/zendeskTicketQuery.js`
builds the Zendesk query, so the model never writes search syntax and no value can add a
condition. Values go through an **allowlist** (bare if made of `A-Za-z0-9 @ . _ + -`, quoted
if they use only letters, digits, spaces and `. - _ @ ' & ( ) , / +`, otherwise *refused*,
never altered; it must also equal its own NFKC form, so a lookalike quote, colon or
separator cannot get through whatever Zendesk does with Unicode). Free text is folded,
stripped of everything that is not a word, and searched as quoted words. Dates must exist
(`2026-02-30T10:00:00Z` is refused, not moved to March) and go out as UTC instants. `me` is
refused because it would mean the shared Zendesk user, `form` takes a name, and a search
of exclusions alone is refused because it can match nothing. It uses the *Export Search Results* endpoint: cursor paging with no
1,000-result cap, but ordered by creation date only, no total count, 100 requests a minute for
the whole Zendesk account, and cursors that expire after an hour. Everything Zendesk sent
(subjects, tags, names, custom-field values) is one JSON-lines block inside one fence with one
random id, each line written with invisible and line-separator characters escaped, and every
field cut to a size (people and organizations have a budget of their own); the tool's own
words (the query, counts, which way the page runs, the next cursor) are outside it. A page
that is cut offers no cursor, and says it was cut instead of calling itself the last page.

**The other tools, in brief.**
- *Count* takes search's filters and nothing else, adds `type:ticket` (the count endpoint takes
  only a query), and shows a number. Zendesk's reference does not show the endpoint's
  response, so the tool accepts a number or an object with a value and refuses any other shape.
- *Get ticket* and the conversation build their path with ``zendeskPath`...` ``, which takes
  only a positive whole number in each slot, so a model-supplied value chooses *which* ticket,
  never which endpoint. The conversation shows internal notes by default, labelled
  `internal` (`include_internal_notes: false` leaves them out and counts them; a comment that
  does not say whether it is public is labelled `unknown` and counts as not public), says which side
  each author is on from Zendesk's own role for them, and lists attachments by id, name, type,
  size and scan result — never their download addresses.
- *Get attachment* downloads only what Zendesk's own malware scan found clean (any other result,
  or none, is "not cleared"), only a file on the configured Zendesk host, only an image
  (typed by its own bytes, not its claim: PNG, JPEG, GIF, WebP) up to 1.5 MB or a plain-text
  file (valid UTF-8 with no NUL byte anywhere in it) up to 500 kB. Anything else returns its details and says why not.
  The file's name and declared type, and any text in it, are fenced as customer data.
- *Search users* and *search organizations* are filters only, no search string, through the
  same export endpoint with `filter[type]=user` or `organization`. `ids` is a separate mode (up
  to a hundred, with `show_many`), never mixed with filters. Zendesk documents no user-id search
  keyword; custom user and organization fields are not offered yet.
- *Every list or bag that is cut says so.* A record never silently drops what it does not show:
  `tags_more`, `custom_fields_more`, `user_fields_more`, `organization_fields_more` and
  `attachments_more` count what was left out, and a bag of custom values is bounded in
  characters (about 3,000) as well as in number.

A new area's tools go in their own `tools/<area>.js`, each with `requires: "<area>:<level>"`,
registered in `server.js`. A "self"-level tool must scope with `scopeFor(caller, area)` and
ignore any agent or user id the client sends.

## Zendesk

All Zendesk tools read as **one shared Zendesk user**, whose credential is the
`ZD_SUBDOMAIN` / `ZD_API_EMAIL` / `ZD_API_TOKEN` env vars (the Jira-backlog feature already
uses them). Three consequences to keep in mind:

- **A Zendesk API token cannot be scoped.** It can do whatever its owner can, so
  "read-only" is guaranteed only by `lib/zendeskClient.js`: `get()` (JSON) and `download()`
  (a file) are the only functions that reach the network, the HTTP method is a literal inside
  each, and a test fails if any request is not a GET. Do not add a write path there. Writes,
  if they ever come, are a separate module behind their own permission level.
- **`zendesk:view` grants the token owner's visibility, not the person's own.** Zendesk's
  audit trail shows the shared user; agendo's tool-call log is the record of who asked.
  `zendesk_connection_status` shows whose eyes these are.
- **Zendesk's rate limit belongs to the whole account** and is shared with every other
  integration on it. The client keeps a process-wide request budget (100 a minute) with a
  smaller share per person (30), so one runaway model loop cannot lock out the team; a
  concurrency cap with a bounded queue, of which one person may hold only 6 places; one
  25-second deadline across every attempt, wait and retry; and it honours `Retry-After` and
  the client's cancellation (a cancelled call leaves the queue at once, and a request that
  never reached Zendesk gives its budget back). The budget is per process: a second Render
  instance would double it.

Only plain `/api/v2/…` paths are ever fetched (a tight character allowlist: no full URLs,
no `%`, `;`, `\` or `..`). Tools build the path from a fixed template and validated ids, so
a model-supplied value never chooses the endpoint, and a pagination cursor travels as the
opaque `page[after]` value, never as a URL. Credentials only reach
`<ZD_SUBDOMAIN>.zendesk.com`. A JSON read never follows a redirect; a file download is the one
exception, under the rules below. Text customers wrote goes
through `lib/zendeskShape.js` (`untrusted()` for one block of prose, `fencePayload()` for a
list), which fences it with a random per-block id the text cannot forge (read the file for
its limits). A truncated page withholds its next-page cursor, since following it would skip
items.

**Logging fails closed.** Every call is logged with its arguments, and a Zendesk search query
or a customer's name can be an email address. A Zendesk tool lists only the arguments that
are safe to log in `logArgs` (the wrapper accepts only a number, boolean, enum or literal
field there); every other argument is logged by size. A failure is logged with the error's
`logMessage`, which leaves out anything Zendesk echoed back (a rejected search can quote its
query) — and an unexpected error in a Zendesk tool is logged generically — while the person
and their model still see the full message.

**Handlers get the cancellation signal and nothing else of the SDK's request context** (the
rest carries the caller's bearer token and headers), so a handler cannot leak what it never
holds.

**Downloading a file is the one place the client follows a redirect**, so it has rules a JSON
read never needs. The starting address must be `https://<the configured Zendesk host>/attachments/...`
(an attachment's `content_url` can point outside Zendesk, and a customer may have chosen where:
those are not fetched). Credentials go to that first request and no other. Each redirect must
lead to an https host that is a real name, on the default port, with no userinfo, and not an IP
address, `localhost`, a single label or an internal-looking name (`.local`, `.internal`, `.lan`,
`.corp`, `.home`, `.arpa` and the like, a trailing dot included, so `evil.localhost.` is no way
round it); there are at most three hops,
an empty or missing `Location` is refused, and every hop spends the caller's budget. The body is
read up to a byte cap and no further (a body declared too large, and the body of a redirect or
an error, is cancelled rather than left holding the connection), there is no retry, and nothing
about the address is
logged, because its path carries a secret token. What this does *not* stop is a public name that
resolves to a private address; the redirect is Zendesk's to give, not a customer's.

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
   for MCP access**, independent of Clerk and Google. That is what Settings → Users →
   Offboard does, first, before anything else — see
   [`docs/knowledge/offboarding.md`](../../../docs/knowledge/offboarding.md). It deletes
   the Clerk account too, which matters: a missing Mongo user is re-provisioned on a
   request if Clerk created the account in the last day or an admin invited the email
   (see `docs/knowledge/onboarding.md`). So if an offboard reports that the Clerk
   deletion failed, finish it by hand — for someone on their first day the leftover login
   is not inert — and revoke any pending invite for their email.
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
│   ├── clerkOauth.js   OAuth discovery metadata (see "No @clerk/mcp-tools" below)
│   ├── registerZendeskTool.js  registerTool + the Zendesk naming/annotation rules
│   ├── zendeskClient.js        the GET-only, host-pinned, rate-limited Zendesk client
│   ├── zendeskQueryParts.js    the allowlist, dates, tags and text every search query is built from
│   ├── zendeskTicketQuery.js   ticket filters -> a Zendesk search query, never the reverse
│   ├── zendeskPeopleQuery.js   user and organization filters -> a query
│   ├── zendeskPath.js          paths with ids in them, where an id can only be an id
│   ├── zendeskRecord.js        how a ticket, a user and an organization are shown (sized, checked)
│   ├── zendeskSideload.js      the people and organizations behind a page of ids
│   ├── zendeskCommon.js        the shared deadline, the cursor shape, paging text
│   └── zendeskShape.js         untrusted-text fencing, answer size cap
├── tools/
│   ├── identity.js     whoami
│   ├── schedule.js     schedules, coverage, totals, coverage gaps
│   ├── find.js         find_shifts
│   ├── shifts.js       draft writes
│   ├── zendesk.js      the Zendesk connection status; registers the rest
│   ├── zendeskTickets.js       zendesk_search_tickets, zendesk_count_tickets
│   ├── zendeskTicketDetail.js  zendesk_get_ticket, ..._conversation, ..._attachment
│   └── zendeskPeople.js        zendesk_search_users, zendesk_search_organizations
├── testing/            query and tool test helpers (never imported by production code)
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
| `ZD_SUBDOMAIN`, `ZD_API_EMAIL`, `ZD_API_TOKEN` | for the Zendesk tools | — | Already present for the Jira-backlog feature; the same credential, so rotating it affects both. Unset: the Zendesk tools answer "not configured", nothing else breaks |

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
