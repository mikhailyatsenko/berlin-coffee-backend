import mongoose, { Document } from "mongoose";

export interface IOpeningHour {
  day: string;
  hours: string;
}


export interface IPlace extends Document {
  _id: mongoose.Types.ObjectId;
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name: string;
    description: string | null;
    address: string;
    image: string;
    instagram: string | null;
    additionalInfo?: Record<string, { [key: string]: boolean }[]>;
    googleId?: string | null;
    neighborhood?: string;
    openingHours?: IOpeningHour[];
    phone?: string | null;
    website?: string | null;
  };
}


const OpeningHourSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    hours: { type: String, required: true },
  },
  { _id: false },
);

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
      default: null,
    },
    address: { type: String, required: true },
    image: {
      type: String,
      default: "",
    },
    instagram: { type: String, default: null },
    additionalInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
    googleId: { type: String, default: null },
    neighborhood: { type: String, default: null },
    openingHours: { type: [OpeningHourSchema], default: [] },
    phone: { type: String, default: null },
    website: { type: String, default: null },
  },
});

export default mongoose.model<IPlace>("NewPlace", PlaceSchema);
