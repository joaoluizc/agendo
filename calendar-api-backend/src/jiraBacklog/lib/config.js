import process from "process";

/**
 * Jira integration config, read straight from process.env via getters (agendo's
 * DiscovAI pattern). Getters read the *live* process.env, which matters because ES
 * imports are hoisted above app.js's dotenv.config().
 *
 * Nothing here validates at import time or calls process.exit — a missing var must
 * never crash the agendo backend. The feature is OPTIONAL: when it's unconfigured the
 * "# Connected tickets" column simply stays inert (the UI shows "—" and disables the
 * refresh controls). assertJiraConfig() is called only inside a request's try/catch.
 *
 * Env vars live in calendar-api-backend/.env under the fenced
 * "# === Jira backlog ===" block (see src/jiraBacklog/README.md).
 */
export const jiraConfig = {
  get baseUrl() {
    // trim a trailing slash so URL joining is predictable
    return (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
  },
  get apiToken() {
    return process.env.JIRA_API_TOKEN || "";
  },
  get apiEmail() {
    return process.env.JIRA_API_EMAIL || "";
  },
  get cloudId() {
    return process.env.JIRA_CLOUD_ID || "";
  },
  // The Jira custom field holding the linked Zendesk ticket count. Overridable in case
  // the field id differs per instance; defaults to the value from the spec.
  get connectedTicketsField() {
    return process.env.JIRA_ZD_COUNT_FIELD || "customfield_13671";
  },
};

/** True when the minimum needed to call Jira is present. */
export function isJiraConfigured() {
  return Boolean(jiraConfig.baseUrl && jiraConfig.apiToken);
}

/** Throws a descriptive error if Jira isn't configured. Call inside a try/catch. */
export function assertJiraConfig() {
  const missing = [];
  if (!jiraConfig.baseUrl) missing.push("JIRA_BASE_URL");
  if (!jiraConfig.apiToken) missing.push("JIRA_API_TOKEN");
  if (missing.length) {
    throw new Error(
      `Jira integration is not configured. Missing env var(s): ${missing.join(", ")}. ` +
        `Add them to calendar-api-backend/.env (see src/jiraBacklog/README.md).`,
    );
  }
}
