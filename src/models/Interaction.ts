import mongoose, { Document } from "mongoose";
import { IPlace } from "./Place";

export interface IInteraction extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  placeId: IPlace["_id"];
  rating?: number;
  review?: string;
  isFavorite: boolean;
  characteristics: {
    tastyFilterCoffee: boolean; // true или false
    pleasantAtmosphere: boolean;
    friendlyStaff: boolean;
    tastyDesserts: boolean;
    greatFood: boolean;
    reasonablePrices: boolean;
    hasWifi: boolean;
  };
  date: Date;
}

const InteractionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  placeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Place",
    required: true,
  },
  rating: { type: Number, min: 1, max: 5 },
  review: { type: String },
  isFavorite: { type: Boolean, default: false },
  characteristics: {
    tastyFilterCoffee: { type: Boolean, default: false },
    pleasantAtmosphere: { type: Boolean, default: false },
    friendlyStaff: { type: Boolean, default: false },
    tastyDesserts: { type: Boolean, default: false },
    greatFood: { type: Boolean, default: false },
    reasonablePrices: { type: Boolean, default: false },
    hasWifi: { type: Boolean, default: false },
  },
  date: { type: Date, default: Date.now },
});

InteractionSchema.index({ userId: 1, placeId: 1 }, { unique: true });

export default mongoose.model<IInteraction>("Interaction", InteractionSchema);
