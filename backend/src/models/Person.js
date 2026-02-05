import mongoose from "mongoose";

const PersonSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true }, // Clerk user ID or session ID
  mlId: { type: String, required: true }, // ID returned by ML service (e.g., "person_0")
  name: { type: String, default: "Unknown" },
  thumbnail: { type: String }, // URL of the face crop or representative image
  count: { type: Number, default: 0 },
}, {
  timestamps: true, // createdAt / updatedAt represent last detection time
});

// Compound index to ensure unique mlId per user
PersonSchema.index({ userId: 1, mlId: 1 }, { unique: true });

export const Person = mongoose.model("Person", PersonSchema);
