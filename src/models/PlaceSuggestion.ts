import mongoose, { Document } from "mongoose";

export type PlaceSuggestionStatus = "pending" | "published" | "rejected";

export interface IPlaceSuggestion extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  address: string;
  description?: string;
  instagram?: string;
  /** Absent for a User's suggestion. Never set this to null. */
  userId?: mongoose.Types.ObjectId;
  /** Absent for a suggestion that belongs to a registered user. */
  guestId?: string;
  /** Guests only, to tell them when the Place is added. Erased once decided. */
  guestEmail?: string;
  status: PlaceSuggestionStatus;
  /** ImageKit paths, in upload order: the source of truth for the suggestion's photos. */
  photos: string[];
  /**
   * Redundant with photos.length, kept only because it predates `photos` and
   * ticket 02's tests already read it. The one place that writes to `photos`
   * ($push) always updates this alongside it ($inc); nothing else should
   * write either field without doing the same.
   */
  photoCount: number;
  publishedPlaceId?: mongoose.Types.ObjectId;
  createdAt: Date;
  decidedAt?: Date;
}

const PlaceSuggestionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  description: { type: String },
  instagram: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  guestId: { type: String },
  guestEmail: { type: String },
  status: {
    type: String,
    enum: ["pending", "published", "rejected"],
    default: "pending",
    required: true,
  },
  photos: { type: [String], default: [] },
  photoCount: { type: Number, default: 0 },
  publishedPlaceId: { type: mongoose.Schema.Types.ObjectId, ref: "NewPlace" },
  createdAt: { type: Date, default: Date.now },
  decidedAt: { type: Date },
});

export default mongoose.model<IPlaceSuggestion>(
  "PlaceSuggestion",
  PlaceSuggestionSchema,
);
