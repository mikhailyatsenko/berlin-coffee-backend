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
      // required: [true, "Path `properties.description` is required."],
      default: "",
    },
    address: { type: String, required: true },
    image: {
      type: String,
      // required: [true, "Path `properties.image` is required."],
      default: "",
    },
    instagram: { type: String, required: true },
  },
});

export default mongoose.model<IPlace>("Place", PlaceSchema);
