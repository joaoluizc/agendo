import mongoose from "mongoose";
import { GCalEventSchema } from "./GCalEventModel.js";

const Schema = mongoose.Schema;

const ShiftSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    required: true,
  },
  positionId: {
    type: Schema.Types.ObjectId,
    ref: "Position",
  },
  createdBy: {
    type: String,
    required: true,
  },
  isSynced: {
    type: Boolean,
    default: false,
  },
  syncedEvent: GCalEventSchema,
});

const Shift = mongoose.model("Shift", ShiftSchema);

export default Shift;
