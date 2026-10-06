import type { Place, QueryResolvers } from "../../generated/types.js";
import { resolveActorRef } from "../../../utils/reviewActor.js";
import { getPlacesWithStats } from "./services/placeAggregationService.js";

export const placesResolver: QueryResolvers["places"] = async (
  _parent,
  { limit, offset },
  { user, guest },
) => {
  const resolvedLimit = typeof limit === "number" ? limit : undefined;
  const { places, total } = await getPlacesWithStats(
    resolveActorRef(user, guest),
    resolvedLimit,
    offset,
  );
  // Convert to GraphQL format
  const formattedPlaces = places.map((place): Place => {
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
        averageRating: place.averageRating,
        ratingCount: place.ratingCount,
        favoriteCount: place.favoriteCount,
        isFavorite: place.isFavorite,
        googleId: place.properties.googleId || null,
        neighborhood: place.properties.neighborhood || null,
        shortlistIds: [],
      },
    };
  });

  return {
    places: formattedPlaces,
    total,
  };
};