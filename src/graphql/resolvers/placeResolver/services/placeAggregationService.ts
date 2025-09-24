import Place from "../../../../models/Place.js";
import mongoose from "mongoose";

export interface PlaceWithStats {
  _id: mongoose.Types.ObjectId;
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name: string;
    description: string;
    address: string;
    image: string;
    instagram: string;
    additionalInfo?: Record<string, { [key: string]: boolean }[]>;
    googleId?: string | null;
    neighborhood?: string;
    openingHours?: { day: string; hours: string }[];
    phone?: string | null;
    website?: string | null;
  };
  characteristicCounts: {
    deliciousFilterCoffee: { pressed: boolean; count: number };
    pleasantAtmosphere: { pressed: boolean; count: number };
    friendlyStaff: { pressed: boolean; count: number };
    freeWifi: { pressed: boolean; count: number };
    yummyEats: { pressed: boolean; count: number };
    affordablePrices: { pressed: boolean; count: number };
    petFriendly: { pressed: boolean; count: number };
    outdoorSeating: { pressed: boolean; count: number };
  };
  favoriteCount: number;
  averageRating: number;
  ratingCount: number;
  isFavorite: boolean;
}

export async function getPlaceWithStatsById(
  placeId: string,
  userId?: string,
): Promise<PlaceWithStats | null> {
  const [place] = await Place.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(placeId) } },
    {
      $lookup: {
        from: "interactions",
        localField: "_id",
        foreignField: "placeId",
        as: "interactions",
      },
    },
    {
      $addFields: {
        characteristicCounts: {
          deliciousFilterCoffee: { pressed: false, count: 0 },
          pleasantAtmosphere: { pressed: false, count: 0 },
          friendlyStaff: { pressed: false, count: 0 },
          freeWifi: { pressed: false, count: 0 },
          yummyEats: { pressed: false, count: 0 },
          affordablePrices: { pressed: false, count: 0 },
          petFriendly: { pressed: false, count: 0 },
          outdoorSeating: { pressed: false, count: 0 },
        },
        favoriteCount: {
          $size: {
            $filter: {
              input: "$interactions",
              cond: { $eq: ["$$this.isFavorite", true] },
            },
          },
        },
        userInteractions: {
          $filter: {
            input: "$interactions",
            cond: {
              $eq: [
                "$$this.userId",
                userId ? new mongoose.Types.ObjectId(userId) : null,
              ],
            },
          },
        },
      },
    },
    {
      $addFields: {
        "characteristicCounts.deliciousFilterCoffee.count": {
          $size: {
            $filter: {
              input: "$interactions",
              cond: {
                $eq: ["$$this.characteristics.deliciousFilterCoffee", true],
              },
            },
          },
        },
        "characteristicCounts.pleasantAtmosphere.count": {
          $size: {
            $filter: {
              input: "$interactions",
              cond: {
                $eq: ["$$this.characteristics.pleasantAtmosphere", true],
              },
            },
          },
        },
        "characteristicCounts.friendlyStaff.count": {
          $size: {
            $filter: {
              input: "$interactions",
              cond: { $eq: ["$$this.characteristics.friendlyStaff", true] },
            },
          },
        },
        "characteristicCounts.freeWifi.count": {
          $size: {
            $filter: {
              input: "$interactions",
              cond: { $eq: ["$$this.characteristics.freeWifi", true] },
            },
          },
        },
        "characteristicCounts.yummyEats.count": {
          $size: {
            $filter: {
              input: "$interactions",
              cond: { $eq: ["$$this.characteristics.yummyEats", true] },
            },
          },
        },
        "characteristicCounts.affordablePrices.count": {
          $size: {
            $filter: {
              input: "$interactions",
              cond: {
                $eq: ["$$this.characteristics.affordablePrices", true],
              },
            },
          },
        },
        "characteristicCounts.petFriendly.count": {
          $size: {
            $filter: {
              input: "$interactions",
              cond: { $eq: ["$$this.characteristics.petFriendly", true] },
            },
          },
        },
        "characteristicCounts.outdoorSeating.count": {
          $size: {
            $filter: {
              input: "$interactions",
              cond: { $eq: ["$$this.characteristics.outdoorSeating", true] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        "characteristicCounts.deliciousFilterCoffee.pressed": {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: {
                        $eq: [
                          "$$this.characteristics.deliciousFilterCoffee",
                          true,
                        ],
                      },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
        "characteristicCounts.pleasantAtmosphere.pressed": {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: {
                        $eq: [
                          "$$this.characteristics.pleasantAtmosphere",
                          true,
                        ],
                      },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
        "characteristicCounts.friendlyStaff.pressed": {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: {
                        $eq: ["$$this.characteristics.friendlyStaff", true],
                      },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
        "characteristicCounts.freeWifi.pressed": {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: {
                        $eq: ["$$this.characteristics.freeWifi", true],
                      },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
        "characteristicCounts.yummyEats.pressed": {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: {
                        $eq: ["$$this.characteristics.yummyEats", true],
                      },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
        "characteristicCounts.affordablePrices.pressed": {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: {
                        $eq: ["$$this.characteristics.affordablePrices", true],
                      },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
        "characteristicCounts.petFriendly.pressed": {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: {
                        $eq: ["$$this.characteristics.petFriendly", true],
                      },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
        "characteristicCounts.outdoorSeating.pressed": {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: {
                        $eq: ["$$this.characteristics.outdoorSeating", true],
                      },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $lookup: {
        from: "interactions",
        localField: "_id",
        foreignField: "placeId",
        pipeline: [
          { $match: { rating: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: null,
              averageRating: { $avg: "$rating" },
              ratingCount: { $sum: 1 },
            },
          },
        ],
        as: "ratingStats",
      },
    },
    {
      $addFields: {
        averageRating: {
          $ifNull: [{ $arrayElemAt: ["$ratingStats.averageRating", 0] }, 0],
        },
        ratingCount: {
          $ifNull: [{ $arrayElemAt: ["$ratingStats.ratingCount", 0] }, 0],
        },
        isFavorite: {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: { $eq: ["$$this.isFavorite", true] },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        interactions: 0,
        userInteractions: 0,
        ratingStats: 0,
      },
    },
  ]);

  return place ?? null;
} 