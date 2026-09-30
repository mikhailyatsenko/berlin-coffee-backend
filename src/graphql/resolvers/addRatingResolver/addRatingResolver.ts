import { getPlaceStats } from "../../../utils/placeStats.js";
import { resolveReviewActor } from "../../../utils/reviewActor.js";
import { upsertInteraction } from "../../../utils/upsertInteraction.js";
import {
  assertPlaceExists,
  assertRating,
} from "../../../utils/validateInput.js";
import type { MutationResolvers } from "../../generated/types.js";

export const addRatingResolver: MutationResolvers["addRating"] = async (
  _parent,
  { placeId, rating, guestId, guestSecret },
  { user, guest, req },
) => {
  assertRating(rating);
  const actor = await resolveReviewActor(user, guest, { guestId, guestSecret });
  await assertPlaceExists(placeId);

  const interaction = await upsertInteraction(
    actor,
    placeId,
    { $set: { date: new Date(), rating } },
    req,
  );
  const reviewId = interaction._id.toString();

  const { averageRating, ratingCount } = await getPlaceStats(placeId);

  return {
    averageRating,
    ratingCount,
    reviewId,
    userRating: rating,
  };
};
