import mongoose, { Document } from "mongoose";
import { IPlace } from "./Place";

export interface IInteraction extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  placeId: IPlace["_id"];
  rating?: number;
  reviewText?: string;
  isFavorite: boolean;
  characteristics: {
    deliciousFilterCoffee: boolean;
    pleasantAtmosphere: boolean;
    friendlyStaff: boolean;
    freeWifi: boolean;
    yummyEats: boolean;
    affordablePrices: boolean;
    petFriendly: boolean;
    outdoorSeating: boolean;
  };
  date: Date;
  reviewImages?: number;
}

const InteractionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  placeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "NewPlace",
    required: true,
  },
  rating: { type: Number, min: 1, max: 5 },
  reviewText: { type: String },
  isFavorite: { type: Boolean, default: false },
  characteristics: {
    deliciousFilterCoffee: { type: Boolean, default: false },
    pleasantAtmosphere: { type: Boolean, default: false },
    friendlyStaff: { type: Boolean, default: false },
    yummyEats: { type: Boolean, default: false },
    affordablePrices: { type: Boolean, default: false },
    freeWifi: { type: Boolean, default: false },
    petFriendly: { type: Boolean, default: false },
    outdoorSeating: { type: Boolean, default: false },
  },
  date: { type: Date, default: Date.now },
  reviewImages: { type: Number, default: 0 },
});

InteractionSchema.index({ userId: 1, placeId: 1 }, { unique: true });

export default mongoose.model<IInteraction>("Interaction", InteractionSchema);
