import mongoose, { Document } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  googleId?: string | null;
  email: string;
  password?: string | null;
  displayName: string;
  avatar?: string | null;
  createdAt: Date;
}
const UserSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  displayName: { type: String, required: true },
  avatar: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IUser>("User", UserSchema);
