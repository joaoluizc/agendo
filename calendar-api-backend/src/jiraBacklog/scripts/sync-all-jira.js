/**
 * Bulk "Sync from Jira" for every linked bug — runnable as a standalone process. Two uses:
 *
 *   1. A Render Cron Job (the robust option if the web service sleeps): set the job's command
 *      to `node src/jiraBacklog/scripts/sync-all-jira.js --prod` and its schedule to `0 0 * * *`
 *      (Render cron is UTC). This runs in its own process regardless of the web service, so it
 *      can't be missed by a sleeping instance.
 *   2. Manual / on-demand: run it locally to verify the sync end-to-end and watch the logs.
 *
 * The always-on web service ALSO runs this daily in-process (see scheduler.js) — pick whichever
 * fits your Render setup; both call the same jiraBacklogService.syncAllFromJira().
 *
 * Target collection (dev-* vs prod) is chosen by flag, falling back to NODE_ENV, then dev.
 * Flags work the same in PowerShell, cmd, and bash.
 *
 * Run from calendar-api-backend/:
 *     node src/jiraBacklog/scripts/sync-all-jira.js            # dev (default)
 *     node src/jiraBacklog/scripts/sync-all-jira.js --prod     # production
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import process from "process";

dotenv.config();

const flags = new Set(process.argv.slice(2).map((a) => a.toLowerCase()));
const has = (...names) => names.some((n) => flags.has(n));

const target = has("--prod", "--production")
  ? "production"
  : has("--dev", "--development")
    ? "development"
    : process.env.NODE_ENV || "development";
// Set before importing the service so its models bind to the matching collection.
process.env.NODE_ENV = target;

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[jira-backlog][sync] standalone run — target=${target}, started ${new Date().toISOString()}`);

  const { default: jiraBacklogService } = await import("../jiraBacklogService.js");
  const result = await jiraBacklogService.syncAllFromJira();

  console.log(`[jira-backlog][sync] standalone result: ${JSON.stringify(result)}`);
  await mongoose.disconnect();
  // Non-zero exit if nothing could run (e.g. Jira unconfigured) so a cron platform flags it.
  process.exit(result.skipped ? 1 : 0);
}

run().catch((e) => {
  console.error("[jira-backlog][sync] standalone failed:", e);
  process.exit(1);
});
