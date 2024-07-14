import mongoose, { Document } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  googleId: string;
  email: string;
  displayName: string;
  avatar: string;
}

const UserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  avatar: { type: String },
});

export default mongoose.model<IUser>("User", UserSchema);
