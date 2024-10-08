import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import { IUser } from "src/models/User.js";

export async function getUserReviewActivityResolver(
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
              { review: { $exists: true, $ne: null } },
              { rating: { $exists: true } },
            ],
          },
        },
        {
          $lookup: {
            from: "places", // Имя коллекции мест
            localField: "placeId",
            foreignField: "_id",
            as: "place",
          },
        },
        {
          $unwind: "$place", // Разворачиваем массив мест
        },
        {
          $group: {
            _id: "$place._id",
            placeName: { $first: "$place.properties.name" }, // Название места
            averageRating: { $avg: "$rating" }, // Средний рейтинг текущего пользователя (неправильно)
            allRatings: { $push: "$rating" }, // Все рейтинги для дальнейшей обработки
            reviews: {
              $push: {
                id: "$_id",
                rating: "$rating",
                review: "$review",
                date: "$date",
              },
            },
          },
        },
        {
          $lookup: {
            from: "interactions", // Имя коллекции интеракций
            localField: "_id",
            foreignField: "placeId",
            as: "allInteractions",
          },
        },
        {
          $addFields: {
            averageRating: {
              $avg: "$allInteractions.rating", // Вычисляем общий средний рейтинг
            },
          },
        },
        {
          $sort: {
            "reviews.date": -1, // Сортировка по дате после группировки
          },
        },
      ]);

      return activity.map((interaction) => ({
        id: interaction.reviews[0]?.id,
        rating: interaction.reviews[0]?.rating,
        review: interaction.reviews[0]?.review,
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
  return null;
}
