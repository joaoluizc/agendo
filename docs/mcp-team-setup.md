# Connecting Claude Desktop to agendo

_For anyone on the support team who wants to ask Claude about the schedule. Takes about
two minutes. Nothing here is secret — you can paste this whole page into Slack._

agendo speaks [MCP](https://modelcontextprotocol.io), so a Claude client can query the
schedule directly: who is on which position, how many hours someone worked, where the
coverage gaps are. You see exactly what you would see in agendo in a browser, as yourself.

## What you need first

- **Claude Desktop**, signed in with your Duda account.
- **Node.js** installed (`node --version` should print something). It is what runs the
  small bridge program that connects Claude to agendo.
- **An agendo account.** If you can open agendo in a browser, you have one.

You do *not* need an admin to approve anything. That approval is only required for the
claude.ai connector directory, which is a later step for the whole org.

## Step 1 — add agendo to your Claude config

Open your Claude Desktop config file:

- **macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

If the file does not exist, create it with exactly the content below. If it does exist, it
already has an `"mcpServers"` section — add the `"agendo"` block inside it, next to
whatever is already there.

```json
{
  "mcpServers": {
    "agendo": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://agendo-backend.onrender.com/mcp",
        "3334",
        "--client-metadata-url",
        "https://agendo-backend.onrender.com/mcp-client.json"
      ]
    }
  }
}
```

That is the whole configuration. There is no client id, no secret, no token, and no file
to download — which is deliberate, not an omission. See
[Why there are no credentials here](#why-there-are-no-credentials-here).

## Step 2 — restart Claude and log in

Quit Claude Desktop completely and reopen it. A browser tab opens asking you to sign in
with Google, then shows a Clerk consent screen. Approve it.

That is the only time you have to log in. The connection renews itself afterwards.

## Check that it worked

Ask Claude:

> Using agendo, who am I?

You should get your own name, your email, your access (whether you are an admin, and your
level in each area), and your timezone. That single answer proves the whole chain — Claude → Google → Clerk → agendo →
your user record.

Then try something real:

> Using agendo, does anyone have development time this week?

## What you can do depends on your access

Everyone can ask about **their own schedule**.

With **Scheduling: view** (most people) you can also read anyone else's schedule, who is
covering a given moment, and totals over any period, filtered by person, location, position
or status.

With **Scheduling: edit** you also get tools to create, change and delete shifts and to
find coverage gaps. These are limited to **draft** shifts — nothing Claude does can touch a
published schedule or Google Calendar. Without that level, those tools are not merely
refused, they are not offered: Claude cannot see that they exist.

Your access comes from agendo itself, the same place the website gets it — an agendo admin
sets it in Settings → Users. Connecting through Claude gives you no access you did not
already have.

## When your access changes

You never need to reinstall or log in again. agendo checks your access on every request.
What can lag is Claude's own list of tools:

- **Claude Desktop** — fully quit it (from the tray or menu bar, not just closing the
  window) and reopen it. No login needed.
- **Claude Code** — start a new session, or run `/mcp` and reconnect.
- **claude.ai** — use "Refresh tools list" on the connector, or wait: it caches the list for
  about an hour.

If you lose access to a tool, Claude may still offer it until it refreshes; using it then
just returns a message saying what access it needs.

## If something goes wrong

**"Callback port 3334 is already in use"** — another MCP bridge has that port. Change
`"3334"` in your config to `3335` or `3336` and restart Claude. Those are the only other
ports that will work.

**A browser tab opens and says the redirect URI does not match** — you changed the port to
something other than 3334, 3335 or 3336. Put it back.

**Login works, then agendo says you are not authorized** — your Google account signed in
fine but has no matching agendo user, or an email outside `duda.co`. Ask Joao.

**Nothing appears in Claude at all** — check the config file is valid JSON (a missing
comma is the usual cause) and that you fully quit Claude rather than closing the window.

## Why there are no credentials here

The bridge identifies itself to Clerk by a URL — `/mcp-client.json`, served by agendo —
instead of by an id and secret pasted into your config. This is a standard called CIMD
(Client ID Metadata Documents), and it is better here for three reasons:

- **Nothing to leak.** A program running on your laptop cannot keep a secret, so a shared
  client secret would have been a secret in name only, sitting in plain text on everyone's
  machine.
- **Nothing to rotate.** Changing a shared secret would have meant every person editing
  their config on the same day.
- **It stays revocable.** Clerk keeps an allowlist of which client URLs may ask for a
  token, so this specific bridge can be cut off centrally without touching anyone's setup.

What still protects agendo is unchanged: Google only lets Duda accounts sign in, Clerk has
to admit the client, you have to complete a real login, and agendo checks your own user
record for every single call. Removing your agendo user cuts this off immediately.

## For whoever administers the Clerk instance

One-time, in the Clerk dashboard, on the **production** instance:

1. **OAuth applications → Settings → Client onboarding → Publish CIMD support.**
2. **Client admission → Pre-registered clients only.**
3. **Applications → Add application → Pre-register CIMD client**, with client ID
   `https://agendo-backend.onrender.com/mcp-client.json` and the scopes `openid`,
   `profile`, `email`, `offline_access`. Then **Allow client**, which makes Clerk fetch
   and validate the document.

If the document later changes (for example, to add a callback port), use **Refresh
metadata** on that entry rather than waiting for a cache to expire.

Keep "pre-registered clients only" on. Without it any client that can serve a metadata
document may start a login — still only for Duda accounts with agendo users, but with no
record of which software asked.
