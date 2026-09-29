import { resolveReviewActor } from "../../../utils/reviewActor.js";
import { upsertInteraction } from "../../../utils/upsertInteraction.js";
import {
  assertPlaceExists,
  assertReviewText,
} from "../../../utils/validateInput.js";
import type { MutationResolvers } from "../../generated/types.js";

export const addTextReviewResolver: MutationResolvers["addTextReview"] = async (
  _parent,
  { text, placeId, guestId, guestSecret },
  { user, guest, req },
) => {
  assertReviewText(text);
  const actor = await resolveReviewActor(user, guest, { guestId, guestSecret });
  await assertPlaceExists(placeId);

  const interaction = await upsertInteraction(
    actor,
    placeId,
    { $set: { date: new Date(), reviewText: text } },
    req,
  );

  return {
    reviewId: interaction._id.toString(),
    text,
  };
};
