# Plan: Zendesk tools in agendo's MCP server

_Read-only Zendesk access for the support team, inside the existing agendo MCP server._

_Draft, 2026-10-15. **Phase 1 is built** (on branch `feat/zendesk-mcp`, not yet merged or
deployed); Phases 2–4 are not. Status per decision is in the table below._

## Goal

Let the support team ask Zendesk questions from their own Claude clients ("what changed on
this ticket and which trigger did it?", "which automations touch tag X?", "what is in the
escalations view?") through the MCP connection they already have for agendo, without a
paid third-party Zendesk connector that meters calls and holds Duda's tickets.

**Read-only for now.** Writes are a later, separate decision (see "Later").

## The guiding principle: two systems, never confused

This connector is called "agendo", and a model reading its tool list has no reason to
suspect it also reaches Zendesk. Two sets of tools sit side by side and share vocabulary
that means different things in each system. Every design choice below serves one
question: **can the model, and the person, always tell which system a tool acts on?**

Words that collide, and must be defined wherever the model reads them:

| Word | In agendo | In Zendesk |
| --- | --- | --- |
| agent | a support team member on the schedule | a Zendesk user with the agent role (same human, different system, different id) |
| ticket | not a concept (shift "coverage" is about being available for tickets) | a customer conversation |
| queue / view | not a concept | a saved ticket filter |
| user | an agendo account | a Zendesk person, customer or staff |

## What this took from the prototype

A Zendesk MCP prototype was built outside this repo (Python, local stdio, one person's
token). It was never run against a real account, and its code is not reused: agendo's server
is Node, remote and per-person authorized. Its _design_ is.

| Taken as-is | Adapted | Dropped |
| --- | --- | --- |
| The HTTP layer can only send GET. Credentials go only to the account's own Zendesk host. Retry on 429/5xx, honouring a capped `Retry-After`. Actionable 403 messages. A size cap that withholds the next-page cursor when it truncates, so nothing is skipped silently. Ticket text flagged as untrusted, internal notes hidden by default. Audit author `-1` means automation. | A status tool, but about the _shared Zendesk user_, not the caller. 41 tools become a task-shaped set of about a dozen. | Python and stdio. Per-person Zendesk OAuth. A "writes allowed" environment switch (there is no write path at all). A generic `GET any /api/v2/ path` tool. Chat and agent availability (a separate credential, with a single-use refresh token that has already broken another service once). |

## Decisions

| # | Decision | Status |
| --- | --- | --- |
| 1 | Zendesk tools live in **this** MCP server, not a second connector. | Decided |
| 2 | **Read-only.** Enforced structurally: the client module has no function that sends anything but GET, and a test pins it. | Decided; mechanism proposed |
| 3 | **Credential: reuse the existing `ZD_SUBDOMAIN` / `ZD_API_EMAIL` / `ZD_API_TOKEN`** (already used by the Jira-backlog feature). No new secret, no Render change. | Decided 2026-10-15 |
| 4 | A new permission area **`zendesk`**, levels `none` and `view`, default `none`. Admins get it through the admin flag. | Built (Phase 1) |
| 5 | Every Zendesk tool is named `zendesk_*`; agendo's existing tool names do not change, but their titles and descriptions now say `agendo`. | Built (Phase 1) |
| 6 | **Task-shaped tools** (about 12), not a 1:1 mirror of the Zendesk API. | Proposed |
| 7 | New module, own config reader (same env var names); does not import from `jiraBacklog/`. | Built (Phase 1) |
| 8 | No generic passthrough; no account-administration endpoints. | Built (Phase 1: nothing exposes either) |
| 9 | The connector's title is **"Agendo + Zendesk"** (the server `title`; its `name` stays `agendo`). | Decided 2026-10-15; built |

### What decision 3 costs

A Zendesk API token has **no scope**: it can do whatever its owner can. So:

- "Read-only" is only as strong as our code. Zendesk would let the token write, and
  would not notice.
- Everyone with `zendesk:view` reads with the **token owner's visibility**, whatever
  their own Zendesk role is. If the owner is an admin, that is admin-level read.
- Zendesk's own audit attributes every read to the token owner, not the person asking.
  **agendo's tool-call log is the record of who asked.**
- The token is shared with the Jira-backlog sync, so revoking or rotating it for one
  purpose affects the other.

That is acceptable for read-only, provided the exposure is an allowlist of tools rather
than "anything the token can reach" (decision 8). The first thing the status tool reports
is who the token belongs to and what role they have, so this stops being a guess.
Upgrading to a dedicated token, or an OAuth token with the `read` scope, later is a change
to one file (`lib/zendeskClient.js`).

## Discoverability design

1. **`zendesk_` prefix on every tool.** The namespace clients show comes from whatever
   name each person gave the connector, so the prefix is the one signal that survives in
   every client.
2. **Descriptions open with the system**: `[Zendesk, read-only]` or `[agendo scheduling]`.
   Titles carry it too ("Zendesk: get ticket"). Existing agendo descriptions get the
   `[agendo scheduling]` opener.
3. **Annotations**: Zendesk tools set `readOnlyHint: true` and `openWorldHint: true`
   (they reach an external system); agendo's keep `openWorldHint: false`.
4. **Server `instructions` as two labelled sections.** The full Zendesk section goes only
   to callers who have `zendesk:view`: it states that Zendesk reads happen as one shared
   service user, defines the colliding words above, and says ticket text is
   customer-written and untrusted. Callers without it get one line saying there are no
   Zendesk tools for them and where an admin grants access, so a model asked for ticket
   data explains that instead of hunting for tools that are not there. (The plan first said
   "nothing"; one line is more useful and reveals nothing.)
5. **`whoami` stays agendo's**, and lists the Zendesk level like any other area. The
   Zendesk status tool is separate and says plainly that it describes the shared user.
6. **Server title is "Agendo + Zendesk"**, with a one-sentence `description` naming both
   systems, set on the server's `Implementation` (the SDK supports `title` and
   `description`). **Not yet seen in a real client:** whether Claude Desktop, claude.ai and
   Claude Code display it is the first thing to check after deploying.
7. **No tool spans both systems.** A question that needs both ("who is on shift and how
   many open tickets do they have?") is composed by the model from one call to each.
8. **Team setup doc** names the connector in a way that says what it contains.

**Fallback if the above is not enough:** the same code can be mounted as a second
endpoint and added as a separate "Zendesk" connector. Tools already live in their own
modules, so this stays cheap to do later. It costs each person a second login, so it is
not the starting point.

## Security design

- **Permission area.** `zendesk:view` gates every Zendesk tool through `registerTool`'s
  mandatory `requires`, so a person without it never sees the tools. Default `none`: this
  area is new, not carved out of an existing one, so no backfill is needed. `edit` can
  be added later without touching stored values.
- **Read-only is structural.** One `get()` function; no `method` parameter anywhere; a
  test that fails if any request is not GET.
- **Host pinning.** The base URL comes from `ZD_SUBDOMAIN` (validated as a bare
  subdomain). No tool is ever given a URL to fetch: a full address is refused outright, and
  a pagination cursor is an opaque value passed as a parameter. Attachment downloads, if
  ever added, do not forward credentials across
  a redirect.
- **Exposure is an allowlist.** Excluded on purpose: account audit logs, API-token
  listings, account settings, any admin-only configuration beyond the rule and field
  listings below, and bulk user listings.
- **Untrusted content.** Ticket text is written by customers and outsiders, and shares a
  session with agendo's draft-write tools. Mitigations: wrap ticket text with an explicit
  untrusted marker, hide internal notes unless asked, and rely on agendo's writes being
  drafts only and gated by `scheduling:edit`.
- **Logging fails closed.** `registerTool` logs every call's arguments. A Zendesk search
  query or a customer's name can be an email address, which would land in Render's logs.
  `registerZendeskTool` therefore makes redaction the default: a tool lists only the
  arguments safe to log (`logArgs`), and every other argument is logged by size. Errors carry
  a separate `logMessage` without anything Zendesk echoed back, because a rejected search can
  quote its query. This touches the auth perimeter (`registerTool`), so it was reviewed
  independently (see "Review").
- **Rate limit.** Zendesk's limit is per account and plan-dependent, and is shared with
  every other integration on Duda's Zendesk, including the Jira-backlog sync. The client
  therefore keeps a process-wide budget (100 a minute) with a smaller share per person
  (30), so one person's runaway loop cannot lock out the team; caps concurrency with a
  bounded queue; puts one deadline over every attempt of a call; honours `Retry-After` and
  cancellation; sets modest page sizes; and (Phase 2) caches rarely-changing lookups
  briefly. The budget is per process, so a second Render instance would double it.
- **What the client will fetch.** Only plain `/api/v2/` paths from a tight character
  allowlist; never a full URL. This is a backstop, not the design: the design is that a
  model-supplied value never chooses the endpoint (see Phase 2 requirements).

## Review

Phase 1 was reviewed by an independent agent given the code and no conclusions (2026-10-15).
Nothing high-severity. Fixed from it: the path allowlist (encoded separators such as `%2f`
passed the old prefix check unchanged, and a pagination URL was accepted from callers); the
per-person share of the budget; the overall deadline, bounded queue and cancellation;
redaction made fail-closed and error text kept out of logs; the untrusted-text fence moved to
a random per-block id after lookalike characters beat the closing-tag blocklist; a body
that fails mid-read is retried instead of reported as "not JSON"; and a test pinning that
only `tools/zendesk.js` mentions the client.

A second pass over those fixes (same reviewer, again given the code, not my conclusions) found
no high or medium issues and confirmed the first-pass fixes. It found gaps in the fixes
themselves, now closed: one person's burst could fill the shared queue (each person now holds
at most 6 of its 24 places), and a refused, cancelled or timed-out request still spent budget
(it is now refunded); cancelling while queued or waiting on budget was not prompt (it is now);
tool handlers were handed the SDK's whole `extra`, which carries the caller's bearer token
(they now get only the cancellation signal); `logArgs` could name a free-text field (it now
refuses anything but a number, boolean, enum or literal); and an unexpected error in a
Zendesk tool was logged with its text (it is now logged generically). It also showed which
tests would not have noticed a regression; those were added, including one that pins where
the fence's id comes from. Deferred to Phase 2 and listed there: the path helper, one
deadline per tool call, and a shared 429 back-off.

Not fixed, by design, and worth confirming:

- **Admins get `zendesk:view` automatically**, now and for every future admin — a privilege
  expansion on deploy. It follows how every area works here, but it is a decision.
- **The status tool shows the shared Zendesk user's name**, role and ticket access to
  everyone with `view`. If the token belongs to a real person, that is their name on
  display. It never shows the email or the token.
- **`view` is one coarse level.** Phase 4's bulk export would reach everyone who already has
  it without a re-grant; consider a separate level then.
- **The stale-tool stub confirms a tool exists** to someone who calls it without access. This
  is existing behaviour for every tool, and nothing in it is beyond the public repo.
- **Fixtures are synthetic.** This repo is public: no real tickets, customers, rule names
  or subdomain in tests, docs or commit messages.

## Tool surface (provisional)

The list is provisional because it should be checked against the tool table of the
third-party connector this replaces, so nothing the team uses is missed. All are
`zendesk:view` in v1.

| Tool | Answers |
| --- | --- |
| `zendesk_connection_status` | Which Zendesk account and shared user this runs as, that user's role, current rate-limit headroom |
| `zendesk_search_tickets` | Find tickets by status, tag, requester, group, dates, text |
| `zendesk_get_ticket` | One ticket with comments (internal notes opt-in) and names instead of ids |
| `zendesk_get_ticket_audits` | What changed on a ticket, and which trigger, automation or macro did it |
| `zendesk_get_ticket_metrics` | Reply, resolution and wait times for a ticket |
| `zendesk_find_people` | Customers, organizations and staff, by name or email |
| `zendesk_find_automation_rules` | Triggers, automations and macros that mention a tag, field or text |
| `zendesk_list_views` | Views, their ticket counts and contents |
| `zendesk_get_ticket_setup` | Ticket fields, forms and user fields |
| `zendesk_search_help_center` | Help Center articles, with translations |
| `zendesk_export_tickets` | Bulk incremental pull, for analysis beyond what search returns |

Response shaping follows the rules `mcp-server-plan.md` set for agendo: hard row caps
with an explicit "N more omitted", names rather than ids (resolved server-side), and every
timestamp rendered in the caller's timezone with the zone stated.

## Architecture

Self-contained additions inside `calendar-api-backend/src/mcp/`, no new dependency:

```
mcp/
├── lib/
│   ├── zendeskClient.js   GET-only, host-pinned, rate-limited, retrying
│   └── zendeskShape.js    trimming, size cap, untrusted wrapper, id -> name
└── tools/
    └── zendesk*.js        one file per area (tickets, people, rules, help center)
permissions/registry.js    + the `zendesk` area
```

`server.js` registers them, and its `INSTRUCTIONS` become the two-section text above. The
frontend's admin editor picks the new area up from the registry; no UI work.

To remove it: delete the `zendesk*` files, the registry entry, and the instructions
section. Nothing else imports them.

## Phases

1. **Foundation. Built; awaiting security review, merge and deploy.** The `zendesk`
   permission area (registry, backfill, the frontend's mirror in `permissions.ts`), the
   GET-only client, shaping helpers, `registerZendeskTool`, `zendesk_connection_status`,
   the discoverability changes to instructions, titles and descriptions, fail-closed log
   redaction (`registerTool` and the Zendesk wrapper), and tests. After deploy, verify with a real client,
   including someone without `zendesk:view`. This phase answers "whose visibility are we
   using?" for real.

   Not done in Phase 1, deliberately: the team handout (`docs/mcp-team-setup.md`) still
   describes agendo alone. Announcing Zendesk before it does more than report its own
   status would mislead; update it with Phase 2.
2. **Tickets.** Search, get, audits, metrics. Requirements carried over from the Phase 1
   review, because this is the first phase with a tool that takes a model-supplied value:
   - **Fixed path templates.** Each tool owns the path it fetches, with any id validated as
     digits before it is placed in the path. A model-supplied string never becomes part of a
     path, a query *key*, or a URL.
   - **Cursors are opaque values**, taken from `meta.after_cursor` and passed back as
     `page[after]` on the same fixed path. Never a URL, which `get()` refuses anyway.
   - **An inline form for short outsider fields.** `untrusted()` fences multi-line blocks
     (a comment, an article). A requester's name, a subject, a tag, a custom-field value or an
     attachment filename sit on a structured line and need their own marked form; until it
     exists no tool prints them bare. The `source` label on a fence is written by code only.
   - **Declare `logArgs` deliberately.** Only a number, boolean, enum or literal field can be
     listed (the wrapper refuses a free-text field), so this is a check, not a promise.
   - **A path helper that validates ids.** The client's allowlist is character-level: it would
     let a tool fetch `/api/v2/audit_logs.json` if one asked. Which endpoints are read is
     decided by each tool's fixed path, so make that structural: a small `zendeskPath`
     template helper that accepts only digit ids and rejects everything else, rather than
     string-building paths in each tool.
   - **One deadline per tool call.** A tool that makes several requests computes one
     `deadlineAt` and passes it to each (`get(path, params, { deadlineAt })`), so the tool is
     bounded as a whole and not request by request.
   - **A shared 429 back-off.** Zendesk's limit is account-wide, but each call retries on its
     own. When any call is told to slow down, the others should pause too, rather than each
     discovering it separately.
   - **Say what the fence's id means** in the first line of any answer carrying outsider text
     (`UNTRUSTED_NOTICE`); the server instructions already do.
3. **People and configuration.** People lookup, automation rules, views, fields and forms.
4. **Help Center and export.**

Each phase ships on its own, and a security review precedes any change to
`registerTool.js`.

## Verification

- **Offline tests** with a mocked `fetch` and synthetic data: every request is GET;
  any full address, encoded separator or traversal in a path is refused; a truncated page withholds its
  cursor; 429 is retried and a long `Retry-After` becomes an error; the tool list per
  access level (extend `mcp.test.js`).
- **A local run** against a sandbox Zendesk account, using a dev `.env`.
- **A real client against the deployed instance**: a person without `zendesk:view` sees no
  `zendesk_*` tool, and one with it gets a sensible `zendesk_connection_status`.
- **A discoverability check**, by hand: about ten prompts that deliberately straddle both
  systems ("who is covering at 3pm" is agendo; "what is waiting in the queue" is Zendesk;
  "show ticket N and who is on shift") and a note of which tool the model picked and why.
  If it picks wrongly, fix the wording before adding tools.

## Open questions

1. The tool table of the third-party connector being replaced, to confirm the list above.
2. Who owns the `ZD_API_TOKEN`, and with what Zendesk role? (Phase 1's status tool will say.)
3. Does the Zendesk plan allow a custom, read-only role? Only relevant if the credential
   decision is revisited.
4. Does the Render deployment point at production Zendesk or a sandbox?

## Later

- A dedicated token, or an OAuth token with the `read` scope, if the shared token's reach
  becomes uncomfortable. OAuth clients created from 2026-04-30 get 30-minute tokens with a
  refresh token, so that route needs somewhere to store a rotating secret.
- Per-person Zendesk identity, so Zendesk's own audit shows who asked.
- Writes, behind a separate `zendesk:edit` level, with confirmation, and **never deletes**.
  Note `levelOf` gives an admin the top level of every area, so adding `edit` to the
  `zendesk` area would hand it to every admin at once. Decide that on purpose (an
  exception in `levelOf`, or a separate area) rather than discovering it.
