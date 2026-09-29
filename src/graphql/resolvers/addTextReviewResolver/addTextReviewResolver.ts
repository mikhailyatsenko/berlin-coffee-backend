import Interaction from "../../../models/Interaction.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { resolveReviewActor } from "../../../utils/reviewActor.js";
import type { MutationResolvers } from "../../generated/types.js";

export const addTextReviewResolver: MutationResolvers["addTextReview"] = async (
  _parent,
  { text, placeId, guestId, guestSecret },
  { user, guest, req },
) => {
  const actor = await resolveReviewActor(user, guest, { guestId, guestSecret });

  const interaction = await Interaction.findOne({
    ...actor.owner,
    placeId,
  }).lean();

  // Only a first review costs quota: a guest owns this document through its
  // secret and may rewrite it, the same as an account may.
  if (actor.isGuest && !interaction) {
    consumeRateLimit("guestReview", clientIp(req));
  }

  const updateData = {
    date: new Date(),
    reviewText: text,
  };

  let reviewId: string | null = null;

  if (interaction) {
    await Interaction.findOneAndUpdate(
      { ...actor.owner, placeId },
      { $set: updateData },
      { new: true, lean: true },
    );
    reviewId = interaction._id.toString();
  } else {
    const newInteraction = await Interaction.create({
      ...actor.owner,
      placeId,
      ...updateData,
    });

    reviewId = newInteraction._id.toString();
  }

  return {
    reviewId,
    text,
  };
};
