import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * One agent's imported numbers for one source in one quarter — the raw inputs the
 * scores are computed from, never the scores themselves (those are recomputed on read,
 * so they can be re-derived under any methodology version).
 *
 * metrics, by source:
 *   tickets | chats | screenshares: { count, csat (0..1 | null), surveys, good?, bad? }
 *   hours:                          { chatsHours, ticketsHours }  (either may be null)
 *
 * The audit trail (what was pasted, by whom, what it replaced) lives in the import docs;
 * this collection is only the current state.
 */
const FactSchema = new Schema(
  {
    periodKey: { type: String, required: true },
    clerkId: { type: String, required: true },
    source: { type: String, enum: ["tickets", "chats", "screenshares", "hours"], required: true },
    metrics: { type: Schema.Types.Mixed, required: true },
    importId: { type: Schema.Types.ObjectId, default: null },
    // "paste" today; a future API connector writes "api:<name>" into the same shape.
    origin: { type: String, default: "paste" },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, minimize: false },
);

FactSchema.index({ periodKey: 1, clerkId: 1, source: 1 }, { unique: true });
FactSchema.index({ periodKey: 1, source: 1 });

const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-performance-facts" : "performance-facts";

export const Fact = mongoose.model("PerformanceFact", FactSchema, collectionName);
