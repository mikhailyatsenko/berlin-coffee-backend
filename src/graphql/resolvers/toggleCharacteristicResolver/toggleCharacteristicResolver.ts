import Interaction from "../../../models/Interaction.js";
import Place from "../../../models/Place.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { resolveReviewActor } from "../../../utils/reviewActor.js";
import { notFound } from "../../errors.js";
import type { MutationResolvers } from "../../generated/types.js";

export const toggleCharacteristicResolver: MutationResolvers["toggleCharacteristic"] =
  async (
    _parent,
    { placeId, characteristic, guestId, guestSecret },
    { user, guest, req },
  ) => {
    const actor = await resolveReviewActor(user, guest, {
      guestId,
      guestSecret,
    });

    const place = await Place.findById(placeId);
    if (!place) {
      throw notFound("Place not found");
    }
    const existingInteraction = await Interaction.findOne({
      ...actor.owner,
      placeId,
    });

    if (existingInteraction) {
      existingInteraction.characteristics[characteristic] =
        !existingInteraction.characteristics[characteristic];
      await existingInteraction.save();
    } else {
      if (actor.isGuest) {
        consumeRateLimit("guestReview", clientIp(req));
      }
      const newInteraction = new Interaction({
        ...actor.owner,
        placeId,
        characteristics: {
          [characteristic]: true,
        },
      });
      await newInteraction.save();
    }

    return {
      success: true,
    };
  };
