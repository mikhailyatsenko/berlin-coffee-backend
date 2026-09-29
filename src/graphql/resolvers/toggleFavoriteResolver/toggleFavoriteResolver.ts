import Place from "../../../models/Place.js";
import { userActor } from "../../../utils/reviewActor.js";
import { toggleInteractionField } from "../../../utils/upsertInteraction.js";
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

    await toggleInteractionField(
      userActor(user),
      placeId,
      "isFavorite",
      context.req,
    );

    return true;
  };
