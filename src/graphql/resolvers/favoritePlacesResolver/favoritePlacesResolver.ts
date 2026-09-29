import { getFavoritePlacesWithStats } from "./services/favoritePlacesService.js";
import { type Context, requireUser } from "../../context.js";

export async function favoritePlacesResolver(
  _: never,
  __: never,
  context: Context,
) {
  const user = requireUser(context);

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
}
