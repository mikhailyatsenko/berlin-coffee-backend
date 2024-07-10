import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  displayName: string;
  avatar: string;
  favorites: mongoose.Types.ObjectId[];
  reviews: {
    cafe: mongoose.Types.ObjectId;
    rating?: number;
    comment?: string;
  }[];
}

const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  displayName: { type: String, required: true },
  avatar: { type: String },
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Place" }],
  reviews: [
    {
      cafe: { type: mongoose.Schema.Types.ObjectId, ref: "Place" },
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String },
    },
  ],
});

export default mongoose.model<IUser>("User", UserSchema);
