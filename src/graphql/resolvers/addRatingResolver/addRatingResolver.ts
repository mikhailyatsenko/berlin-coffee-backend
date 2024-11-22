import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";
import mongoose from "mongoose";
import { IUser } from "src/models/User.js";

export async function addRatingResolver(
  _: never,
  { placeId, rating }: { placeId: string; rating: number },
  { user }: { user: IUser },
) {
  if (!user) {
    throw new GraphQLError("Authentication required", {
      extensions: {
        code: "UNAUTHENTICATED",
        requiresLogin: true,
      },
    });
  }

  try {
    const interaction = await Interaction.findOne({
      userId: user.id,
      placeId,
    }).lean();

    const updateData = { date: new Date(), rating };

    let reviewId: string | null = null;

    if (interaction) {
      await Interaction.findOneAndUpdate(
        { userId: user.id, placeId },
        { $set: updateData },
        { new: true, lean: true },
      );
      reviewId = interaction._id.toString();
    } else {
      const newInteraction = await Interaction.create({
        userId: user.id,
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

    return {
      averageRating: parseFloat(stats.averageRating.toFixed(1)),
      ratingCount: stats.ratingCount,
      reviewId,
      userRating: rating,
    };
  } catch (error) {
    console.error("Error adding rating:", error);
    throw new GraphQLError("Error adding rating", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
