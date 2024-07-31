import Place, { IPlace } from "../../../models/Place.js";
import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";

export async function getAllPlacesResolver(
  _: never,
  __: never,
  { user }: { user?: { id: string } },
) {
  try {
    const places = await Place.find().lean();

    const placesWithStats = await Promise.all(
      places.map(async (place: IPlace) => {
        const interactions = await Interaction.find({ placeId: place._id });

        const aggregationResult = await Interaction.aggregate([
          {
            $match: {
              placeId: place._id,
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

        const stats = aggregationResult[0] || {
          averageRating: 0,
          ratingCount: 0,
        };

        const reviews = interactions
          .filter((i) => i.review)
          .map((i) => ({
            id: i._id.toString(),
            text: i.review!,
            userId: i.userId.toString(),
            placeId: i.placeId.toString(),
            createdAt: i.date.toISOString(),
          }));

        const favoriteCount = interactions.filter((i) => i.isFavorite).length;

        // Проверяем, добавлено ли место в избранное текущим пользователем
        const isFavorite = user
          ? interactions.some(
              (i) => i.userId.toString() === user.id && i.isFavorite,
            )
          : false;

        return {
          id: place._id.toString(),
          ...place,
          properties: {
            id: place._id.toString(),
            ...place.properties,
            averageRating:
              stats.averageRating !== null
                ? Number(stats.averageRating.toFixed(2))
                : null,
            ratingCount: stats.ratingCount,
            favoriteCount,
            isFavorite,
            reviews,
          },
        };
      }),
    );

    return placesWithStats;
  } catch (error) {
    console.error("Error fetching places:", error);
    throw new GraphQLError("Error fetching places", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
