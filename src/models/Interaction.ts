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
    deliciousFilterCoffee: boolean;
    pleasantAtmosphere: boolean;
    friendlyStaff: boolean;
    deliciousDesserts: boolean;
    excellentFood: boolean;
    affordablePrices: boolean;
    freeWifi: boolean;
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
    deliciousFilterCoffee: { type: Boolean, default: false },
    pleasantAtmosphere: { type: Boolean, default: false },
    friendlyStaff: { type: Boolean, default: false },
    deliciousDesserts: { type: Boolean, default: false },
    excellentFood: { type: Boolean, default: false },
    affordablePrices: { type: Boolean, default: false },
    freeWifi: { type: Boolean, default: false },
  },

  date: { type: Date, default: Date.now },
});

InteractionSchema.index({ userId: 1, placeId: 1 }, { unique: true });

export default mongoose.model<IInteraction>("Interaction", InteractionSchema);
