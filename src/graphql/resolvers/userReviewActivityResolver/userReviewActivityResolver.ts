import type mongoose from "mongoose";
import Interaction from "../../../models/Interaction.js";
import { placeStatsStages } from "../../../utils/placeStats.js";
import { requireUser } from "../../context.js";
import type {
  QueryResolvers,
  UserReviewActivity,
} from "../../generated/types.js";

export const userReviewActivityResolver: QueryResolvers["userReviewActivity"] =
  async (_parent, _args, context) => {
    const user = requireUser(context);

    const activity = await Interaction.aggregate<{
      _id: mongoose.Types.ObjectId;
      placeName: string;
      averageRating: number;
      ratingCount: number;
      reviews: { rating?: number; reviewText?: string; date: Date }[];
    }>([
      {
        $match: {
          userId: user._id,
          $or: [
            { reviewText: { $exists: true, $ne: null } },
            { rating: { $exists: true } },
          ],
        },
      },
      {
        $lookup: {
          from: "newplaces",
          localField: "placeId",
          foreignField: "_id",
          as: "place",
        },
      },
      {
        $unwind: "$place",
      },
      {
        $group: {
          _id: "$place._id",
          placeName: { $first: "$place.properties.name" },
          reviews: {
            $push: {
              id: "$_id",
              rating: "$rating",
              reviewText: "$reviewText",
              date: "$date",
            },
          },
        },
      },
      ...placeStatsStages(),
      {
        $sort: {
          "reviews.date": -1,
        },
      },
    ]);

    return activity.map(
      (interaction): UserReviewActivity => ({
        rating: interaction.reviews[0]?.rating,
        reviewText: interaction.reviews[0]?.reviewText,
        placeId: interaction._id.toString(),
        placeName: interaction.placeName,
        averageRating: interaction.ratingCount
          ? interaction.averageRating
          : null,
        createdAt: interaction.reviews[0]?.date.toISOString(),
      }),
    );
  };
