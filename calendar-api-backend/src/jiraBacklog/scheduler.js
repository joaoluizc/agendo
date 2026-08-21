import cron from "node-cron";
import jiraBacklogService from "./jiraBacklogService.js";

/**
 * Thrice-daily "Sync from Jira" scheduler. Registers an in-process cron job that runs the bulk
 * sync (jiraBacklogService.syncAllFromJira) at 07:00, 12:00 and 16:00 São Paulo time — spread
 * across the Brazilian workday, so a stale status is usually corrected before anyone reports
 * it, rather than overnight when nobody is looking. Started once from app.js.
 *
 * Render note: this fires only while the web service is awake. On an always-on instance it's
 * reliable; on a tier that sleeps when idle, a tick can be missed (you'll simply see no "tick"
 * log at that hour). Syncing inside working hours is partly why — the instance is far likelier
 * to be awake then than at midnight, and three spread-out ticks are unlikely to all be missed.
 * If that still bites, run the standalone script from a Render Cron Job instead —
 * `node src/jiraBacklog/scripts/sync-all-jira.js --prod` — which runs in its own process on
 * schedule regardless of the web service. Both paths call the same service function.
 *
 * Note that cadence only shortens the staleness window; it can't fix a row that fails
 * deterministically (renamed Jira key, permissions), which will fail identically at the next
 * tick. Those surface two other ways: the error-level log below when any row failed, and the
 * `jiraStatusFetchedAt` staleness indicator in the UI.
 *
 * Everything logs with a `[jira-backlog][sync]` prefix so runs are easy to confirm in Render's
 * log stream.
 */

// Keep in sync with JIRA_STATUS_STALE_HOURS in the frontend's JiraBacklog/dates.ts: the
// binding gap is the overnight one (16:00 -> 07:00 = 15h), which is what that 18h threshold is
// sized against. A timezone here rather than hand-converted UTC hours (10,15,19) keeps the
// intent readable, and stays correct if Brazil ever reinstates DST.
const CRON_EXPRESSION = "0 7,12,16 * * *"; // 07:00, 12:00 and 16:00, Brazil business hours
const TIMEZONE = "America/Sao_Paulo";

let started = false;

export function startJiraBacklogScheduler() {
  // Idempotent: only one registration per process (nodemon restarts spawn fresh processes).
  if (started) {
    console.log("[jira-backlog][sync] scheduler already started — skipping");
    return;
  }

  if (!cron.validate(CRON_EXPRESSION)) {
    console.error(
      `[jira-backlog][sync] invalid cron expression "${CRON_EXPRESSION}" — scheduler NOT started`,
    );
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      console.log(
        `[jira-backlog][sync] tick @ ${new Date().toISOString()} — running scheduled sync`,
      );
      try {
        const result = await jiraBacklogService.syncAllFromJira();
        // Rows that fail are skipped individually inside syncAllFromJira, so a run with
        // failures still "completes". Log those at error level — a row that fails every tick
        // keeps serving a stale jiraStatus, and that's the case worth noticing.
        const log = result.failed > 0 ? console.error : console.log;
        log(`[jira-backlog][sync] tick complete: ${JSON.stringify(result)}`);
      } catch (e) {
        // Never let a failed run take down the process.
        console.error("[jira-backlog][sync] tick crashed:", e);
      }
    },
    { timezone: TIMEZONE },
  );

  started = true;
  console.log(
    `[jira-backlog][sync] sync scheduled — "${CRON_EXPRESSION}" (${TIMEZONE}). ` +
      `Server time now: ${new Date().toISOString()}`,
  );
}
