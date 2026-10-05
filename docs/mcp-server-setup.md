# agendo MCP server — status and setup

_Companion to [`mcp-server-plan.md`](./mcp-server-plan.md), which covers design and
rationale. This one covers what exists today, what the moving parts actually do, and what
has to happen next. Written 2026-08-17._

## Where things stand

**Phase 0 (the auth spike) is built in code and verified locally. Nothing is deployed and
no client can connect yet.**

The backend now serves four routes:

| Path | Who can call it | What it does |
| --- | --- | --- |
| `/.well-known/oauth-protected-resource/mcp` | anyone | Tells a client "to talk to me, get a token from Clerk" |
| `/.well-known/oauth-protected-resource` | anyone | Same, bare form some clients probe first |
| `/.well-known/oauth-authorization-server` | anyone | Mirrors Clerk's own OAuth details |
| `/mcp` | a signed-in agendo user | The MCP endpoint itself. One tool: `whoami` |

The three `.well-known` routes are public on purpose — that is how a client with no token
finds out where to send you to log in. They expose no agendo data.

Code lives in `calendar-api-backend/src/mcp/` (see its README). `app.js` gained one line.
Verified locally: the protocol works over real HTTP, a request with no token gets a 401
with the right challenge, a bogus token is rejected, browser preflight requests aren't
blocked by agendo's Vercel-locked CORS policy, and the permission wrapper refuses to
register a tool that doesn't declare whether it's admin-only.

## The mental model: two separate questions

Most of the confusion in this area comes from mixing these up. They have different answers
and different enforcement points.

**1. Which _person_ is allowed in?** Unchanged from the web app, and enforced in three
places that each fail closed:

- Clerk login is Google-only, and agendo's Google Cloud OAuth app is marked *Internal*, so
  Google itself refuses consent for anyone outside Duda's Workspace.
- The Clerk account must map to a user document in agendo's Mongo. No document, no access.
  **This is your kill switch** — deleting the Mongo user cuts MCP access immediately,
  without touching Clerk or Google. It belongs in the offboarding checklist.
- That user's email domain must be `duda.co` (overridable via `MCP_ALLOWED_EMAIL_DOMAINS`).

Admin vs. normal also comes from Mongo (`User.type`), same as the rest of agendo. Today
every tool is read-only; when write tools ship, only admins get them.

**2. Which _client program_ may ask for a token on that person's behalf?** This is the new
question, and it's what your Clerk OAuth application is about. "Client" here means the
software — claude.ai, Claude Desktop, Cursor, ChatGPT — not the human.

Your instinct in asking was right, but the framing to drop is "a generic OAuth app that
any LLM can connect to". No client can connect on its own: every connection still requires
a real person completing a Google login and landing on a Clerk consent screen. The
registration question is narrower — *which software is allowed to run that flow*.

## Three ways a client gets identified

OAuth was designed for a world where you know your clients in advance and register each
one by hand. MCP broke that assumption: there are many client programs and you don't
control them. Three answers exist, and Clerk supports all three.

| | How it works | Trade-off |
| --- | --- | --- |
| **Pre-registration** _(what you did)_ | You create an OAuth application in Clerk by hand. It gives you a **client ID** and a **client secret**. You paste those into the one client you want to allow. | Simplest and tightest. But you must know the client's redirect URL in advance — which rules out desktop apps (see below). |
| **DCR** (Dynamic Client Registration) | You flip a switch and Clerk exposes a public endpoint where any client can register itself and get its own credentials, unprompted. | Works with everything, no setup per client. But it's a public, unauthenticated endpoint anyone on the internet can call, with no record of who. Deprecated in the MCP spec. |
| **CIMD** (Client ID Metadata Documents) | The client's ID *is* an HTTPS URL that serves a small JSON file describing it (`{"client_name": ..., "redirect_uris": [...]}`). Clerk fetches that file and verifies it. Clerk's dashboard then lets you allowlist specific ones and block unknown clients. | The allowlist model — the "configure which apps may connect" idea you described. **Generally available at Clerk since 2026-09-17**: self-serve in the dashboard, on every application, off until you switch it on. |

The MCP spec's order of preference is pre-registration → CIMD → DCR. **You went straight to
the best option.** My earlier suggestion to enable DCR was the quick way to get a spike
running; it is no longer needed if the client you're spiking with is claude.ai.

### The catch with pre-registration

At the end of a login, the authorization server redirects the browser back to the client
at a URL the client declared. Clerk will only redirect to URLs you registered on the app —
that's what stops someone else pointing your app at their own server.

- **Web clients** (claude.ai, chatgpt.com) redirect to a fixed HTTPS URL on a domain nobody
  else can impersonate. Perfect fit: register it once, done.
- **Desktop clients** (Claude Desktop, Claude Code, Cursor) redirect to
  `http://localhost:<port>/callback`, and the port varies per launch. You can't list those
  in advance, so pre-registration doesn't work for them — they need DCR or CIMD.

So: **spike with claude.ai in a browser and you never need to enable DCR at all.** When
the team wants Claude Desktop or Cursor, enable CIMD rather than falling back to DCR —
and as of 2026-09-17 that is a dashboard toggle, not a support request:

1. OAuth applications → Settings → **Client onboarding** → **Publish CIMD support**.
2. **Client admission** → **Pre-registered clients only**.
3. Applications → **Add application → Pre-register CIMD client** for each client you
   trust, with the scopes it may request.

Because it is off by default and changes nothing until enabled, turning it on does not
disturb the pre-registered claude.ai app already working.

One honest caveat, from the plan: allowlisting is strong for web clients and weak for
desktop ones. Any local program can listen on `localhost` and run the flow under a trusted
client's identity. That's inherent to desktop OAuth, not a Clerk flaw, and CIMD doesn't fix
it either. Worth knowing; not worth blocking on, given the data is shift schedules and MCP
grants nothing a user can't already see in the browser.

## Prerequisites before anything can connect

Roughly in order. None of these are code changes.

**1. Know which Clerk instance is which.** You now have an OAuth app on both. Clerk's
dashboard has a dev/prod switcher and they're completely separate installs:

- **Development** — `verified-bream-74.clerk.accounts.dev`, used by your local backend
  (the `pk_test_` key in `calendar-api-backend/.env`).
- **Production** — used by the deployed Render backend (the `pk_live_` key in Render's env
  vars). To see its hostname: base64-decode the part of the publishable key after
  `pk_live_`; the result is the host, with a trailing `$` to drop.

A client connecting to `agendo-backend.onrender.com` must use the **production** app's
credentials. Dev credentials only work against a locally running backend.

**2. Register the client's redirect URL on the app(s).** For claude.ai this is expected to
be `https://claude.ai/api/mcp/auth_callback` — confirm it rather than trusting that string:
Claude's connector dialog shows it, and if it's wrong Clerk rejects the login with a
redirect-URI-mismatch error naming the exact URL it received.

**3. Keep the client secret out of agendo.** agendo never sees it and doesn't need it — it
only validates tokens Clerk already issued. It goes into the *client's* connector settings
and your password manager. Not `.env`, not Render, not the repo.

**4. Make sure your own user is set up.** Your Clerk account needs a matching document in
Mongo with a `duda.co` email — `users` for production, `dev-users` for local. Note that
`ADMIN_BYPASS=1` does **not** apply to MCP (it's an Express-middleware flag), so local
testing uses your real `type`. That's deliberate: it's the only way role bugs show up
before production.

**5. Deploy.** The code is on the `feat/schedule-shift-dialogs` branch and isn't committed
yet. Until it ships to Render, `https://agendo-backend.onrender.com/mcp` returns 404 —
which is exactly what it does right now.

**6. Check the Render plan.** A free-tier instance sleeps after idling and takes ~30–60s to
wake. In a browser that's an annoyance; in an MCP client it reads as a hard failure, and
you'll debug auth that isn't broken. Yours answered in 0.4s when checked, so it was awake —
but that doesn't tell us the plan. Worth confirming in the Render dashboard.

## Connecting, and what success looks like

In Claude, add a custom connector pointing at `https://agendo-backend.onrender.com/mcp`,
and put the production app's client ID and secret in the OAuth fields. Discovery handles
the rest: Claude reads agendo's `.well-known` document, gets sent to Clerk, you complete
the Google login, and Claude comes back with a token that `/mcp` verifies on every call.

Then ask it to call `whoami`. Success is your own name, email, `Role: admin`, and your
timezone. That single response proves the entire chain — client → Clerk OAuth → Render →
agendo → Mongo user → role — which is the whole point of Phase 0.

Two failures worth recognising:

- **401 with no login prompt** → the client never got the discovery document. Check the
  `.well-known` URL loads in a browser.
- **Login succeeds, then 403** → OAuth worked and agendo rejected you: either no Mongo user
  for that Clerk id, or an email outside `duda.co`. Render's logs say which, on a line
  tagged `[mcp]`.

Every tool call is logged with request id, caller, client and arguments, so anything that
happens is reconstructable after the fact.

## After Phase 0

- **Phase 1 — read tools.** `get_my_schedule`, `get_agent_schedule`, `get_coverage_at`,
  and admin-only `find_coverage_gaps`. Where the actual value is.
- **Phase 2 — rollout.** Setup instructions for the team, revocation in offboarding, and
  CIMD switched on with an explicit allowlist once desktop clients are wanted (GA since
  2026-09-17 — no longer anything to wait for).
- **Phase 3 — admin write tools.** Creating and changing shifts, with a preview-before-acting
  default.

Read-only first is deliberate: real usage will reshape the write surface, and read-only is
a safe thing to be wrong about.

## Glossary

- **MCP** — Model Context Protocol. The standard that lets an AI client call tools on a
  server like this one.
- **OAuth application / client ID / client secret** — how Clerk identifies the *program*
  connecting, separately from the person using it.
- **Redirect URI** — where the authorization server sends the browser after login. Must be
  registered in advance, or the login is rejected.
- **DCR** — Dynamic Client Registration. Clients register themselves at a public endpoint.
  Convenient, unauthenticated, deprecated in MCP.
- **CIMD** — Client ID Metadata Documents. A client's ID is a URL serving its own metadata,
  which lets you keep an allowlist of specific clients. GA at Clerk since 2026-09-17.
- **Scopes** (`email`, `profile`, `offline_access`) — what the client asks Clerk for.
  `offline_access` is the one that matters day to day: it grants a refresh token, without
  which connections silently die when the access token expires. Scopes never decide what
  you may *do* in agendo — Mongo does.
