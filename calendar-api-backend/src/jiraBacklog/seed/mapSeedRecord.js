import { deriveStatus } from "../lib/status.js";

/**
 * Map one seed-export record (boolean format: id / closed / checkedSquad / reviewSquad /
 * …) onto a JiraIssue document. The three legacy booleans are collapsed into a single
 * `status` by deriveStatus(); the Jira key arrives as `id` and is stored as `issueKey`
 * (Mongoose reserves the `id` virtual). `order` preserves the export's row order.
 *
 * Shared by the first-run seeding path (jiraBacklogService.doSeed) and the one-time
 * sheet import (scripts/import-sheet-data.js) so both produce identical documents.
 *
 * @param {object} rec  a record from seed/jiraBacklogSeed.js
 * @param {number} index  position in the export (becomes `order`)
 */
export function mapSeedRecord(rec, index) {
  return {
    issueKey: rec.id || "",
    url: rec.url || "",
    status: deriveStatus(rec),
    desc: rec.desc || "",
    client: rec.client || "",
    priority: rec.priority || "",
    squad: rec.squad || "",
    sprint: rec.sprint || "",
    complexity: rec.complexity || "",
    urgency: typeof rec.urgency === "number" ? rec.urgency : null,
    urgencyOverridden: false,
    comment: rec.comment || "",
    bugType: rec.bugType || "",
    scope: rec.scope || "",
    planTier: rec.planTier || "",
    workaround: rec.workaround || "",
    frustration: rec.frustration || "",
    scopeConf: rec.scopeConf || "",
    workaroundQ: rec.workaroundQ || "",
    zdCount: typeof rec.zdCount === "number" ? rec.zdCount : null,
    zdCountFetchedAt: rec.zdCountFetchedAt ? new Date(rec.zdCountFetchedAt) : null,
    order: index,
  };
}
