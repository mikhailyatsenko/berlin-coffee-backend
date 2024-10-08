import mongoose, { Document } from "mongoose";

export interface IPlace extends Document {
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
  };
}

const PlaceSchema = new mongoose.Schema({
  type: { type: String, default: "Feature" },
  geometry: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], required: true, index: "2dsphere" },
  },
  properties: {
    name: { type: String, required: true },
    description: {
      type: String,
      default: "",
    },
    address: { type: String, required: true },
    image: {
      type: String,
      default: "",
    },
    instagram: { type: String, required: true },
  },
});

export default mongoose.model<IPlace>("Place", PlaceSchema);
