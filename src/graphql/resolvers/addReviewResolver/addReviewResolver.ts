import Interaction from "../../../models/Interaction.js";
import Place from "../../../models/Place.js";
import { GraphQLError } from "graphql";
// import mongoose from "mongoose";

export async function addReviewResolver(
  _: never,
  { placeId, text }: { placeId: string; text: string },
  context: { user: { id: string } },
) {
  if (!context.user) {
    throw new GraphQLError("You must be logged in to add a review");
  }

  try {
    const place = await Place.findById(placeId);
    if (!place) {
      throw new GraphQLError("Place not found");
    }

    let interaction = await Interaction.findOne({
      userId: context.user.id,
      placeId: placeId,
    });

    if (interaction) {
      // Обновляем существующее взаимодействие
      interaction.review = text;
      interaction.date = new Date();
      await interaction.save();
    } else {
      // Создаем новое взаимодействие
      interaction = new Interaction({
        userId: context.user.id,
        placeId: placeId,
        review: text,
      });
      await interaction.save();
    }

    return {
      id: interaction._id.toString(),
      userId: interaction.userId.toString(),
      placeId: interaction.placeId.toString(),
      rating: interaction.rating,
      review: interaction.review,
      isFavorite: interaction.isFavorite,
      date: interaction.date.toISOString(),
    };
  } catch (error) {
    console.error("Error adding review:", error);
    throw new GraphQLError("Error adding review", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
