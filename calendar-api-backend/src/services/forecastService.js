import { forecastChatStaffing } from "../utils/adaStaffingForecast.js";

/**
 * Service to handle Ada staffing forecasting logic.
 * @param {Object} params - Parameters for forecasting.
 * @returns {Promise<Array>} - Forecasted staffing data.
 */
export async function getAdaStaffingForecast(params) {
  // You can add validation or transformation here if needed
  return forecastChatStaffing(params);
}
