import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import Place from "../../../models/Place.js";

export async function toggleFavoriteResolver(
  _: never,
  { placeId }: { placeId: string },
  { user }: { user: { id: string } },
) {
  if (!user) {
    throw new GraphQLError("Authentication required", {
      extensions: {
        code: "UNAUTHENTICATED",
        requiresLogin: true,
      },
    });
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

    if (existingInteraction) {
      // Если взаимодействие существует, просто обновляем isFavorite
      existingInteraction.isFavorite = !existingInteraction.isFavorite;
      await existingInteraction.save();
    } else {
      // Если взаимодействия нет, создаем новое
      await Interaction.create({
        userId: user.id,
        placeId,
        isFavorite: true,
      });
    }

    // Обновляем кэш для запроса GET_ALL_PLACES (это нужно будет сделать на фронте)
    return true; // Возвращаем true для успешного выполнения
  } catch (error) {
    console.error("Error toggling favorite:", error);
    return false; // Возвращаем false в случае ошибки
  }
}
