import mongoose from "mongoose";

const DemandForecastSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true }, // UTC date and time for the slot
    slot_index: { type: Number, required: true },
    activity: { type: String, required: true }, // e.g., 'chat', 'tickets', etc.
    required_agents: { type: Number, required: true },
  },
  { timestamps: true }
);

DemandForecastSchema.index(
  { date: 1, slot_index: 1, activity: 1 },
  { unique: true }
);

export default mongoose.model(
  "DemandForecast",
  DemandForecastSchema,
  "demand_forecast"
);
