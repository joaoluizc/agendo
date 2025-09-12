import mongoose from "mongoose";

const AdaChatSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // conversation id from Ada
    date_created: { type: Date, required: true },
    date_updated: { type: Date },
    is_escalated: { type: Boolean, required: true },
    data: { type: Object, required: true }, // full conversation object
  },
  { timestamps: true }
);

export default mongoose.model("AdaChat", AdaChatSchema, "ada-chats");
