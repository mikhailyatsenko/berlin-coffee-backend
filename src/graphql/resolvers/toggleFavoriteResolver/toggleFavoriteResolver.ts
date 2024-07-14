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
      __typename: "AuthenticationRequired",
      message: "You must be logged in to toggle favorite",
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
      id: place._id,
      isFavorite: updatedInteraction.isFavorite,
      favoriteCount,
    };
  } catch (error) {
    console.error("Error toggling favorite:", error);
    throw new GraphQLError("Error toggling favorite", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
