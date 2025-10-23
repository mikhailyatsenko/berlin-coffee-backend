import { GraphQLError } from "graphql";
import { getFavoritePlacesWithStats } from "./services/favoritePlacesService.js";

export async function favoritePlacesResolver(
  _: never,
  __: never,
  { user }: { user?: { id: string } },
) {
  try {
    if (!user?.id) {
      throw new GraphQLError("Authentication required", {
        extensions: {
          code: "UNAUTHENTICATED",
        },
      });
    }

    const { places, total } = await getFavoritePlacesWithStats(user.id);
    
    // Convert to simplified GraphQL format
    const formattedPlaces = places.map((place) => {
      const averageRating = place.averageRating;
      return {
        id: place._id.toString(),
        name: place.properties.name || "",
        address: place.properties.address || "",
        image: place.properties.image || "",
        instagram: place.properties.instagram || "",
        averageRating: Number(averageRating.toFixed(1)),
        isFavorite: place.isFavorite,
        neighborhood: place.properties.neighborhood || null,
        googleId: place.properties.googleId || null,
      };
    });

    return formattedPlaces;
  } catch (error) {
    console.error("Error fetching favorite places:", error);
    throw new GraphQLError("Error fetching favorite places", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
