import Interaction from "../../../models/Interaction.js";
import Place from "../../../models/Place.js";
import { type Context, requireUser } from "../../context.js";
import { notFound } from "../../errors.js";

export async function toggleFavoriteResolver(
  _: never,
  { placeId }: { placeId: string },
  context: Context,
) {
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
}
