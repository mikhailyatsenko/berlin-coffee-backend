import { Request } from "express";
import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";
import mongoose from "mongoose";
import { IUser } from "../../../models/User.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import {
  GuestArgs,
  rejectGuestOverwrite,
  resolveReviewActor,
} from "../../../utils/reviewActor.js";

interface AddRatingArgs extends GuestArgs {
  placeId: string;
  rating: number;
}

export async function addRatingResolver(
  _: never,
  { placeId, rating, guestId, guestSecret }: AddRatingArgs,
  { user, req }: { user?: IUser | null; req?: Request },
) {
  const actor = await resolveReviewActor(user, { guestId, guestSecret });

  try {
    const interaction = await Interaction.findOne({
      ...actor.owner,
      placeId,
    }).lean();

    // Guests get one rating per place; changing it is what signing up is for.
    rejectGuestOverwrite(actor, Boolean(interaction?.rating));

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
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error;
    }
    console.error("Error adding rating:", error);
    throw new GraphQLError("Error adding rating", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
