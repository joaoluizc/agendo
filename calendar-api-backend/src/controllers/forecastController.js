import { getAdaStaffingForecast } from "../services/forecastService.js";

/**
 * Controller for Ada staffing forecast API.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function forecastAdaStaffingController(req, res) {
  try {
    const params = {
      historyDays: req.query.historyDays || req.body.historyDays,
      forecastStartISO: req.query.forecastStartISO || req.body.forecastStartISO,
      horizonDays: req.query.horizonDays || req.body.horizonDays,
      slotMinutes: req.query.slotMinutes || req.body.slotMinutes,
      method: req.query.method || req.body.method,
      targetASASeconds: req.query.targetASASeconds || req.body.targetASASeconds,
      zSafety: req.query.zSafety || req.body.zSafety,
    };

    // Validate forecastStartISO date
    if (
      !params.forecastStartISO ||
      isNaN(Date.parse(params.forecastStartISO))
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid or missing forecastStartISO date",
      });
    }

    const result = await getAdaStaffingForecast(params);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
