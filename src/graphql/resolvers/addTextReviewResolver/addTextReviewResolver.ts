import { Request } from "express";
import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";
import { IUser } from "../../../models/User.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { GuestContext } from "../../../utils/guestAuth.js";
import { GuestArgs, resolveReviewActor } from "../../../utils/reviewActor.js";

interface AddTextReviewArgs extends GuestArgs {
  placeId: string;
  text: string;
}

export async function addTextReviewResolver(
  _: never,
  { text, placeId, guestId, guestSecret }: AddTextReviewArgs,
  {
    user,
    guest,
    req,
  }: { user?: IUser | null; guest?: GuestContext; req?: Request },
) {
  const actor = await resolveReviewActor(user, guest, { guestId, guestSecret });

  try {
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
