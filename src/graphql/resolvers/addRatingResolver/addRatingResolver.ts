import Interaction from "../../../models/Interaction.js";
import mongoose from "mongoose";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { resolveReviewActor } from "../../../utils/reviewActor.js";
import type { MutationResolvers } from "../../generated/types.js";

export const addRatingResolver: MutationResolvers["addRating"] = async (
  _parent,
  { placeId, rating, guestId, guestSecret },
  { user, guest, req },
) => {
  const actor = await resolveReviewActor(user, guest, { guestId, guestSecret });

  const interaction = await Interaction.findOne({
    ...actor.owner,
    placeId,
  }).lean();

  // Only a first rating costs quota: a guest owns this document through its
  // secret and may revise it, the same as an account may.
  if (actor.isGuest && !interaction) {
    consumeRateLimit("guestReview", clientIp(req));
  }

  const updateData = { date: new Date(), rating };

  let reviewId: string | null = null;

  if (interaction) {
    await Interaction.findOneAndUpdate(
      { ...actor.owner, placeId },
      { $set: updateData },
      { new: true, lean: true },
    );
    reviewId = interaction._id.toString();
  } else {
    const newInteraction = await Interaction.create({
      ...actor.owner,
      placeId,
      ...updateData,
    });
    reviewId = newInteraction._id.toString();
  }

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
