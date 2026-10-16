# Plan: Zendesk tools in agendo's MCP server

_Read-only Zendesk access for the support team, inside the existing agendo MCP server._

_Started 2026-10-15. **Phase 1 is merged (PR #53) and verified live.** Phase 2 is under way:
`zendesk_search_tickets` is merged (PR #54); ticket count, get ticket, conversation, attachment, and
user and organization search are built and reviewed, and none of Phase 2 has yet run against the
live account. Status per decision is in the table below._

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
| 6 | **API-shaped tools**: thin, filter-rich wrappers over Zendesk's API calls (structured filters, field selection, cursor paging), modelled on the connector the team uses today. The model composes them. *Replaces the earlier proposal of about a dozen task-shaped tools:* the task-shaped tools built for agendo's own schedule did not work well, and the model can combine API-shaped tools itself. | Decided 2026-10-16 |
| 7 | New module, own config reader (same env var names); does not import from `jiraBacklog/`. | Built (Phase 1) |
| 8 | No generic passthrough; no account-administration endpoints. | Built (Phase 1: nothing exposes either) |
| 9 | The connector's title is **"Agendo + Zendesk"** (the server `title`; its `name` stays `agendo`). | Decided 2026-10-15; built |
| 10 | The conversation shows **internal notes by default**, each labelled `internal`; `include_internal_notes: false` leaves them out. This matches the connector the team uses today; the first prototype hid them by default. Everyone with `zendesk:view` reads them. That is an agendo permission and is *not* tied to anyone holding a Zendesk seat or agent role, so the audience is wider than Zendesk's own; what exists to read is limited only by the shared Zendesk user's role. A comment that does not say whether it is public counts as not public. | Built; worth confirming (the reviewer would default to hiding them) |
| 11 | **Attachments are downloaded only if Zendesk's scan cleared them, only from Zendesk, only as an image or plain text, up to a size.** Everything else returns its details and says why not. | Built; worth confirming |

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
   `description`). **Checked 2026-10-16: Claude Desktop does not show it** for a connector
   added by hand to `claude_desktop_config.json`, which is labelled by its config key
   (here, `agendo`). It may show in clients that read the server's own title, such as an
   org connector in claude.ai, so it stays. Until then discoverability rests on the other
   levers: the `zendesk_*` names, the titles, the description openers and the instructions.
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

### Review of `zendesk_search_tickets`

The same reviewer, given the code and not my conclusions, found no high-severity issue: no
model value reaches a path, a parameter name or another host; the logs hold no customer data;
everything Zendesk sent is inside the fence. Fixed from it:

- **The query builder trusted ASCII.** A blocklist of ASCII quotes did nothing about smart or
  fullwidth quotes, folded characters, or separators such as U+2028, and with a stricter
  tokenizer than mine thousands of accepted values added a condition. It is now an allowlist,
  with NFKC-equality, and the property tests run under a harsher reading of Unicode.
- **An impossible date was silently moved** (`2026-02-30T10:00:00Z` became March 2). Dates are
  now checked as real calendar dates, years 1970–9998.
- **Own-voice lines were not purely the tool's own:** a Zendesk error's text could appear in a
  note, and a filter value with a line separator could reach the query echo. Notes now use
  the log-safe text, and the allowlist refuses separators.
- **JSON leaves some characters raw** (U+2028/2029, NEL, bidi controls, zero-width): they are
  now written as escapes.
- **Answer size was not bounded** as tightly as claimed: every field has a cap, people and
  organizations have their own budget.
- **Wrong answers that read as right:** a search of exclusions alone, `form` given an id,
  `none` where Zendesk does not document it, loose name matching (now flagged), unresolved ids
  (now counted), the direction of the page (now stated from its own timestamps), a cut page
  called "the last page".
- **The tests missed 28 of 38 deliberate breakages.** They now catch all 31 tried, including
  every size cap, id check, deadline and signal hand-off, and the caller key.

Open, by judgment: Zendesk's real handling of names and of the word limit is only knowable on
a live account; the query echo and the notes are the tool's words, so they stay outside the
fence, and now contain nothing a customer wrote.

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

### Review of the second batch (count, ticket, conversation, attachment, people)

The same reviewer, again given the code and not my conclusions, found no high-severity issue.
It could not make the credential go anywhere but the first attachment request, the byte cap
held, and 8.7 million accepted query values broke nothing under the strict reading. Fixed from
its medium and low findings:

- **Characters a reader cannot see.** `jsonLine` escaped what JSON requires and left terminal
  escapes (C1 and 8-bit CSI), Tag characters that hide ASCII, bidirectional overrides, joiners,
  variation selectors and fillers raw. Every control, format, private-use, separator and
  default-ignorable character is now written as an escape, in structured lines and in a file's
  text alike, built from Unicode property classes rather than a list.
- **The query allowlist let through values that read as nothing, or fuse.** A value that is all
  punctuation, holds an invisible character, or starts a word with a combining mark (which a
  grapheme-aware reader fuses to the quote before it) is refused; free text drops them; tags
  follow. The property tests now read under grapheme clusters, use a hostile alphabet with
  marks, selectors, fillers and Tag characters, and mix those into otherwise acceptable text so
  accepted values are exercised, not only refusals.
- **The client.** A trailing dot hid an internal name (`evil.localhost.`), and more internal-looking
  suffixes are now refused; a body declared too large, and the body of a redirect or an error,
  is cancelled instead of holding the connection; a redirect, the normal way a file is served, is
  no longer logged as a warning; a rate-limited download now says so and for how long; and the
  header comment, which still said redirects are never followed, is corrected.
- **The tools.** A NUL byte anywhere in a text file makes it binary (only the first 8 kB was
  checked); `image/jpg` is an image; comment visibility fails closed (only an explicit `true` is
  public, an unmarked comment is labelled `unknown` and kept out of the public thread); every
  list that is cut says how many were left out, and a bag of custom values is bounded in
  characters; a lookup that does not fit says to look up fewer ids instead of describing a
  cursor it does not have.
- **Tests that would not have noticed a regression** were added: a queued call that times out
  gives back its place and its budget, an expired deadline sends nothing, a download is cut at the
  deadline and not retried, every redirect status is followed, bodies are let go, the notice that
  explains the fence is present once before it, each kind of attachment is asked for under its own
  size limit, results without a usable id are counted, and cut pages of users and organizations
  withhold their cursor.

The tests were then checked by breaking 157 guarded behaviours on purpose (every size cap, id and
address check, deadline, cancellation, refund and signal hand-off, every class of hidden character,
and one or more per fix above): 151 are caught. The first pass missed ten; four of those got new
tests (a cancelled running call freeing its place twice, the content-type length bound, the
no-stream byte cap, free text keeping words with no letter or digit). The six that remain are
equivalent or redundant by construction: the abort check at the top of a call (the budget wait
makes the same check first), the one after the connection is won (only a microsecond race
window), the host's case-fold on a download address (the URL parser lowercases it), the bracket
checks on a redirect host (an IPv6 name has no dot, so the single-label check refuses it), the
conversation handler's second look at a cursor (the schema already refused it), and the
first-item guarantee of the size bound (no single item can exceed the budget at today's caps).
Not changed, by judgment, and worth confirming:

- **Internal notes are shown by default** (decision 10).
- **The redirect check narrows what a bad redirect can reach; it does not stop a public name that
  resolves to a private address.** The redirect is Zendesk's to give, not a customer's.
- **`view` still means every Zendesk tool.** Nothing here widened who has it.
## Tool surface

The tools mirror Zendesk's API (decision 6), using the connector the team uses today as the
reference for what to offer and how it answers. That reference is the pasted tool
description, until the prototype's own README table is in hand. All are `zendesk:view`.

**Built**

| Tool | Does |
| --- | --- |
| `zendesk_connection_status` | Which Zendesk account and shared user this runs as, that user's role and ticket access, the rate-limit headroom |
| `zendesk_search_tickets` | Structured filters in, tickets out; minimal fields unless more are asked for; optional people and organizations behind the ids; cursor paging |
| `zendesk_count_tickets` | The same filters, only a number |
| `zendesk_get_ticket` | One ticket by number, with a useful default; optionally the people, the organization and, for a problem ticket, its incidents |
| `zendesk_get_ticket_conversation` | The comments: author and side (customer, agent, system), public or internal, channel, text, attachments listed by id; cursor paging |
| `zendesk_get_ticket_attachment` | One attachment by id: an image as an image, a text file as fenced text; only what Zendesk's malware scan cleared, only from Zendesk, up to a size |
| `zendesk_search_users` | Users by structured filters, or by id |
| `zendesk_search_organizations` | Organizations by structured filters, or by id |

Details of each are in the MCP README.

**Next, in roughly this order** (each a thin wrapper, with the same conventions)

| Tool | Does |
| --- | --- |
| `zendesk_get_ticket_audits` | What changed on a ticket, and which trigger, automation or macro did it (author `-1` is automation) |
| `zendesk_get_ticket_metrics_summary` | Reply, resolution and wait times, aggregated, optionally split by group, brand, assignee, channel, week or month |
| `zendesk_get_satisfaction_ratings` | CSAT records |
| `zendesk_list_*` | Brands, ticket forms, triggers, permission groups, user segments; ticket fields only on request, since the full dump is huge |

Not yet decided: CSV output for bulk pulls (the reference connector offers up to 1,000 rows in
one string), the Help Center, and custom user and organization fields in search (Zendesk's
reference says only "use the field name as the keyword"). Response conventions hold for all of
them: hard caps with an explicit "N more not shown", timestamps with their zone (Zendesk's are
UTC with a `Z`), and everything Zendesk sent fenced as untrusted.

### What is built on Zendesk's documentation and not yet seen to work

Everything in Phases 1 and 2 was built from Zendesk's published documentation and stubbed
responses; no real tickets were pulled while building. These are the assumptions most worth
checking the first time each tool runs on the live account, in the order they are likely to matter:

- **Search order and counts.** That export search runs newest-first (the answer states which way
  the page runs, from its own timestamps), and that the count endpoint accepts `type:ticket` in
  its query and answers a number or `{ value, refreshed_at }`. The count should equal a search
  with the same filters.
- **Tag and date semantics.** That `require_tags` finds only tickets with *all* the tags, and that
  `>=`, `<` and `<=` with UTC instants bound a range as expected.
- **Conversation.** That `include=users`, `include_inline_images` and `sort=-created_at` work with
  cursor paging on the comments endpoint, and that the sideloaded users carry `role`.
- **Incidents.** That the incidents endpoint answers `tickets`, `count` and `next_page` with
  `per_page`; Zendesk's reference does not show it.
- **Attachments.** How an attachment's `content_url` is authenticated and where it redirects:
  the reference says neither. The download is written to work whether the first address needs
  credentials or only a token in its path, and whether it redirects to a CDN or not; the first
  live download will show which.
- **Lookups.** That `show_many` takes comma-separated `ids`, up to a hundred, for users and for
  organizations.
- **People search.** That the export endpoint accepts `filter[type]=user` and `organization`, and
  that `role:end-user` is how the end-user role is spelt in a query.
- **`ticket_type:` in an export query.** That the export endpoint does not reject the substring
  `type:` inside `ticket_type:` (it refuses a `type:` condition of its own). If it does, a
  ticket-type filter fails with a visible 400 and needs another spelling.

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

1. **Foundation. Merged (PR #53) and verified live 2026-10-16.** The `zendesk`
   permission area (registry, backfill, the frontend's mirror in `permissions.ts`), the
   GET-only client, shaping helpers, `registerZendeskTool`, `zendesk_connection_status`,
   the discoverability changes to instructions, titles and descriptions, fail-closed log
   redaction (`registerTool` and the Zendesk wrapper), and tests. After deploy, verify with a real client,
   including someone without `zendesk:view`. This phase answers "whose visibility are we
   using?" for real.

   Not done in Phase 1, deliberately: the team handout (`docs/mcp-team-setup.md`) still
   describes agendo alone. Announcing Zendesk before it does more than report its own
   status would mislead; update it with Phase 2.
2. **Tickets and people. Built:** search, count, get ticket, conversation, attachment, user
   search and organization search (the first by PR #54, the rest on branch
   `feat/zendesk-ticket-tools`). **Next:** audits, the metrics summary, satisfaction ratings and
   the lookup lists. Requirements carried over from the Phase 1 review, because these are the
   tools that take a model-supplied value:
   - *Done:* cursors are opaque values passed as `page[after]`; every id in a path goes through
     `zendeskPath`, which takes only a positive whole number, and an id in a lookup is refused
     if it is not one; the people and organizations behind a page are loaded by `show_many`
     with checked ids; one deadline covers each tool's requests; `logArgs` lists only
     enumerations, numbers and booleans; the customer text of every answer is one fenced block of
     JSON lines, with invisible and line-separator characters escaped.
   - *Still ahead:* a shared 429 back-off. Zendesk's limit is account-wide, but each call retries
     on its own; when any call is told to slow down, the others should pause too.
   - **Short outsider fields are fenced as a whole block, not one by one.** A requester's name,
     a subject, a tag, a custom-field value or an attachment filename sit on structured lines.
     Rather than an inline marker per field (which would bury a 100-ticket page in markup),
     `fencePayload()` fences the list once, with one random id, and every value is
     JSON-encoded so a newline in a value cannot start a line, a section or the end of the
     block. What a tool says for itself goes outside the fence. No tool prints such a field
     outside one. The `source` label on a fence is written by code only.
   - **Say what the fence's id means** in the first line of any answer carrying outsider text
     (`UNTRUSTED_NOTICE`); the server instructions already do.
   - **Attachments are the exception that proves the rule about redirects.** The JSON client
     never follows one; the download does, under its own rules (see the MCP README): a starting
     address on the configured Zendesk host under `/attachments/`, credentials on that first
     request only, redirects only to an https host that is a real name, a few hops at most, a byte
     cap, no retry, nothing about the address logged. Only a file Zendesk's malware scan found
     clean is downloaded, only an image (typed by its own bytes) or UTF-8 text, and only up to a size.3. **People and configuration.** People lookup, automation rules, views, fields and forms.
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
