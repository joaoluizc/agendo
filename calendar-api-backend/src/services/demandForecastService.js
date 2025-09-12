import DemandForecast from "../models/DemandForecastModel.js";
import { forecastChatStaffing } from "../utils/adaStaffingForecast.js";

/**
 * Generate and persist Ada chat demand forecasts for the next two weeks.
 * Deletes old forecasts for overlapping dates before inserting new ones.
 */
export async function generateAndPersistChatForecast() {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const forecastStart = now;
  const horizonDays = 14;
  const slotMinutes = 60;
  const targetASASeconds = 200;

  // 1. Generate forecast
  const forecast = await forecastChatStaffing({
    forecastStartISO: forecastStart.toISOString(),
    horizonDays,
    slotMinutes,
    targetASASeconds,
  });

  // 2. Delete old forecasts for the forecast window (activity: 'chat')
  await DemandForecast.deleteMany({
    activity: "chat",
    date: { $gte: forecastStart },
  });

  // 3. Prepare and insert new forecasts
  const docs = forecast.map((row) => ({
    date: row.slotStart,
    slot_index: row.slotOfDay,
    activity: "chat",
    required_agents: row.requiredAgents,
  }));
  if (docs.length) await DemandForecast.insertMany(docs);

  return docs.length;
}
