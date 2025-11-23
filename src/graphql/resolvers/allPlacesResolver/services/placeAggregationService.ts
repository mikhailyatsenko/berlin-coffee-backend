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
    googleId?: string | null;
    neighborhood?: string;
  };
  favoriteCount: number;
  averageRating: number;
  ratingCount: number;
  isFavorite: boolean;
}

/**
 * Получает места с облегчённой статистикой через агрегацию MongoDB
 * @param userId - ID пользователя для определения его взаимодействий
 * @param limit - Количество записей для возврата
 * @param offset - Смещение (пропуск) записей
 * @returns Объект с массивом мест и общим количеством
 */
export async function getPlacesWithStats(
  userId?: string,
  limit?: number,
  offset: number = 0,
): Promise<{ places: PlaceWithStats[]; total: number }> {
  // Get the total number of places
  const total = await Place.countDocuments();

  // Агрегация с пагинацией
  // Calculate rating, sort, then apply pagination
  const aggregationPipeline: mongoose.PipelineStage[] = [
    // Calculate statistics by interactions
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
    // Sort by rating from highest to lowest
    {
      $sort: { averageRating: -1 },
    },
    // Apply pagination after sorting
    { $skip: offset },
  ];

  if (typeof limit === "number") {
    aggregationPipeline.push({ $limit: limit });
  }

  aggregationPipeline.push({
    $project: {
      interactions: 0,
      userInteractions: 0,
      ratingStats: 0,
      "properties.additionalInfo": 0,
      "properties.openingHours": 0,
      "properties.phone": 0,
      "properties.website": 0,
    },
  });

  const places = await Place.aggregate(aggregationPipeline);

  return { places, total };
}