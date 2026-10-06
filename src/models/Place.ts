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
    // slug: string;
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
    businessStatus?: BusinessStatus;
    /** Lost Google match: the Google Place ID that answered 404, set only by the Google sync. */
    googleNotFoundId?: string | null;
    /** When that mark was applied. */
    googleNotFoundAt?: Date | null;
  };
}

export type BusinessStatus = "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";

// Places Google reports as closed stay in the database (reviews, favorites and
// direct links keep working) but are left out of every listing.
export const VISIBLE_PLACE_MATCH = {
  "properties.businessStatus": { $nin: ["CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"] },
};


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
    // slug: { type: String, required: true, unique: true, index: true },
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
    neighborhood: { type: String, default: null, index: true },
    openingHours: { type: [OpeningHourSchema], default: [] },
    phone: { type: String, default: null },
    website: { type: String, default: null },
    businessStatus: { type: String, default: "OPERATIONAL" },
    // Lost Google match (see CONTEXT.md): the Google sync skips the Place while
    // googleNotFoundId equals googleId. Not exposed in GraphQL; the Place stays visible.
    googleNotFoundId: { type: String, default: null },
    googleNotFoundAt: { type: Date, default: null },
  },
});

export default mongoose.model<IPlace>("NewPlace", PlaceSchema);
