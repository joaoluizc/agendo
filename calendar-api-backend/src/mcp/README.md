# MCP server (self-contained module)

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets the
support team query agendo's schedule from their own Claude/ChatGPT clients, authorized
per-user through Clerk OAuth with admin vs. normal resolved from Mongo. Everything for it
lives in this folder; `app.js` touches it in exactly one line.

Design and rationale: [`docs/mcp-server-plan.md`](../../../docs/mcp-server-plan.md).

**Status: Phase 0 (auth spike).** One tool — `whoami`. The point of this phase is to prove
the riskiest assumption end to end (Clerk OAuth → Render → a real MCP client) before any
tool design is committed. Read tools are Phase 1.

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
   single authority `adminOnly` uses. **Deleting the Mongo user is the instant kill switch
   for MCP access**, independent of Clerk and Google. Put it in the offboarding checklist.
3. The user's email domain must be allowed (`MCP_ALLOWED_EMAIL_DOMAINS`, default
   `duda.co`). Redundant with Google's Internal-app consent gate on purpose: that gate is
   three uncommitted dashboard settings, and MCP credentials are long-lived and live on
   laptops.

Per-tool permission is enforced by `lib/registerTool.js`, which **requires** a
`level: "user" | "admin"` and throws at registration time if it is missing — there is no
mount point covering tools by default, so a forgotten guard would be silent. Admin tools
are not registered at all for a non-admin caller (absent from `tools/list`), and the
wrapper re-checks on call. Every tool call logs requestId, caller, client and arguments.

`ADMIN_BYPASS=1` is **not** honoured here — it is an Express-middleware flag. Test MCP
authorization with a real `type` in `dev-users`.

## Layout

```
mcp/
├── mcpRouter.js        mountMcpRoutes(app): /mcp + the two .well-known routes, per-route CORS
├── server.js           createMcpServer(caller) — one McpServer per request
├── lib/
│   ├── mcpAuth.js      the perimeter: OAuth token → Mongo user → domain → req.mcpCaller
│   ├── registerTool.js permission-enforcing registration wrapper (level is required)
│   └── clerkOauth.js   OAuth discovery metadata (see "No @clerk/mcp-tools" below)
└── tools/
    └── identity.js     whoami
```

Two structural choices worth knowing before editing:

- **A fresh `McpServer` per request.** The stateless transport is per-request and an
  `McpServer` holds one transport, so a shared instance would let concurrent requests
  clobber each other. It also lets registration depend on the caller, which is what makes
  admin tools genuinely invisible rather than listed-then-refused.
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

## Enabling it in Clerk — required before any client can connect

The code is live as soon as it deploys, but no client can complete a login until Clerk is
configured. As of this writing agendo's Clerk instance serves OAuth metadata but has **no
`registration_endpoint`**, i.e. dynamic client registration is off:

```bash
curl -s https://<your-fapi-host>/.well-known/oauth-authorization-server | grep registration_endpoint
```

For the Phase 0 spike, enable DCR in the Clerk Dashboard (OAuth applications), or:

```bash
npx clerk@latest api instance/oauth_application_settings -X PATCH -d '{"dynamic_oauth_client_registration": true}'
```

**DCR is a stopgap.** It is deprecated in the MCP spec and creates a public,
unauthenticated registration endpoint. Before real users connect (Phase 2), switch to
CIMD — Clerk's *CIMD Clients* tab, with Claude and ChatGPT allowlisted and unknown clients
blocked. Requesting CIMD beta access from Clerk support takes lead time; start it now.

## Verifying

No test suite in this repo; these were run by hand and are worth re-running after changes.

- **Protocol + permissions** — build a server with a synthetic caller and drive it with
  the SDK's own `Client` over `InMemoryTransport`: `tools/list`, `tools/call`, an
  admin-level tool hidden from a normal caller, a tool with no `level` failing to
  register, a throwing handler returning `isError` without killing the connection.
- **HTTP surface** — import the real `app.js` on a spare port and check: the discovery
  documents, that `resource` follows `x-forwarded-proto`, `401` + a
  `WWW-Authenticate: Bearer resource_metadata="…"` challenge with no token, `401` with a
  bogus one, and that an `OPTIONS /mcp` preflight from `https://claude.ai` is answered
  with `Access-Control-Allow-Origin: *` (this is the check that catches the global-CORS
  ordering trap).
- **A real client against the deployed instance.** Local success does not prove the OAuth
  discovery flow. Phase 0 is not done until a Claude client completes login against Render
  and `whoami` returns the right name, role and timezone — and until a `type: "normal"`
  user confirms admin tools are both hidden and refused.

## Remove it

1. Delete this folder (`calendar-api-backend/src/mcp/`).
2. In `app.js`, delete the `mountMcpRoutes` import and its call.
3. `npm uninstall @modelcontextprotocol/sdk`.
4. In the Clerk Dashboard, turn dynamic client registration back off and revoke any
   authorized OAuth clients.

No other part of agendo imports this module. It reads `services/authz.js` and
`middlewares/addRequestId.js`; it writes nothing.
