import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * A name an export uses for an agendo user, saved when an admin confirms a match during
 * an import ("Mark Kevin …" in the chat export for agendo's "Marko …"). Kept here rather
 * than on the user document: identity data is reconciled by hand and isn't this
 * feature's to change.
 */
const AliasSchema = new Schema(
  {
    normalized: { type: String, required: true, unique: true },
    display: { type: String, required: true },
    clerkId: { type: String, required: true },
    createdBy: { type: String, default: null },
  },
  { timestamps: true },
);

const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-performance-aliases" : "performance-aliases";

export const Alias = mongoose.model("PerformanceAlias", AliasSchema, collectionName);
