import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import { IUser } from "src/models/User.js";

export async function userReviewActivityResolver(
  _: never,
  __: never,
  { user }: { user: IUser },
) {
  if (user) {
    try {
      const activity = await Interaction.aggregate([
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

      return activity.map((interaction) => ({
        rating: interaction.reviews[0]?.rating,
        reviewText: interaction.reviews[0]?.reviewText,
        placeId: interaction._id,
        placeName: interaction.placeName,
        averageRating: interaction.averageRating
          ? interaction.averageRating.toFixed(1)
          : null,
        createdAt: interaction.reviews[0]?.date.toISOString(),
      }));
    } catch (error) {
      console.error("Error fetching user interactions:", error);
      throw new GraphQLError("Error fetching user interactions", {
        extensions: {
          code: "INTERNAL_SERVER_ERROR",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return [];
}
