import mongoose from "mongoose";

const AdaAiSearchSchema = new mongoose.Schema({
  query: { type: String, required: true },
  result: { type: String },
  requestedAt: { type: Date, required: true },
  returnedAt: { type: Date },
  latency: { type: Number },
  success: { type: Boolean, required: true },
  error: { type: String },
  cacheHit: { type: Boolean, required: true },
});

export default mongoose.model("ada-ai-search", AdaAiSearchSchema);
