import Place from "../../../models/Place.js";
import { resolveReviewActor } from "../../../utils/reviewActor.js";
import { toggleInteractionField } from "../../../utils/upsertInteraction.js";
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
    await toggleInteractionField(
      actor,
      placeId,
      `characteristics.${characteristic}`,
      req,
    );

    return {
      success: true,
    };
  };
