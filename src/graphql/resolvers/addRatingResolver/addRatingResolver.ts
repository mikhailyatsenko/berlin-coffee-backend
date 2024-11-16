import Interaction from "../../../models/Interaction.js";
import Place from "../../../models/Place.js";
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
    const place = await Place.findById(placeId);
    if (!place) {
      throw new GraphQLError("Place not found");
    }

    const interaction = await Interaction.findOne({
      userId: user.id,
      placeId,
    }).lean();
    const updateData = { date: new Date(), rating };

    if (interaction) {
      await Interaction.findOneAndUpdate(
        { userId: user.id, placeId },
        { $set: updateData },
        { new: true, lean: true },
      );
    } else {
      await Interaction.create({
        userId: user.id,
        placeId,
        ...updateData,
      });
    }

    // Выполняем агрегацию для получения среднего рейтинга и количества оценок
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
