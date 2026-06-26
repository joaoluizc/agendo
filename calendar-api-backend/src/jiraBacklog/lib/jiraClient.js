import { jiraConfig, assertJiraConfig } from "./config.js";

/**
 * Server-side Jira REST client for the one thing this feature needs: the count of
 * Zendesk support tickets linked to a Jira issue (a custom field). The token never
 * touches the browser — only this module talks to Jira.
 *
 * Auth: Atlassian Cloud has two token types and they authenticate differently —
 *  - API tokens (the "ATATT…" tokens from id.atlassian.com) use HTTP Basic, with the
 *    Atlassian account email as the username and the token as the password. This is what
 *    Duda uses, and what JIRA_API_EMAIL is for.
 *  - OAuth/Connect bearer tokens use `Authorization: Bearer …` (against a different
 *    api.atlassian.com/ex/jira/{cloudId} base URL).
 *
 * The original spec assumed Bearer, but an "ATATT" token sent as Bearer fails with
 * 403 "Failed to parse Connect Session Auth Token". So we pick Basic whenever an email
 * is configured (the API-token path) and only fall back to Bearer when it isn't.
 */
function authHeader() {
  if (jiraConfig.apiEmail) {
    const basic = Buffer.from(`${jiraConfig.apiEmail}:${jiraConfig.apiToken}`).toString("base64");
    return `Basic ${basic}`;
  }
  return `Bearer ${jiraConfig.apiToken}`;
}

/** Extract a Jira issue key (e.g. "SUP-6983") from a key or a browse URL. */
export function extractIssueKey(keyOrUrl) {
  if (!keyOrUrl) return "";
  const match = String(keyOrUrl).match(/[A-Z][A-Z0-9]+-\d+/i);
  return match ? match[0].toUpperCase() : "";
}

/**
 * Fetch the linked Zendesk ticket count for one issue.
 * @returns {Promise<number>} the count, or 0 when the field is null/missing.
 * @throws when Jira is unconfigured, the key is unparseable, or the API call fails.
 */
export async function fetchConnectedTicketCount(keyOrUrl) {
  assertJiraConfig();

  const issueKey = extractIssueKey(keyOrUrl);
  if (!issueKey) {
    throw new Error(`Could not parse a Jira issue key from "${keyOrUrl}".`);
  }

  const field = jiraConfig.connectedTicketsField;
  const url = `${jiraConfig.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(field)}`;

  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });
  } catch (err) {
    throw new Error(`Jira request failed: ${err.message}`);
  }

  if (!res.ok) {
    // Log the response body server-side — it carries the real reason (bad token,
    // missing permission, unknown field) without leaking anything to the client.
    const body = await res.text().catch(() => "");
    console.error(`[jira-backlog] Jira ${res.status} for ${issueKey}: ${body.slice(0, 300)}`);
    const detail = res.status === 404 ? `issue ${issueKey} not found` : `HTTP ${res.status}`;
    throw new Error(`Jira returned an error (${detail}).`);
  }

  const data = await res.json();
  const value = data?.fields?.[field];
  return Number.isFinite(value) ? Number(value) : 0;
}

/** A Jira single/multi-select custom field → its option value (or ""). */
function extractOptionValue(field) {
  if (!field) return "";
  if (Array.isArray(field)) return field[0]?.value || field[0]?.name || "";
  return field.value || field.name || "";
}

/**
 * From Jira's Sprint field (an array of sprint objects, or null) pick the most relevant
 * sprint name: the active sprint if any, else the next future one, else the most recently
 * started. Returns "" when there's no sprint.
 */
function pickSprintName(sprints) {
  if (!Array.isArray(sprints) || sprints.length === 0) return "";
  const start = (s) => new Date(s.startDate || 0).getTime();
  const active = sprints.filter((s) => s.state === "active");
  if (active.length) return [...active].sort((a, b) => start(b) - start(a))[0]?.name || "";
  const future = sprints.filter((s) => s.state === "future");
  if (future.length) return [...future].sort((a, b) => start(a) - start(b))[0]?.name || "";
  return [...sprints].sort((a, b) => start(b) - start(a))[0]?.name || "";
}

/**
 * Fetch the fields we can map onto a backlog row when a Jira ticket is first linked:
 * summary (→ description), priority name, squad option, the most relevant sprint name, and
 * the linked Zendesk count. Returns raw values; mapping to agendo's dropdown options (and
 * skipping empties) happens in the service. Throws on config / parse / HTTP errors.
 */
export async function fetchIssueDetails(keyOrUrl) {
  assertJiraConfig();

  const issueKey = extractIssueKey(keyOrUrl);
  if (!issueKey) {
    throw new Error(`Could not parse a Jira issue key from "${keyOrUrl}".`);
  }

  const fields = [
    "summary",
    "priority",
    jiraConfig.connectedTicketsField,
    jiraConfig.squadField,
    jiraConfig.sprintField,
    jiraConfig.partnerField,
  ].join(",");
  const url = `${jiraConfig.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(fields)}`;

  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });
  } catch (err) {
    throw new Error(`Jira request failed: ${err.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[jira-backlog] Jira ${res.status} for ${issueKey}: ${body.slice(0, 300)}`);
    const detail = res.status === 404 ? `issue ${issueKey} not found` : `HTTP ${res.status}`;
    throw new Error(`Jira returned an error (${detail}).`);
  }

  const data = await res.json();
  const f = data?.fields || {};
  const zd = f[jiraConfig.connectedTicketsField];

  return {
    issueKey,
    summary: typeof f.summary === "string" ? f.summary : "",
    priorityName: f.priority?.name || "",
    squadValue: extractOptionValue(f[jiraConfig.squadField]),
    sprintName: pickSprintName(f[jiraConfig.sprintField]),
    partnerValue: extractOptionValue(f[jiraConfig.partnerField]),
    zdCount: Number.isFinite(zd) ? Number(zd) : null,
  };
}
