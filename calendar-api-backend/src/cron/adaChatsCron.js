import cron from "node-cron";
import { fetchAndStoreEscalatedAdaChats } from "../services/adaService.js";

/**
 * Schedules a cron job to fetch escalated Ada chats every Sunday at 12am UTC.
 * Fetches data from the previous Sunday to the current Sunday.
 */
export function scheduleAdaChatsJob() {
  cron.schedule(
    "0 0 * * 0",
    async () => {
      try {
        const now = new Date();
        // Get last Sunday 00:00 UTC
        const day = now.getUTCDay();
        const diffToLastSunday = day === 0 ? 7 : day;
        const lastSunday = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - diffToLastSunday,
            0,
            0,
            0,
            0
          )
        );
        const thisSunday = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0,
            0,
            0,
            0
          )
        );
        const stored = await fetchAndStoreEscalatedAdaChats({
          fromDate: lastSunday,
          toDate: thisSunday,
        });
        console.log(
          `[AdaCron] Stored ${stored} escalated Ada chats from ${lastSunday.toISOString()} to ${thisSunday.toISOString()}`
        );
      } catch (err) {
        console.error("[AdaCron] Error in scheduled Ada chat fetch:", err);
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    }
  );
}
