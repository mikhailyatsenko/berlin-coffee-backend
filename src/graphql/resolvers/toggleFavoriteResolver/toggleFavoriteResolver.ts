import Interaction from "../../../models/Interaction.js";
import Place from "../../../models/Place.js";
import { requireUser } from "../../context.js";
import { notFound } from "../../errors.js";
import type { MutationResolvers } from "../../generated/types.js";

export const toggleFavoriteResolver: MutationResolvers["toggleFavorite"] =
  async (_parent, { placeId }, context) => {
    const user = requireUser(context);

    const place = await Place.findById(placeId);
    if (!place) {
      throw notFound("Place not found");
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
  };
