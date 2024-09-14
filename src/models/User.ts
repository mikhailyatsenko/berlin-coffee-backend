import mongoose, { Document } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  googleId?: string;
  email: string;
  password?: string;
  displayName: string;
  avatar?: string;
}
const UserSchema = new mongoose.Schema({
  googleId: { type: String, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  displayName: { type: String, required: true },
  avatar: { type: String },
});

export default mongoose.model<IUser>("User", UserSchema);
