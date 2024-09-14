import mongoose from "mongoose";
import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";

export async function deleteReviewResolver(
  _: never,
  { reviewId }: { reviewId: string },
  context: { user: { id: string } },
) {
  if (!context.user) {
    return {
      success: false,
      message: "You must be logged in to delete a review",
    };
  }

  try {
    const interaction = await Interaction.findById(reviewId);

    if (!interaction || interaction.userId.toString() !== context.user.id) {
      return {
        success: false,
        message: "Review not found or you don't have permission to delete it",
      };
    }

    await Interaction.findOneAndDelete({
      _id: reviewId,
      userId: context.user.id,
    });

    const aggregationResult = await Interaction.aggregate([
      {
        $match: {
          placeId: new mongoose.Types.ObjectId(interaction.placeId), // Используем placeId из удаляемого отзыва
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
      reviewId: reviewId,
      averageRating: stats.averageRating.toFixed(1),
      ratingCount: stats.ratingCount,
    };
  } catch (error) {
    console.error("Error deleting review:", error);
    throw new GraphQLError("Error adding review or rating place");
  }
}
