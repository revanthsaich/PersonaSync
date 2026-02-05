import mongoose from "mongoose";

const FaceSchema = new mongoose.Schema({
  person: { type: mongoose.Schema.Types.ObjectId, ref: "Person" },
  bbox: [{ type: Number }],
  faceUrl: { type: String },
}, { _id: false });

const ImageSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  url: { type: String, required: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, default: null }, // GridFS file ID
  localPath: { type: String, default: null }, // Deprecated: kept for backward compatibility
  width: { type: Number },
  height: { type: Number },
  persons: [{ type: mongoose.Schema.Types.ObjectId, ref: "Person" }], // Detected persons
  faces: [FaceSchema],
}, {
  timestamps: true,
});

export const Image = mongoose.model("Image", ImageSchema);
