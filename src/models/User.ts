import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  googleId: string;
  displayName: string;
  email: string;
  avatar: string;
}

const UserSchema = new Schema<IUser>(
  {
    googleId: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    avatar: { type: String, required: true },
  },
  { timestamps: true },
);

export default model<IUser>("User", UserSchema);
