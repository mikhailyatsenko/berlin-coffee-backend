import { GraphQLError } from "graphql";
import { getPlacesWithStats } from "./services/placeAggregationService.js";

interface PlacesResolverArgs {
  limit?: number | null;
  offset?: number;
}

export async function placesResolver(
  _: never,
  { limit, offset = 0 }: PlacesResolverArgs,
  { user }: { user?: { id: string } },
) {
  try {
    const resolvedLimit = typeof limit === "number" ? limit : undefined;
    const { places, total } = await getPlacesWithStats(
      user?.id,
      resolvedLimit,
      offset,
    );
    // Convert to GraphQL format
    const formattedPlaces = places.map((place) => {
      const averageRating = place.averageRating;
      const ratingCount = place.ratingCount;
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
          // images: null, // null for places list
          instagram: place.properties.instagram || "",
          averageRating: Number(averageRating.toFixed(1)),
          ratingCount: ratingCount,
          favoriteCount: place.favoriteCount,
          isFavorite: place.isFavorite,
          googleId: place.properties.googleId || null,
          neighborhood: place.properties.neighborhood || null,
        },
      };
    });

    return {
      places: formattedPlaces,
      total,
    };
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