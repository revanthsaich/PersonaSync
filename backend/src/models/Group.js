import mongoose from "mongoose";

const GroupSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  imageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Image" }],
  coverImage: { type: String }, // URL of the cover/thumbnail
  color: { type: String, default: "#3B82F6" }, // Tailwind color or hex for visual variety
}, {
  timestamps: true,
});

export const Group = mongoose.model("Group", GroupSchema);
