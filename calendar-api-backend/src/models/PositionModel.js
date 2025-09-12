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
  minTime: {
    type: Number,
    required: true,
    min: 0,
    default: 30, // 30 minutes default
  },
  maxTime: {
    type: Number,
    required: true,
    min: 0,
    default: 480, // 8 hours default
  },
  stress: {
    type: Boolean,
    required: true,
    default: false,
  },
  requiredSkills: [
    {
      type: Schema.Types.ObjectId,
      ref: "Skill",
    },
  ],
});

const Position = mongoose.model("Position", PositionSchema);

export default Position;
