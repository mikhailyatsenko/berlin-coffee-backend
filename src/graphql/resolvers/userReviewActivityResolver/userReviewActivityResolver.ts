import type mongoose from "mongoose";
import Interaction from "../../../models/Interaction.js";
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
      averageRating: number | null;
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
          averageRating: { $avg: "$rating" },
          allRatings: { $push: "$rating" },
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
      {
        $lookup: {
          from: "interactions",
          localField: "_id",
          foreignField: "placeId",
          as: "allInteractions",
        },
      },
      {
        $addFields: {
          averageRating: {
            $avg: "$allInteractions.rating",
          },
        },
      },
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
        // @ts-expect-error Ticket 21: `averageRating` is a Float; the string only works because the serializer coerces it.
        averageRating: interaction.averageRating
          ? interaction.averageRating.toFixed(1)
          : null,
        createdAt: interaction.reviews[0]?.date.toISOString(),
      }),
    );
  };
