import mongoose from "mongoose";

const FaceIdentitySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  mlId: { type: String, required: true }, // person_id from ML service (e.g., "person_0")
  personId: { type: mongoose.Schema.Types.ObjectId, ref: "Person" }, // Link to Person document
  name: { type: String, default: "Unknown" }, // Display name
}, {
  timestamps: true,
});

// Unique constraint: each user can have only one FaceIdentity per mlId
FaceIdentitySchema.index({ userId: 1, mlId: 1 }, { unique: true });

export const FaceIdentity = mongoose.model("FaceIdentity", FaceIdentitySchema);
