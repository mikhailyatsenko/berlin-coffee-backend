import mongoose, { Document, Schema } from "mongoose";

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
    ratingCount: number;
  };
}

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
    ratingCount: { type: Number, default: 0 },
  },
});

export default mongoose.model<IPlace>("Place", PlaceSchema);
