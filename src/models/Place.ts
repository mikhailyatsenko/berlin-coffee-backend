import mongoose, { Document, Schema } from "mongoose";

interface IReview {
  user: mongoose.Types.ObjectId;
  rating: number;
  comment: string;
  createdAt: Date;
}

interface IPlace extends Document {
  _id: mongoose.Types.ObjectId;
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name: string;
    description: string;
    address: string;
    image: string;
    instagram: string;
    averageRating: number;
    reviews: IReview[];
  };
}

const ReviewSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const PlaceSchema: Schema = new Schema({
  type: { type: String, default: "Feature" },
  geometry: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], required: true, index: "2dsphere" },
  },
  properties: {
    name: { type: String, required: true },
    description: { type: String, required: true },
    address: { type: String, required: true },
    image: { type: String, required: true },
    instagram: { type: String, required: true },
    averageRating: { type: Number, default: 0 },
    reviews: [ReviewSchema],
  },
});

PlaceSchema.index({ "properties.averageRating": -1 });

export default mongoose.model<IPlace>("Place", PlaceSchema);
