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
  // Custom fields used by the new-row auto-fill from Jira. Overridable per instance;
  // defaults match Duda's "Weekly Bugs" (SUP) project.
  get squadField() {
    return process.env.JIRA_SQUAD_FIELD || "customfield_13650";
  },
  get sprintField() {
    return process.env.JIRA_SPRINT_FIELD || "customfield_11400";
  },
  // Jira "Partners" field — mapped onto the row's free-text `client` on auto-fill.
  get partnerField() {
    return process.env.JIRA_PARTNER_FIELD || "customfield_11200";
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

/**
 * Zendesk config for the MRR-resolution feature: finding which tickets are linked to a
 * Jira bug and their requester's email. Same getter shape as jiraConfig (live process.env,
 * never throws at import). Auth is Zendesk's API-token scheme: Basic with `{email}/token`
 * as the username and the token as the password.
 */
export const zendeskConfig = {
  get subdomain() {
    return process.env.ZD_SUBDOMAIN || "";
  },
  get apiEmail() {
    return process.env.ZD_API_EMAIL || "";
  },
  get apiToken() {
    return process.env.ZD_API_TOKEN || "";
  },
};

export function isZendeskConfigured() {
  return Boolean(zendeskConfig.subdomain && zendeskConfig.apiEmail && zendeskConfig.apiToken);
}

export function assertZendeskConfig() {
  const missing = [];
  if (!zendeskConfig.subdomain) missing.push("ZD_SUBDOMAIN");
  if (!zendeskConfig.apiEmail) missing.push("ZD_API_EMAIL");
  if (!zendeskConfig.apiToken) missing.push("ZD_API_TOKEN");
  if (missing.length) {
    throw new Error(
      `Zendesk integration is not configured. Missing env var(s): ${missing.join(", ")}. ` +
        `Add them to calendar-api-backend/.env (see src/jiraBacklog/README.md).`,
    );
  }
}

/**
 * DOMO config for the MRR-resolution feature: resolving a Zendesk requester's email to its
 * owning account, then that account's latest-complete-month MRR. The two dataset ids are the
 * hard part — see README's "MRR resolution" section for the column shape each dataset needs.
 */
export const domoConfig = {
  get clientId() {
    return process.env.DOMO_CLIENT_ID || "";
  },
  get clientSecret() {
    return process.env.DOMO_CLIENT_SECRET || "";
  },
  get accountsDatasetId() {
    return process.env.DOMO_ACCOUNTS_DATASET_ID || "";
  },
  get revenueDatasetId() {
    return process.env.DOMO_REVENUE_DATASET_ID || "";
  },
};

export function isDomoConfigured() {
  return Boolean(
    domoConfig.clientId && domoConfig.clientSecret && domoConfig.accountsDatasetId && domoConfig.revenueDatasetId,
  );
}

export function assertDomoConfig() {
  const missing = [];
  if (!domoConfig.clientId) missing.push("DOMO_CLIENT_ID");
  if (!domoConfig.clientSecret) missing.push("DOMO_CLIENT_SECRET");
  if (!domoConfig.accountsDatasetId) missing.push("DOMO_ACCOUNTS_DATASET_ID");
  if (!domoConfig.revenueDatasetId) missing.push("DOMO_REVENUE_DATASET_ID");
  if (missing.length) {
    throw new Error(
      `DOMO integration is not configured. Missing env var(s): ${missing.join(", ")}. ` +
        `Add them to calendar-api-backend/.env (see src/jiraBacklog/README.md).`,
    );
  }
}

/** True when every leg of the Jira → Zendesk → DOMO MRR chain is configured. */
export function isMrrConfigured() {
  return isJiraConfigured() && isZendeskConfigured() && isDomoConfigured();
}
