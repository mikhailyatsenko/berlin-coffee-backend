import Interaction from "../../../models/Interaction.js";
import mongoose from "mongoose";
import { resolveReviewActor } from "../../../utils/reviewActor.js";
import { upsertInteraction } from "../../../utils/upsertInteraction.js";
import {
  assertPlaceExists,
  assertRating,
} from "../../../utils/validateInput.js";
import type { MutationResolvers } from "../../generated/types.js";

export const addRatingResolver: MutationResolvers["addRating"] = async (
  _parent,
  { placeId, rating, guestId, guestSecret },
  { user, guest, req },
) => {
  assertRating(rating);
  const actor = await resolveReviewActor(user, guest, { guestId, guestSecret });
  await assertPlaceExists(placeId);

  const interaction = await upsertInteraction(
    actor,
    placeId,
    { $set: { date: new Date(), rating } },
    req,
  );
  const reviewId = interaction._id.toString();

  const aggregationResult = await Interaction.aggregate([
    {
      $match: {
        placeId: new mongoose.Types.ObjectId(placeId),
        rating: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  const stats = aggregationResult[0] || { averageRating: 0, ratingCount: 0 };

  const averageRating = stats.averageRating || 0;
  const ratingCount = stats.ratingCount || 0;

  return {
    averageRating: parseFloat(averageRating.toFixed(1)),
    ratingCount,
    reviewId,
    userRating: rating,
  };
};
