import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import Place from "../../../models/Place.js";

export async function toggleFavoriteResolver(
  _: never,
  { placeId }: { placeId: string },
  { user }: { user: { id: string } },
) {
  if (!user) {
    return {
      success: false, // Важно: устанавливаем success в false, а не null
      message: "You must be logged in to toggle favorite",
      requiresAuth: true,
      place: null,
    };
  }

  try {
    const place = await Place.findById(placeId);
    if (!place) {
      throw new GraphQLError("Place not found");
    }

    const existingInteraction = await Interaction.findOne({
      userId: user.id,
      placeId,
    });

    let updatedInteraction;

    if (existingInteraction) {
      // Если взаимодействие существует, просто обновляем isFavorite
      existingInteraction.isFavorite = !existingInteraction.isFavorite;
      updatedInteraction = await existingInteraction.save();
    } else {
      // Если взаимодействия нет, создаем новое
      updatedInteraction = await Interaction.create({
        userId: user.id,
        placeId,
        isFavorite: true,
      });
    }

    // Пересчитываем количество избранных для места
    const favoriteCount = await Interaction.countDocuments({
      placeId,
      isFavorite: true,
    });

    return {
      success: true,
      message: "Favorite toggled successfully",
      requiresAuth: false,
      place: {
        id: place._id,
        isFavorite: updatedInteraction.isFavorite,
        favoriteCount,
      },
    };
  } catch (error) {
    console.error("Error toggling favorite:", error);
    return {
      success: false,
      message: "Error toggling favorite",
      requiresAuth: false,
      place: null,
    };
  }
}
