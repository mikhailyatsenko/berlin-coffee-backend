import Place, { IPlace } from "../../../models/Place.js";
import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";

interface CharacteristicData {
  pressed: boolean;
  count: number;
}

interface ICharacteristicCounts {
  deliciousFilterCoffee: CharacteristicData;
  pleasantAtmosphere: CharacteristicData;
  friendlyStaff: CharacteristicData;
  freeWifi: CharacteristicData;
  yummyEats: CharacteristicData;
  affordablePrices: CharacteristicData;
  petFriendly: CharacteristicData;
  outdoorSeating: CharacteristicData;
}

export async function getAllPlacesResolver(
  _: never,
  __: never,
  { user }: { user?: { id: string } },
) {
  try {
    const places = await Place.find().lean();

    const placesWithStats = await Promise.all(
      places.map(async (place: IPlace) => {
        const interactions = await Interaction.find({ placeId: place._id });

        const characteristicCounts: ICharacteristicCounts = {
          pleasantAtmosphere: { pressed: false, count: 0 },
          friendlyStaff: { pressed: false, count: 0 },
          affordablePrices: { pressed: false, count: 0 },
          yummyEats: { pressed: false, count: 0 },
          deliciousFilterCoffee: { pressed: false, count: 0 },
          freeWifi: { pressed: false, count: 0 },
          petFriendly: { pressed: false, count: 0 },
          outdoorSeating: { pressed: false, count: 0 },
        };

        interactions.forEach((interaction) => {
          for (const key in interaction.characteristics) {
            if (
              key in characteristicCounts &&
              interaction.characteristics[key as keyof ICharacteristicCounts]
            ) {
              characteristicCounts[key as keyof ICharacteristicCounts].count +=
                1;
            }
          }

          if (user && interaction.userId.toString() === user.id) {
            for (const key in characteristicCounts) {
              if (key in interaction.characteristics) {
                characteristicCounts[
                  key as keyof ICharacteristicCounts
                ].pressed =
                  interaction.characteristics[
                    key as keyof ICharacteristicCounts
                  ];
              }
            }
          }
        });

        const aggregationResult = await Interaction.aggregate([
          {
            $match: {
              placeId: place._id,
              rating: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: null,
              averageRating: { $avg: "$rating" },
              ratingCount: { $sum: 1 },
            },
          },
        ]);

        const stats = aggregationResult[0] || {
          averageRating: 0,
          ratingCount: 0,
        };

        const favoriteCount = interactions.filter((i) => i.isFavorite).length;

        return {
          id: place._id.toString(),
          ...place,
          properties: {
            id: place._id.toString(),
            ...place.properties,
            averageRating:
              stats.averageRating !== null
                ? Number(stats.averageRating.toFixed(1))
                : null,
            ratingCount: stats.ratingCount,
            characteristicCounts,
            favoriteCount,
            isFavorite: user
              ? interactions.some(
                  (i) => i.userId.toString() === user.id && i.isFavorite,
                )
              : false,
          },
        };
      }),
    );
    return placesWithStats;
  } catch (error) {
    console.error("Error fetching places:", error);
    throw new GraphQLError("Error fetching places", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
