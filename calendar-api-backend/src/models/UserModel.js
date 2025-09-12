import mongoose from "mongoose";
import { initialPositions } from "../database/seeds/initialPositions.js";
const { Schema } = mongoose;

const GapiTokenSchema = new Schema({
  access_token: {
    type: String,
    required: true,
  },
  refresh_token: {
    type: String,
    required: true,
  },
  scope: {
    type: String,
    required: true,
  },
  token_type: {
    type: String,
    required: true,
  },
  expiry_date: {
    type: Number,
    required: true,
  },
});

// Define what positions user wants to sync to google calendar
const PositionToSyncSchema = new Schema({
  positionId: {
    type: String,
    required: true,
  },
  sync: {
    type: Boolean,
    required: true,
    default: false,
  },
});

// Define work hours for each day of the week
const WorkHoursSchema = new Schema({
  dayOfWeek: {
    type: Number,
    min: 0,
    max: 6, // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    required: true,
  },
  startMinute: {
    type: Number,
    min: 0,
    max: 1439, // 0 = 00:00, 1439 = 23:59
    required: true,
  },
  endMinute: {
    type: Number,
    min: 0,
    max: 1439, // 0 = 00:00, 1439 = 23:59
    required: true,
  },
});

// Define the User schema
const UserSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: String,
    enum: ["normal", "admin"],
    required: true,
    default: "normal",
  },
  timezone: {
    type: String,
    default: "UTC",
  },
  skills: [
    {
      type: Schema.Types.ObjectId,
      ref: "Skill",
    },
  ],
  dailyMaxLimit: {
    type: Number,
    default: 480, // 8 hours in minutes
    min: 0,
  },
  weeklyMaxLimit: {
    type: Number,
    default: 2400, // 40 hours in minutes
    min: 0,
  },
  workHours: {
    type: [WorkHoursSchema],
    default: [
      {
        dayOfWeek: 1, // Monday
        startMinute: 540, // 09:00
        endMinute: 1080, // 18:00
        isWorking: true,
      },
      {
        dayOfWeek: 2, // Tuesday
        startMinute: 540, // 09:00
        endMinute: 1080, // 18:00
        isWorking: true,
      },
      {
        dayOfWeek: 3, // Wednesday
        startMinute: 540, // 09:00
        endMinute: 1080, // 18:00
        isWorking: true,
      },
      {
        dayOfWeek: 4, // Thursday
        startMinute: 540, // 09:00
        endMinute: 1080, // 18:00
        isWorking: true,
      },
      {
        dayOfWeek: 5, // Friday
        startMinute: 540, // 09:00
        endMinute: 1080, // 18:00
        isWorking: true,
      },
      {
        dayOfWeek: 6, // Saturday
        startMinute: 0, // 00:00
        endMinute: 0, // 00:00
        isWorking: false,
      },
      {
        dayOfWeek: 0, // Sunday
        startMinute: 0, // 00:00
        endMinute: 0, // 00:00
        isWorking: false,
      },
    ],
  },
  positionsToSync: {
    type: [PositionToSyncSchema],
    required: false,
    default: initialPositions,
  },
  slingId: {
    type: String,
    required: false,
  },
  clerkId: {
    type: String,
    required: false,
  },
});

// Pre-save hook to add default 'ticket' skill
UserSchema.pre("save", async function (next) {
  if (this.isNew && this.skills.length === 0) {
    try {
      // Find or create the 'ticket' skill
      const Skill = mongoose.model("Skill");
      let ticketSkill = await Skill.findOne({ name: "ticket" });

      if (!ticketSkill) {
        ticketSkill = await Skill.create({ name: "ticket" });
      }

      this.skills.push(ticketSkill._id);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Create the User model
const User = mongoose.model("User", UserSchema);

export { User };
