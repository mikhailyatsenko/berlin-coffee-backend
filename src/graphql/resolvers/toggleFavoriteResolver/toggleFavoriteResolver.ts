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
      existingInteraction.isFavorite = !existingInteraction.isFavorite;
      await existingInteraction.save();
    } else {
      await Interaction.create({
        userId: user.id,
        placeId,
        isFavorite: true,
      });
    }

    return true;
  } catch (error) {
    console.error("Error toggling favorite:", error);
    return false;
  }
}
