import mongoose from "mongoose";
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
});

const Shift = mongoose.model("Shift", ShiftSchema);

export default Shift;
