import { Request } from "express";
import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";
import { IUser } from "../../../models/User.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import {
  GuestArgs,
  rejectGuestOverwrite,
  resolveReviewActor,
} from "../../../utils/reviewActor.js";

interface AddTextReviewArgs extends GuestArgs {
  placeId: string;
  text: string;
  /** Deprecated: only the previous frontend build still sends this. */
  reviewImages?: number;
}

export async function addTextReviewResolver(
  _: never,
  { text, placeId, reviewImages, guestId, guestSecret }: AddTextReviewArgs,
  { user, req }: { user?: IUser | null; req?: Request },
) {
  const actor = await resolveReviewActor(user, { guestId, guestSecret });

  try {
    const interaction = await Interaction.findOne({
      ...actor.owner,
      placeId,
    }).lean();

    // A guest may fill in a review they have not written yet, but not replace
    // one — editing is what the sign-up prompt is for. Checked before anything
    // is created, so the client never uploads photos only to be refused.
    rejectGuestOverwrite(actor, Boolean(interaction?.reviewText));

    if (actor.isGuest && !interaction) {
      consumeRateLimit("guestReview", clientIp(req));
    }

    const updateData = {
      date: new Date(),
      reviewText: text,
      // Guests never take the legacy client-side upload path, so a counter from
      // them would be meaningless. Drop this branch once the old frontend build
      // is gone and the server owns the counter outright.
      ...(!actor.isGuest && reviewImages ? { reviewImages } : {}),
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
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error;
    }
    console.error("Error adding review or rating place:", error);
    throw new GraphQLError("Error adding review or rating place", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
