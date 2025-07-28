import { GraphQLError } from "graphql";
import { getPlacesWithStats } from "./services/placeAggregationService.js";

export async function getAllPlacesResolver(
  _: never,
  __: never,
  { user }: { user?: { id: string } },
) {
  try {
    // Получаем места с полной статистикой через сервис
    const placesWithStats = await getPlacesWithStats(user?.id);

    // Преобразуем в формат GraphQL
    return placesWithStats.map((place) => {
      // Получаем рейтинг из googleReview, если есть
      const googleStars = place.properties?.googleReview?.stars;
      let averageRating = place.averageRating;
      let ratingCount = place.ratingCount;
      if (typeof googleStars === "number") {
        averageRating =
          (place.averageRating * place.ratingCount + googleStars) /
          (place.ratingCount + 1);
        ratingCount = place.ratingCount + 1;
      }
      return {
        id: place._id.toString(),
        type: place.type || "Feature",
        geometry: {
          type: place.geometry.type || "Point",
          coordinates: place.geometry.coordinates,
        },
        properties: {
          id: place._id.toString(),
          name: place.properties.name || "",
          description: place.properties.description || "",
          address: place.properties.address || "",
          image: place.properties.image || "",
          instagram: place.properties.instagram || "",
          averageRating: Number(averageRating.toFixed(1)),
          ratingCount: ratingCount,
          characteristicCounts: place.characteristicCounts,
          favoriteCount: place.favoriteCount,
          isFavorite: place.isFavorite,
          reviews: [], // Пустой массив для reviews
          additionalInfo: place.properties.additionalInfo || {},
          googleReview: place.properties.googleReview || null,
          neighborhood: place.properties.neighborhood || null,
          openingHours: place.properties.openingHours || [],
          phone: place.properties.phone || null,
          website: place.properties.website || null,
        },
      };
    });
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
