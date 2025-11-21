import mongoose, { Document } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  googleId?: string | null;
  email: string;
  pendingEmail?: string | null;
  password?: string | null;
  displayName: string;
  avatar?: string | null;
  createdAt: Date;
  lastActive?: Date | null;
  isEmailConfirmed: boolean;
  emailConfirmationToken?: string | null;
  emailConfirmationTokenExpires?: Date | null;
  passwordResetToken?: string | null;
  passwordResetTokenExpires?: Date | null;
}
const UserSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  pendingEmail: { type: String, default: null },
  password: { type: String },
  displayName: { type: String, required: true },
  avatar: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  isEmailConfirmed: { type: Boolean, default: false },
  emailConfirmationToken: { type: String, default: null },
  emailConfirmationTokenExpires: { type: Date, default: null },
  passwordResetToken: { type: String, default: null },
  passwordResetTokenExpires: { type: Date, default: null },
});

export default mongoose.model<IUser>("User", UserSchema);
