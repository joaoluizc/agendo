import cron from "node-cron";
import jiraBacklogService from "./jiraBacklogService.js";

/**
 * Daily "Sync from Jira" scheduler. Registers an in-process cron job that runs the bulk sync
 * (jiraBacklogService.syncAllFromJira) every day at 00:00 UTC. Started once from app.js.
 *
 * Render note: this fires only while the web service is awake. On an always-on instance it's
 * reliable; on a tier that sleeps when idle, the 00:00 tick can be missed (you'll simply see
 * no "tick" log at midnight). If that bites, run the standalone script from a Render Cron Job
 * instead — `node src/jiraBacklog/scripts/sync-all-jira.js --prod` — which runs in its own
 * process on schedule regardless of the web service. Both paths call the same service function.
 *
 * Everything logs with a `[jira-backlog][sync]` prefix so runs are easy to confirm in Render's
 * log stream.
 */

const CRON_EXPRESSION = "0 0 * * *"; // every day at 00:00
const TIMEZONE = "UTC";

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
      console.log(`[jira-backlog][sync] tick @ ${new Date().toISOString()} — running daily sync`);
      try {
        const result = await jiraBacklogService.syncAllFromJira();
        console.log(`[jira-backlog][sync] tick complete: ${JSON.stringify(result)}`);
      } catch (e) {
        // Never let a failed run take down the process.
        console.error("[jira-backlog][sync] tick crashed:", e);
      }
    },
    { timezone: TIMEZONE },
  );

  started = true;
  console.log(
    `[jira-backlog][sync] daily sync scheduled — "${CRON_EXPRESSION}" (${TIMEZONE}). ` +
      `Server time now: ${new Date().toISOString()}`,
  );
}
