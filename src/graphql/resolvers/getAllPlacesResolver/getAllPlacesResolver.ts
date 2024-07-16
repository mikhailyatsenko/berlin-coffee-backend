import Place, { IPlace } from "../../../models/Place.js";
import Interaction, { IInteraction } from "../../../models/Interaction.js";
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

        const ratings = interactions
          .filter(
            (i): i is IInteraction & { rating: number } =>
              i.rating != null && typeof i.rating === "number",
          )
          .map((i) => i.rating);

        const averageRating =
          ratings.length > 0
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : null;

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
          ...place,
          properties: {
            id: place._id.toString(),
            ...place.properties,
            averageRating:
              averageRating !== null ? Number(averageRating.toFixed(2)) : null,
            ratingCount: ratings.length,
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
