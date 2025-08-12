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
    googleReview?: {
      text: string;
      stars: number;
      publishedAtDate: string;
    } | null;
    neighborhood?: string;
  };
  favoriteCount: number;
  averageRating: number;
  ratingCount: number;
  isFavorite: boolean;
}

/**
 * Получает все места с облегчённой статистикой через агрегацию MongoDB
 * @param userId - ID пользователя для определения его взаимодействий
 * @returns Массив мест с агрегированной статистикой
 */
export async function getPlacesWithStats(
  userId?: string,
): Promise<PlaceWithStats[]> {
  return Place.aggregate([
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
        "properties.additionalInfo": 0,
        "properties.openingHours": 0,
        "properties.phone": 0,
        "properties.website": 0,
      },
    },
  ]);
}
