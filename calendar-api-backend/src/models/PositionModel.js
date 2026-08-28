import mongoose from "mongoose";
const { Schema } = mongoose;

const PositionSchema = new Schema({
  positionId: {
    type: String,
    required: false,
    default: "",
  },
  name: {
    type: String,
    required: true,
  },
  color: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    default: "ticket",
  },
  enforceSync: {
    type: Boolean,
    required: true,
    default: false,
  },
  /**
   * The day this position was last put on a shift, truncated to UTC midnight.
   *
   * Internal — never edited or shown in Settings. It exists to order the position pickers
   * so the handful of positions actually in use float to the top, with alphabetical order
   * breaking ties (see `positionService.touchPositionUsage` and `PositionCombobox`).
   *
   * Truncated to a day on purpose. A full timestamp would reorder the list after every
   * single shift, so the option you were about to click moves out from under you; at day
   * granularity the order is fixed for the whole day.
   */
  lastUsedAt: {
    type: Date,
  },
});

const Position = mongoose.model("Position", PositionSchema);

export default Position;
