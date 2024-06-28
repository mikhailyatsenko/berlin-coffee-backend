import { Schema, model } from "mongoose";

export interface IPlace {
  name: string;
  location: {
    type: string;
    coordinates: number[];
  };
  description: string;
  address: string;
  image: string;
  instagram: string;
}

const PlaceSchema = new Schema<IPlace>({
  name: { type: String, required: true },
  location: {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true },
  },
  description: { type: String, required: true },
  address: { type: String, required: true },
  image: { type: String, required: true },
  instagram: { type: String, required: true },
});

export default model<IPlace>("Place", PlaceSchema);
