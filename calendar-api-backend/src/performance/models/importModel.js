import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

export const MAX_IMPORT_CHARS = 90000; // under express.json()'s default 100 KB body limit

/**
 * An append-only record of one paste: the raw text, how each line was resolved to a
 * person, and the facts it overwrote or removed — enough to explain any number later, or
 * to undo the import by hand. Holds agent names and CSAT, so it stays in the database and
 * is never logged.
 */
const ImportSchema = new Schema(
  {
    periodKey: { type: String, required: true },
    source: { type: String, enum: ["tickets", "chats", "screenshares", "hours"], required: true },
    origin: { type: String, default: "paste" },
    rawText: { type: String, required: true, maxlength: MAX_IMPORT_CHARS },
    rawHash: { type: String, required: true },
    columns: { type: Schema.Types.Mixed, default: {} },
    // [{ line, rawName, values, clerkId | null, matchedBy, aliasSaved }]
    rows: { type: Schema.Types.Mixed, default: [] },
    // facts this import replaced or removed: [{ clerkId, metrics }]
    previous: { type: Schema.Types.Mixed, default: [] },
    summary: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["committing", "committed", "failed"], default: "committing" },
    error: { type: String, default: null },
    createdBy: { type: String, default: null },
  },
  { timestamps: true, minimize: false },
);

ImportSchema.index({ periodKey: 1, createdAt: -1 });

const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-performance-imports" : "performance-imports";

export const Import = mongoose.model("PerformanceImport", ImportSchema, collectionName);
