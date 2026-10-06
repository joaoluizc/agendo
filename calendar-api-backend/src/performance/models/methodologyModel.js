import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * One version of the scoring rules. Immutable once stored: a quarter scored with
 * "aps-v1" must score the same next year, so changing the rules means adding "aps-v2"
 * (a new seed file) and pointing periods at it, never editing this document. The update
 * hooks below make an accidental edit fail loudly instead of silently rescoring history.
 */
const MethodologySchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    summary: { type: String, default: "" },
    config: { type: Schema.Types.Mixed, required: true },
    // sha256 of the seed's config, to notice a seed file edited after it was stored.
    configHash: { type: String, required: true },
  },
  { timestamps: true, minimize: false },
);

MethodologySchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"],
  function guard(next) {
    // The seeding upsert only sets on insert (plus the `updatedAt` mongoose's timestamps
    // add to every update); anything else is an edit.
    const update = this.getUpdate?.() || {};
    const editing = Object.entries(update).some(([op, fields]) => {
      if (op === "$setOnInsert") return false;
      if (op === "$set" && fields && Object.keys(fields).every((f) => f === "updatedAt")) return false;
      return true;
    });
    if (editing) return next(new Error("methodology versions are immutable — add a new version instead"));
    next();
  },
);

const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-performance-methodologies" : "performance-methodologies";

export const Methodology = mongoose.model("PerformanceMethodology", MethodologySchema, collectionName);
