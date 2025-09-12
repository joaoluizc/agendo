import cron from "node-cron";
import { generateAndPersistChatForecast } from "../services/demandForecastService.js";

// Runs every Sunday at 2:00 AM UTC
export function startDemandForecastCron() {
  cron.schedule(
    "0 0 * * 0",
    async () => {
      try {
        const count = await generateAndPersistChatForecast();
        console.log(
          `[DemandForecastCron] Generated and saved ${count} chat forecast slots for next 2 weeks.`
        );
      } catch (err) {
        console.error("[DemandForecastCron] Error:", err);
      }
    },
    {
      timezone: "UTC",
    }
  );
}
