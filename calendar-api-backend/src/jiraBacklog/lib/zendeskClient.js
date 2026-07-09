import { zendeskConfig, assertZendeskConfig } from "./config.js";

/**
 * Server-side Zendesk client for the MRR-resolution feature: given a Jira issue key, find
 * the Zendesk tickets linked to it and their requester's email.
 *
 * Zendesk's documented "Jira Links" API (`/api/v2/jira/links`) turned out NOT to be the
 * source of truth here — verified live against Duda's instance: the endpoint returns real
 * data (17k+ historical rows), but every row is from ~2015 and current Jira issues (e.g.
 * SUP-6378, linked-ticket count 2) return nothing. That legacy integration table appears to
 * have stopped being written to at some point, even though Jira's own linked-ticket count
 * (customfield_13671) keeps updating live.
 *
 * What actually works: Duda's Zendesk-Jira sync bot posts a comment on every linked Zendesk
 * ticket that mentions the Jira key (the mirror image of the "sent from JIRA to all linked
 * Zendesk Support tickets" comment it posts back on the Jira issue) — so a full-text ticket
 * search for the key finds them. Verified live: SUP-6378 (2 linked per Jira) → 2 found;
 * SUP-5180 (4 linked per Jira) → 3 found. It's a close match, not a guaranteed-exact one —
 * treat the result as best-effort, not authoritative.
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

/**
 * Find the Zendesk tickets referencing a Jira issue key (e.g. "SUP-6378"). Returns an array
 * of ticket ids (numbers). Empty array when nothing matches or the key is blank.
 */
export async function findLinkedZendeskTicketIds(issueKey) {
  assertZendeskConfig();
  if (!issueKey) return [];

  const query = encodeURIComponent(`type:ticket ${issueKey}`);
  const data = await zendeskGet(`/api/v2/search.json?query=${query}`);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((t) => t.id).filter((id) => Number.isFinite(id));
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
