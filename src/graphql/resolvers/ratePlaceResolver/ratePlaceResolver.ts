import { IUser } from "src/models/User.js";
import Place from "../../../models/Place.js";
import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import mongoose from "mongoose";

export async function ratePlaceResolver(
  _: never,
  { placeId, rating }: { placeId: string; rating: number },
  { user }: { user: IUser },
) {
  if (!user) {
    throw new GraphQLError("You must be logged in to rate a place");
  }
  try {
    const place = await Place.findById(placeId);
    if (!place) {
      throw new GraphQLError("Place not found");
    }

    await Interaction.findOneAndUpdate(
      { userId: user.id, placeId },
      {
        $set: { rating, date: new Date() },
        $setOnInsert: { userId: user.id, placeId },
      },
      { upsert: true, new: true },
    );

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
      id: place._id.toString(),
      averageRating: stats.averageRating,
      ratingCount: stats.ratingCount,
      userRating: rating,
    };
  } catch (error) {
    console.error("Error rating place:", error);
    throw new GraphQLError("Error rating place", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
