import mongoose, { Document } from "mongoose";

export interface IInteraction extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  placeId: mongoose.Types.ObjectId;
  rating?: number;
  review?: string;
  isFavorite: boolean;
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
  date: { type: Date, default: Date.now },
});

InteractionSchema.index({ userId: 1, placeId: 1 }, { unique: true });

export default mongoose.model<IInteraction>("Interaction", InteractionSchema);
