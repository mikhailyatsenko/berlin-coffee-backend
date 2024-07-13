import mongoose, { Document, Schema } from "mongoose";

interface IRatedPlace {
  place: mongoose.Types.ObjectId | Schema.Types.ObjectId;
  rating: number;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  googleId: string;
  email: string;
  displayName: string;
  avatar: string;
  ratedPlaces: IRatedPlace[];
}

const UserSchema: Schema = new Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  avatar: { type: String },
  ratedPlaces: [
    {
      place: { type: Schema.Types.ObjectId, ref: "Place" },
      rating: { type: Number, required: true, min: 1, max: 5 },
    },
  ],
});

export default mongoose.model<IUser>("User", UserSchema);
