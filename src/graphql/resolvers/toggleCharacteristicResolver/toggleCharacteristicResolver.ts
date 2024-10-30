import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import Place from "../../../models/Place.js";

export enum Characteristic {
  TastyFilterCoffee = "tastyFilterCoffee",
  PleasantAtmosphere = "pleasantAtmosphere",
  FriendlyStaff = "friendlyStaff",
  TastyDesserts = "tastyDesserts",
  GreatFood = "greatFood",
  ReasonablePrices = "reasonablePrices",
  HasWifi = "hasWifi",
}

export async function toggleCharacteristicResolver(
  _: never,
  {
    placeId,
    characteristic,
  }: { placeId: string; characteristic: Characteristic },
  { user }: { user?: { id?: string } },
) {
  if (!user) {
    throw new GraphQLError("Authentication required", {
      extensions: {
        code: "UNAUTHENTICATED",
        requiresLogin: true,
      },
    });
  }

  try {
    const place = await Place.findById(placeId);
    if (!place) {
      throw new GraphQLError("Place not found");
    }

    const existingInteraction = await Interaction.findOne({
      userId: user.id,
      placeId,
    });

    if (existingInteraction) {
      existingInteraction.characteristics[characteristic] =
        !existingInteraction.characteristics[characteristic];
      await existingInteraction.save();
    } else {
      const newInteraction = new Interaction({
        userId: user.id,
        placeId,
        characteristics: {
          [characteristic]: true,
        },
      });
      await newInteraction.save();
    }

    return true;
  } catch (error) {
    console.error("Error toggling characteristic:", error);
    return false;
  }
}
