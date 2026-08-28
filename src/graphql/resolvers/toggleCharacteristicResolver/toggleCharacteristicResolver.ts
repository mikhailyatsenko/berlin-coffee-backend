import { Request } from "express";
import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import Place from "../../../models/Place.js";
import { IUser } from "../../../models/User.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { GuestContext } from "../../../utils/guestAuth.js";
import { GuestArgs, resolveReviewActor } from "../../../utils/reviewActor.js";

export type Characteristic =
  | "affordablePrices"
  | "pleasantAtmosphere"
  | "friendlyStaff"
  | "freeWifi"
  | "yummyEats"
  | "deliciousFilterCoffee"
  | "petFriendly"
  | "outdoorSeating";

interface ToggleCharacteristicArgs extends GuestArgs {
  placeId: string;
  characteristic: Characteristic;
}

export async function toggleCharacteristicResolver(
  _: never,
  { placeId, characteristic, guestId, guestSecret }: ToggleCharacteristicArgs,
  {
    user,
    guest,
    req,
  }: { user?: IUser | null; guest?: GuestContext; req?: Request },
) {
  const actor = await resolveReviewActor(user, guest, { guestId, guestSecret });

  try {
    const place = await Place.findById(placeId);
    if (!place) {
      throw new GraphQLError("Place not found");
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
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error;
    }
    console.error("Error toggling characteristic:", error);
    return false;
  }
}
