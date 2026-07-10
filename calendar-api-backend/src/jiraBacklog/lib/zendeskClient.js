import { zendeskConfig, assertZendeskConfig } from "./config.js";

/**
 * Server-side Zendesk client for the MRR-resolution feature: given a Jira issue key, find
 * the Zendesk tickets linked to it and their requester's email.
 *
 * Source of truth: Zendesk's "Jira Links" API (`/api/v2/jira/links`) — the live table the
 * Zendesk-Jira app maintains (verified: rows appear within minutes of linking). Two catches,
 * both verified against Duda's instance:
 *
 *  - Despite the docs claiming `filter[ticket_id]` accepts "a ticket id or issue id", it only
 *    matches *Zendesk ticket ids* — filtering by a Jira issue id returns nothing, and
 *    filtering by issue key isn't supported at all. So a reverse lookup (Jira -> tickets)
 *    has to fetch the whole table and index it by issue_key. That's ~18k rows = 18 paginated
 *    requests, so the map is cached in-process (LINKS_CACHE_MS) — the bulk sync pays the cost
 *    once for every bug, cheaper than even one search per bug.
 *  - Rows from the pre-2016 era carry `issue_key: null` (only issue_id). Those are skipped:
 *    the backlog stores keys, and decade-old links are irrelevant to current bugs.
 *
 * (An earlier version searched tickets full-text for the Jira key — the sync bot posts a
 * comment mentioning it on *most* linked tickets. That misses links with no bot comment,
 * e.g. SUP-7002 <-> ticket 1905190, and can over-match tickets that merely mention a key;
 * the links table has neither problem.)
 */
function authHeader() {
  const basic = Buffer.from(`${zendeskConfig.apiEmail}/token:${zendeskConfig.apiToken}`).toString("base64");
  return `Basic ${basic}`;
}

async function zendeskGet(path) {
  const url = `https://${zendeskConfig.subdomain}.zendesk.com${path}`;
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: authHeader(), Accept: "application/json" } });
  } catch (err) {
    throw new Error(`Zendesk request failed: ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[jira-backlog][mrr] Zendesk ${res.status} for ${path}: ${body.slice(0, 300)}`);
    throw new Error(`Zendesk returned an error (HTTP ${res.status}).`);
  }
  return res.json();
}

// How long a fetched links map stays fresh. Long enough that one bulk sync run reuses a
// single fetch; short enough that a manual per-row refresh sees recently-created links.
const LINKS_CACHE_MS = 10 * 60 * 1000;

let linksCache = null; // { map: Map<issueKey, string[]>, fetchedAt: number }

/**
 * Fetch the full Jira-links table and index it by Jira issue key (uppercased). Paginates
 * with the cursor API (page[size]=1000); result is cached for LINKS_CACHE_MS.
 */
async function fetchJiraLinksMap() {
  if (linksCache && Date.now() - linksCache.fetchedAt < LINKS_CACHE_MS) return linksCache.map;

  const map = new Map();
  let path = `/api/v2/jira/links?page%5Bsize%5D=1000`;
  for (let page = 0; page < 100 && path; page++) {
    const data = await zendeskGet(path);
    for (const link of data?.links || []) {
      if (!link.issue_key || !link.ticket_id) continue; // pre-2016 rows carry issue_key: null
      const key = String(link.issue_key).toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(String(link.ticket_id));
    }
    // after_cursor is a full URL; keep only path + query (zendeskGet prepends the base).
    const after = data?.meta?.has_more ? data?.meta?.after_cursor : null;
    path = after ? after.replace(/^https?:\/\/[^/]+/, "") : null;
  }

  linksCache = { map, fetchedAt: Date.now() };
  console.log(`[jira-backlog][mrr] Jira-links map refreshed — ${map.size} issue key(s)`);
  return map;
}

/**
 * The Zendesk tickets linked to a Jira issue key (e.g. "SUP-6378"), from the links table.
 * Returns an array of ticket id strings; empty when the key is blank or has no links.
 */
export async function findLinkedZendeskTicketIds(issueKey) {
  assertZendeskConfig();
  if (!issueKey) return [];
  const map = await fetchJiraLinksMap();
  return map.get(String(issueKey).toUpperCase()) || [];
}

/**
 * The requester's email + the ticket's Zendesk organization id, via a sideloaded user lookup
 * (one request, no separate /users/:id call). The organization id is what MRR overrides match
 * on (see mrrOverrideModel.js) — orgs group all of a client's requester emails, so they
 * identify enterprise clients whose ticket emails aren't Duda accounts (e.g. 1&1/IONOS).
 * Returns { email: "", organizationId: null } parts when the ticket/requester can't be found.
 */
export async function fetchTicketRequester(ticketId) {
  assertZendeskConfig();
  const data = await zendeskGet(`/api/v2/tickets/${encodeURIComponent(ticketId)}.json?include=users`);
  const requesterId = data?.ticket?.requester_id;
  const users = Array.isArray(data?.users) ? data.users : [];
  const requester = users.find((u) => u.id === requesterId);
  const organizationId = data?.ticket?.organization_id;
  return {
    email: requester?.email || "",
    organizationId: organizationId == null ? null : String(organizationId),
  };
}
