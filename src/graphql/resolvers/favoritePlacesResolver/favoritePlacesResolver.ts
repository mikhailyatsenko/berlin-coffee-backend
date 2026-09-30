import { getFavoritePlacesWithStats } from "./services/favoritePlacesService.js";
import { requireUser } from "../../context.js";
import type { QueryResolvers } from "../../generated/types.js";

export const favoritePlacesResolver: QueryResolvers["favoritePlaces"] = async (
  _parent,
  _args,
  context,
) => {
  const user = requireUser(context);

  const { places, total } = await getFavoritePlacesWithStats(user.id);
  
  // Convert to simplified GraphQL format
  const formattedPlaces = places.map((place) => {
    return {
      id: place._id.toString(),
      name: place.properties.name || "",
      address: place.properties.address || "",
      image: place.properties.image || "",
      instagram: place.properties.instagram || "",
      averageRating: place.averageRating,
      isFavorite: place.isFavorite,
      neighborhood: place.properties.neighborhood || null,
      googleId: place.properties.googleId || null,
    };
  });

  return formattedPlaces;
};
