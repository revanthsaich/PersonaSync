import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    fromEmail: { type: String, required: true, index: true },
    toEmail: { type: String, required: true, index: true },
    text: { type: String, default: "" },
    type: { type: String, enum: ["text", "image", "file"], default: "text" },
    fileUrl: { type: String, default: "" },
    fileId: { type: mongoose.Schema.Types.ObjectId, default: null }, // GridFS file ID
    fileName: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: "" },
  },
  { timestamps: true }
);

MessageSchema.index({ fromEmail: 1, toEmail: 1, createdAt: -1 });

export const Message = mongoose.model("Message", MessageSchema);
