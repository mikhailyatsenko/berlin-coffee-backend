import mongoose, { Document } from "mongoose";
import { IPlace } from "./Place";

export interface IInteraction extends Document {
  _id: mongoose.Types.ObjectId;
  /** Absent on guest interactions. Never set this to null: the partial index
   *  below matches on $exists, and null counts as existing. */
  userId?: mongoose.Types.ObjectId;
  /** Absent on interactions that belong to a registered user. */
  guestId?: string;
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
  isGoogleReview?: boolean;
}

const InteractionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  guestId: { type: String },
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
  isGoogleReview: { type: Boolean, default: false },
});

// Partial indexes so guest interactions (no userId) do not collide with each
// other, and account interactions (no guestId) do not collide either.
// Keep these in sync with scripts/migrateGuestIndexes.ts.
InteractionSchema.index(
  { userId: 1, placeId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } },
);
InteractionSchema.index(
  { guestId: 1, placeId: 1 },
  { unique: true, partialFilterExpression: { guestId: { $exists: true } } },
);

export default mongoose.model<IInteraction>("Interaction", InteractionSchema);
