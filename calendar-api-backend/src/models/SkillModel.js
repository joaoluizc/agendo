import mongoose from "mongoose";

const { Schema } = mongoose;

// Define the Skill schema
const SkillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
});

// Create the Skill model
const Skill = mongoose.model("Skill", SkillSchema);

export { Skill };
