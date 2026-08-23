import mongoose, { Document } from "mongoose";

/**
 * A guest identity is issued once, after a successful reCAPTCHA check, and is
 * then used to authenticate every subsequent guest action instead of the
 * captcha itself. The client keeps `guestId` + the raw secret in localStorage;
 * we only ever store the hash.
 */
export interface IGuestIdentity extends Document {
  _id: mongoose.Types.ObjectId;
  guestId: string;
  secretHash: string;
  createdAt: Date;
  lastUsedAt: Date;
  claimedBy?: mongoose.Types.ObjectId | null;
  claimedAt?: Date | null;
}

const GuestIdentitySchema = new mongoose.Schema({
  guestId: { type: String, required: true, unique: true },
  secretHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: Date.now },
  claimedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  claimedAt: { type: Date, default: null },
});

export default mongoose.model<IGuestIdentity>(
  "GuestIdentity",
  GuestIdentitySchema,
);
