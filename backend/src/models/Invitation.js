import mongoose from "mongoose";

const InvitationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true }, // sender user id
    senderEmail: { type: String, default: "" },
    targetEmail: { type: String, required: true, index: true },
    status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
  },
  { timestamps: true }
);

InvitationSchema.index({ userId: 1, targetEmail: 1, status: 1 });

export const Invitation = mongoose.model("Invitation", InvitationSchema);
